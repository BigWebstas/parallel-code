import { describe, expect, it } from 'vitest';
import { spawnInWorker, type StreamedProcess } from './off-thread-spawn.js';

function collect(
  proc: StreamedProcess,
): Promise<{ out: string; err: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    proc.stdout?.on('data', (c) => (out += c.toString('utf8')));
    proc.stderr?.on('data', (c) => (err += c.toString('utf8')));
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ out, err, code }));
  });
}

describe('spawnInWorker', () => {
  it('feeds stdin to the child and relays its output and exit code', async () => {
    const proc = spawnInWorker(
      process.execPath,
      ['-e', "process.stdin.pipe(process.stdout); process.stderr.write('warn')"],
      { env: process.env },
    );
    const done = collect(proc);
    proc.stdin?.end('hello from the prompt');
    await expect(done).resolves.toEqual({ out: 'hello from the prompt', err: 'warn', code: 0 });
  });

  it('passes the working directory and environment through', async () => {
    const proc = spawnInWorker(
      process.execPath,
      ['-e', 'process.stdout.write(process.cwd() + "|" + process.env.OFF_THREAD_TEST)'],
      { cwd: process.cwd(), env: { ...process.env, OFF_THREAD_TEST: 'yes', DROPPED: undefined } },
    );
    const done = collect(proc);
    proc.stdin?.end('');
    const result = await done;
    expect(result.out).toBe(`${process.cwd()}|yes`);
  });

  it('reports a missing program as an error', async () => {
    const proc = spawnInWorker('definitely-not-a-real-program-xyz', [], { env: process.env });
    const done = collect(proc);
    proc.stdin?.end('x');
    await expect(done).rejects.toThrow(/ENOENT/);
  });

  it('kills a running child', async () => {
    const proc = spawnInWorker(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      env: process.env,
    });
    const done = new Promise<number | null>((resolve) => proc.on('close', resolve));
    proc.stdin?.end('');
    setTimeout(() => proc.kill('SIGTERM'), 500);
    const code = await done;
    expect(code === null || code !== 0).toBe(true);
  });
});
