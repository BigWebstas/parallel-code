import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Worker } from 'node:worker_threads';

// Starting a process is a blocking call on the thread that makes it, and on
// Windows it costs 0.5-1 s here (endpoint-security scanning). Run on the main
// thread, every git call froze input routing for that long. These helpers move
// the launch to worker threads and drop calls whose answer cannot have changed.

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export type ExecFn = (cmd: string, args: string[], options?: unknown) => Promise<ExecResult>;

const POOL_SIZE = 4;

// Plain CommonJS, evaluated as the worker body so nothing has to be resolved
// from inside the asar archive.
const WORKER_SOURCE = `
const { parentPort } = require('node:worker_threads');
const { execFile } = require('node:child_process');
parentPort.on('message', ({ id, cmd, args, options }) => {
  const reply = (message) => parentPort.postMessage({ id, ...message });
  try {
    execFile(cmd, args, { windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (!error) return reply({ stdout, stderr });
      reply({
        error: {
          message: error.message,
          code: error.code,
          killed: error.killed,
          signal: error.signal,
          cmd: error.cmd,
        },
        stdout,
        stderr,
      });
    });
  } catch (e) {
    reply({ error: { message: String((e && e.message) || e), code: e && e.code }, stdout: '', stderr: '' });
  }
});
`;

interface WireError {
  message: string;
  code?: string | number;
  killed?: boolean;
  signal?: string;
  cmd?: string;
}

interface WireReply {
  id: number;
  stdout?: string;
  stderr?: string;
  error?: WireError;
}

interface Pending {
  resolve: (result: ExecResult) => void;
  reject: (error: Error) => void;
}

interface Slot {
  worker: Worker;
  pending: Map<number, Pending>;
}

const slots: Slot[] = [];
let nextId = 1;

function failAll(slot: Slot, reason: Error): void {
  for (const pending of slot.pending.values()) pending.reject(reason);
  slot.pending.clear();
  const index = slots.indexOf(slot);
  if (index >= 0) slots.splice(index, 1);
}

function createSlot(): Slot {
  const worker = new Worker(WORKER_SOURCE, { eval: true });
  worker.unref();
  const slot: Slot = { worker, pending: new Map() };
  worker.on('message', (reply: WireReply) => {
    const pending = slot.pending.get(reply.id);
    if (!pending) return;
    slot.pending.delete(reply.id);
    if (!reply.error) {
      pending.resolve({ stdout: reply.stdout ?? '', stderr: reply.stderr ?? '' });
      return;
    }
    // Same shape `promisify(execFile)` rejects with, so callers keep reading
    // `code`, `stdout` and `stderr` from the error.
    pending.reject(
      Object.assign(new Error(reply.error.message), reply.error, {
        stdout: reply.stdout ?? '',
        stderr: reply.stderr ?? '',
      }),
    );
  });
  worker.on('error', (err: unknown) =>
    failAll(slot, err instanceof Error ? err : new Error(String(err))),
  );
  worker.on('exit', () => failAll(slot, new Error('git worker exited')));
  slots.push(slot);
  return slot;
}

function pickSlot(): Slot {
  const idle = slots.find((s) => s.pending.size === 0);
  if (idle) return idle;
  if (slots.length < POOL_SIZE) return createSlot();
  return slots.reduce((best, s) => (s.pending.size < best.pending.size ? s : best));
}

/** `execFile`, with the process launch done on a worker thread. */
export const execFileInWorker: ExecFn = (cmd, args, options) =>
  new Promise<ExecResult>((resolve, reject) => {
    const slot = pickSlot();
    const id = nextId++;
    slot.pending.set(id, { resolve, reject });
    try {
      slot.worker.postMessage({ id, cmd, args, options });
    } catch (err) {
      // Options that cannot be cloned (an AbortSignal, say) never reach the worker.
      slot.pending.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });

/** Ends the worker threads. Tests call this; the app lets them die with the process. */
export async function stopGitWorkers(): Promise<void> {
  await Promise.all(slots.splice(0).map((s) => s.worker.terminate()));
}

// --- Dropping calls that cannot have a new answer ---

const HEX40 = /^[0-9a-f]{40}$/;
/** `<sha>`, `^<sha>`, `<sha>..<sha>` and `<sha>...<sha>` — revisions that name only commit ids. */
const SHA_REVISION = /^\^?[0-9a-f]{40}(?:\.{2,3}[0-9a-f]{40})?$/;

/**
 * Whether git's answer depends only on commit ids, so it never changes. Commit
 * ancestry is fixed once a commit exists; a branch name, by contrast, moves.
 * Only the queries the diff-base logic repeats are listed.
 */
export function isImmutableGitQuery(args: string[]): boolean {
  const rest = args[0] === '-c' ? args.slice(2) : args;
  const [sub, ...params] = rest;
  const revisions = params.filter((p) => !p.startsWith('--'));
  const flags = params.filter((p) => p.startsWith('--'));
  if (revisions.length === 0 || !revisions.every((p) => SHA_REVISION.test(p) || HEX40.test(p))) {
    return false;
  }
  if (sub === 'merge-base') return flags.every((f) => f === '--is-ancestor' || f === '--octopus');
  if (sub === 'rev-list') {
    return (
      flags.length > 0 &&
      flags.every((f) => ['--count', '--no-merges', '--cherry-pick', '--right-only'].includes(f))
    );
  }
  return false;
}

/** Git subcommands that only read, so identical simultaneous calls can share one run. */
const READ_ONLY = new Set([
  'status',
  'rev-parse',
  'merge-base',
  'rev-list',
  'log',
  'reflog',
  'diff',
  'symbolic-ref',
  'for-each-ref',
  'cat-file',
  'ls-files',
  'show',
]);

function isReadOnly(args: string[]): boolean {
  const rest = [...args];
  while (rest[0] === '-c') rest.splice(0, 2);
  while (rest[0] === '--no-optional-locks') rest.shift();
  const sub = rest[0];
  // `symbolic-ref <name> <ref>` writes; a lone name (optionally `--short`) only reads.
  if (sub === 'symbolic-ref') return rest.slice(1).filter((a) => !a.startsWith('-')).length === 1;
  if (sub === 'reflog') return rest[1] === 'show';
  return sub !== undefined && READ_ONLY.has(sub);
}

const MEMO_LIMIT = 5000;

function cwdOf(options: unknown): string {
  const cwd = (options as { cwd?: unknown } | undefined)?.cwd;
  return typeof cwd === 'string' ? cwd : '';
}

/**
 * Wraps `run` for git: answers that depend only on commit ids are remembered
 * for the life of the process (a "no" from `--is-ancestor` included), and
 * identical read-only calls already running share one process.
 */
export function withGitMemo(run: ExecFn): ExecFn {
  const remembered = new Map<string, ExecResult | { exitOne: ExecResult }>();
  const inFlight = new Map<string, Promise<ExecResult>>();

  return (cmd, args, options) => {
    if (cmd !== 'git') return run(cmd, args, options);
    const key = `${cwdOf(options)}\0${args.join('\0')}`;

    if (isImmutableGitQuery(args)) {
      const hit = remembered.get(key);
      if (hit) {
        if ('exitOne' in hit) {
          return Promise.reject(
            Object.assign(new Error('Command failed'), { code: 1, ...hit.exitOne }),
          );
        }
        return Promise.resolve(hit);
      }
    }

    const shared = isReadOnly(args) ? inFlight.get(key) : undefined;
    if (shared) return shared;

    const call = run(cmd, args, options).then(
      (result) => {
        if (isImmutableGitQuery(args)) remember(key, result);
        return result;
      },
      (err: unknown) => {
        const e = err as { code?: unknown; stdout?: unknown; stderr?: unknown };
        // Exit status 1 is git's plain "no" for --is-ancestor; anything else may be transient.
        if (isImmutableGitQuery(args) && e.code === 1) {
          remember(key, {
            exitOne: {
              stdout: typeof e.stdout === 'string' ? e.stdout : '',
              stderr: typeof e.stderr === 'string' ? e.stderr : '',
            },
          });
        }
        throw err;
      },
    );

    if (isReadOnly(args)) {
      inFlight.set(key, call);
      const clear = (): void => {
        if (inFlight.get(key) === call) inFlight.delete(key);
      };
      call.then(clear, clear);
    }
    return call;
  };

  function remember(key: string, value: ExecResult | { exitOne: ExecResult }): void {
    if (remembered.size >= MEMO_LIMIT) {
      const oldest = remembered.keys().next().value;
      if (oldest !== undefined) remembered.delete(oldest);
    }
    remembered.set(key, value);
  }
}

/**
 * The exec used for git in the desktop app: worker-thread launches on Windows,
 * plus the memo. Anywhere else (unit tests, plain Node) `run` is returned as
 * given, so mocks of `child_process` keep working.
 */
export function createAppExec(run: ExecFn): ExecFn {
  if (!process.versions.electron) return run;
  return withGitMemo(process.platform === 'win32' ? execFileInWorker : run);
}

/**
 * `execFile` for the rest of the app (git, gh, docker, ...): on Windows the
 * process launch happens on a worker thread instead of freezing the main one.
 * Not for callers that need the child handle (stdin, streaming).
 */
export const appExecFile: ExecFn = createAppExec(promisify(execFile) as unknown as ExecFn);
