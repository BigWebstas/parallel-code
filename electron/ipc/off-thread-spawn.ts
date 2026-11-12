import { EventEmitter } from 'events';
import { spawn, type SpawnOptions } from 'child_process';
import { Worker } from 'worker_threads';

// Launching a process blocks the calling thread, and on Windows that costs
// 0.5-2 s here (endpoint-security scanning). Run on the main thread it froze
// input routing for that long on every Ask-about-code request. In the desktop
// app on Windows the launch happens on a short-lived worker thread instead;
// everywhere else (other platforms, unit tests) the plain `spawn` is used.

/** The part of a child process the ask-code callers use. */
export interface StreamedProcess {
  stdout: { on(event: 'data', cb: (chunk: Buffer) => void): unknown } | null;
  stderr: { on(event: 'data', cb: (chunk: Buffer) => void): unknown } | null;
  stdin: {
    on(event: 'error', cb: (err: Error) => void): unknown;
    end(data: string): unknown;
  } | null;
  on(event: 'close', cb: (code: number | null) => void): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
  kill(signal?: NodeJS.Signals): unknown;
}

export interface OffThreadSpawnOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

const WORKER_SOURCE = `
const { parentPort } = require('worker_threads');
const { spawn } = require('child_process');
let child;
const send = (m) => parentPort.postMessage(m);
parentPort.on('message', (m) => {
  if (m.type === 'start') {
    try {
      child = spawn(m.file, m.args, {
        cwd: m.cwd,
        env: m.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (e) {
      send({ type: 'error', message: String((e && e.message) || e) });
      process.exit(0);
      return;
    }
    child.stdout.on('data', (data) => send({ type: 'stdout', data }));
    child.stderr.on('data', (data) => send({ type: 'stderr', data }));
    child.stdin.on('error', (e) => send({ type: 'stdin-error', message: e.message }));
    child.on('error', (e) => send({ type: 'error', message: e.message }));
    child.on('close', (code) => {
      send({ type: 'close', code });
      process.exit(0);
    });
    child.stdin.end(m.input);
  } else if (m.type === 'kill' && child) {
    child.kill(m.signal);
  }
});
`;

type WorkerMessage =
  | { type: 'stdout' | 'stderr'; data: Uint8Array }
  | { type: 'stdin-error' | 'error'; message: string }
  | { type: 'close'; code: number | null };

/** A child process whose launch and I/O pump run on a worker thread. */
class OffThreadProcess extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly stdin = Object.assign(new EventEmitter(), {
    end: (data: string) => this.worker.postMessage({ type: 'start', ...this.launch, input: data }),
  });
  private finished = false;

  constructor(
    private readonly launch: { file: string; args: string[]; cwd?: string; env?: object },
    private readonly worker: Worker,
  ) {
    super();
    worker.on('message', (m: WorkerMessage) => this.handle(m));
    worker.on('error', (err: unknown) =>
      this.fail(err instanceof Error ? err : new Error(String(err))),
    );
    // A worker that dies without reporting leaves the request hanging otherwise.
    worker.on('exit', () => this.fail(new Error('The process launcher exited unexpectedly.')));
  }

  private fail(err: Error): void {
    if (this.finished) return;
    this.finished = true;
    this.emit('error', err);
  }

  private handle(m: WorkerMessage): void {
    switch (m.type) {
      case 'stdout':
        this.stdout.emit('data', Buffer.from(m.data));
        break;
      case 'stderr':
        this.stderr.emit('data', Buffer.from(m.data));
        break;
      case 'stdin-error':
        this.stdin.emit('error', new Error(m.message));
        break;
      case 'error':
        this.fail(new Error(m.message));
        break;
      case 'close':
        if (this.finished) break;
        this.finished = true;
        this.emit('close', m.code);
        break;
    }
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    if (this.finished) return false;
    this.worker.postMessage({ type: 'kill', signal });
    return true;
  }
}

function cloneableEnv(env: NodeJS.ProcessEnv | undefined): Record<string, string> | undefined {
  if (!env) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) if (value !== undefined) out[key] = value;
  return out;
}

/**
 * Spawn  with piped stdio. The returned handle exposes the events and
 * methods the ask-code callers use. On the worker path the process starts when
 *  is called, which the callers do last, after attaching
 * their listeners.
 */
export function spawnStreamed(
  file: string,
  args: string[],
  options: OffThreadSpawnOptions,
): StreamedProcess {
  if (!process.versions.electron || process.platform !== 'win32') {
    const spawnOptions: SpawnOptions = { ...options, stdio: ['pipe', 'pipe', 'pipe'] };
    return spawn(file, args, spawnOptions) as unknown as StreamedProcess;
  }
  return spawnInWorker(file, args, options);
}

/** The worker-thread launch itself; exported so tests can exercise it outside Electron. */
export function spawnInWorker(
  file: string,
  args: string[],
  options: OffThreadSpawnOptions,
): StreamedProcess {
  const worker = new Worker(WORKER_SOURCE, { eval: true });
  return new OffThreadProcess(
    { file, args, cwd: options.cwd, env: cloneableEnv(options.env) },
    worker,
  ) as unknown as StreamedProcess;
}
