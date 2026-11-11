import { afterAll, describe, expect, it, vi } from 'vitest';

import {
  execFileInWorker,
  isImmutableGitQuery,
  stopGitWorkers,
  withGitMemo,
  type ExecFn,
} from './git-exec.js';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

describe('isImmutableGitQuery', () => {
  it('accepts queries that name only commit ids', () => {
    expect(isImmutableGitQuery(['merge-base', '--is-ancestor', A, B])).toBe(true);
    expect(isImmutableGitQuery(['merge-base', '--octopus', A, B, A])).toBe(true);
    expect(isImmutableGitQuery(['-c', 'core.longpaths=true', 'merge-base', A, B])).toBe(true);
    expect(isImmutableGitQuery(['rev-list', '--count', '--no-merges', `${A}..${B}`])).toBe(true);
    expect(
      isImmutableGitQuery([
        'rev-list',
        '--count',
        '--cherry-pick',
        '--right-only',
        `${A}...${B}`,
        `^${A}`,
      ]),
    ).toBe(true);
  });

  it('rejects anything that names a branch, which can move', () => {
    expect(isImmutableGitQuery(['merge-base', '--is-ancestor', A, 'refs/heads/main'])).toBe(false);
    expect(isImmutableGitQuery(['merge-base', 'main', A])).toBe(false);
    expect(isImmutableGitQuery(['rev-list', '--count', 'HEAD'])).toBe(false);
  });

  it('rejects other subcommands and flags', () => {
    expect(isImmutableGitQuery(['log', A])).toBe(false);
    expect(isImmutableGitQuery(['merge-base', '--fork-point', A, B])).toBe(false);
    expect(isImmutableGitQuery(['rev-list', A])).toBe(false);
  });
});

describe('withGitMemo', () => {
  const ok = (stdout = ''): { stdout: string; stderr: string } => ({ stdout, stderr: '' });

  it('remembers commit-id answers, including a plain "no"', async () => {
    const run = vi.fn<ExecFn>(async (_cmd, args) => {
      if (args.includes('--is-ancestor')) throw Object.assign(new Error('no'), { code: 1 });
      return ok('base\n');
    });
    const exec = withGitMemo(run);
    const opts = { cwd: '/repo' };

    await expect(exec('git', ['merge-base', A, B], opts)).resolves.toEqual(ok('base\n'));
    await expect(exec('git', ['merge-base', A, B], opts)).resolves.toEqual(ok('base\n'));
    await expect(exec('git', ['merge-base', '--is-ancestor', A, B], opts)).rejects.toMatchObject({
      code: 1,
    });
    await expect(exec('git', ['merge-base', '--is-ancestor', A, B], opts)).rejects.toMatchObject({
      code: 1,
    });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('keys the memo by working directory', async () => {
    const run = vi.fn<ExecFn>(async () => ok());
    const exec = withGitMemo(run);
    await exec('git', ['merge-base', A, B], { cwd: '/one' });
    await exec('git', ['merge-base', A, B], { cwd: '/two' });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not remember failures other than exit status 1', async () => {
    const run = vi
      .fn<ExecFn>()
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 128 }))
      .mockResolvedValueOnce(ok('x'));
    const exec = withGitMemo(run);
    await expect(exec('git', ['merge-base', A, B], { cwd: '/r' })).rejects.toMatchObject({
      code: 128,
    });
    await expect(exec('git', ['merge-base', A, B], { cwd: '/r' })).resolves.toEqual(ok('x'));
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('never remembers branch-name queries', async () => {
    const run = vi.fn<ExecFn>(async () => ok());
    const exec = withGitMemo(run);
    await exec('git', ['merge-base', 'main', A], { cwd: '/r' });
    await exec('git', ['merge-base', 'main', A], { cwd: '/r' });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('shares one run between identical read-only calls in flight', async () => {
    let release: () => void = () => {};
    const run = vi.fn<ExecFn>(
      () => new Promise((resolve) => (release = () => resolve({ stdout: 'sha\n', stderr: '' }))),
    );
    const exec = withGitMemo(run);
    const first = exec('git', ['rev-parse', 'HEAD'], { cwd: '/r' });
    const second = exec('git', ['rev-parse', 'HEAD'], { cwd: '/r' });
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([ok('sha\n'), ok('sha\n')]);
    expect(run).toHaveBeenCalledTimes(1);

    const third = exec('git', ['rev-parse', 'HEAD'], { cwd: '/r' });
    release();
    await third;
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('runs writes and non-git commands every time', async () => {
    const run = vi.fn<ExecFn>(async () => ok());
    const exec = withGitMemo(run);
    await Promise.all([
      exec('git', ['symbolic-ref', 'HEAD', 'refs/heads/x'], { cwd: '/r' }),
      exec('git', ['symbolic-ref', 'HEAD', 'refs/heads/x'], { cwd: '/r' }),
      exec('git', ['commit', '-m', 'm'], { cwd: '/r' }),
      exec('git', ['commit', '-m', 'm'], { cwd: '/r' }),
      exec('cmd.exe', ['/c', 'dir'], { cwd: '/r' }),
      exec('cmd.exe', ['/c', 'dir'], { cwd: '/r' }),
    ]);
    expect(run).toHaveBeenCalledTimes(6);
  });
});

describe('execFileInWorker', () => {
  afterAll(() => stopGitWorkers());

  it('returns stdout and stderr like execFile', async () => {
    const result = await execFileInWorker(process.execPath, [
      '-e',
      'process.stdout.write("out"); process.stderr.write("err")',
    ]);
    expect(result).toEqual({ stdout: 'out', stderr: 'err' });
  });

  it('rejects with the exit code and captured output', async () => {
    await expect(
      execFileInWorker(process.execPath, ['-e', 'process.stdout.write("so"); process.exit(3)']),
    ).rejects.toMatchObject({ code: 3, stdout: 'so', killed: false });
  });

  it('rejects when the program does not exist', async () => {
    await expect(execFileInWorker('definitely-not-a-program-xyz', [])).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('passes the working directory and runs calls side by side', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        execFileInWorker(
          process.execPath,
          ['-e', `process.stdout.write(process.cwd() + ":${i}")`],
          {
            cwd: process.cwd(),
          },
        ),
      ),
    );
    expect(results.map((r) => r.stdout)).toEqual(
      Array.from({ length: 8 }, (_, i) => `${process.cwd()}:${i}`),
    );
  });

  it('reports options that cannot be sent to a worker instead of hanging', async () => {
    await expect(
      execFileInWorker(process.execPath, ['-e', ''], { signal: new AbortController().signal }),
    ).rejects.toBeInstanceOf(Error);
  });
});
