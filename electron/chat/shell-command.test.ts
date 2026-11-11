import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { runShellCommand } from './shell-command.js';

const run = (command: string) =>
  runShellCommand({
    command,
    cwd: tmpdir(),
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
    onOutput: () => undefined,
  });

describe.skipIf(process.platform === 'win32')('runShellCommand', () => {
  it('finishes when the shell exits, though a background job holds its output open', async () => {
    const shell = run('(sleep 3 &); echo done');
    const started = Date.now();
    await expect(shell.done).resolves.toBe(0);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(shell.output()).toBe('done\n');
    shell.kill();
  });

  it('kills a command that ignores SIGTERM', async () => {
    const shell = run("trap '' TERM; echo started; sleep 30");
    await vi.waitFor(() => expect(shell.output()).toContain('started'));
    shell.kill();
    await expect(shell.done).resolves.toBeUndefined();
    expect(shell.transcript(undefined)).toContain('Stopped by the user.');
  }, 10_000);

  it('records a command that ended before Stop as finished, and Stop still ends its job', async () => {
    const shell = run('(sleep 30 &); echo done');
    await vi.waitFor(() => expect(shell.output()).toBe('done\n'));
    // The shell has exited; its background job still holds the output open.
    await new Promise((resolve) => setTimeout(resolve, 100));
    shell.kill();
    await expect(shell.done).resolves.toBe(0);
    expect(shell.transcript(0)).not.toContain('Stopped by the user.');
    await shell.closed;
  });
});

describe.runIf(process.platform === 'win32')('runShellCommand on Windows', () => {
  const runCmd = (command: string) =>
    runShellCommand({
      command,
      cwd: tmpdir(),
      env: Object.fromEntries(
        Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
      ),
      onOutput: () => undefined,
    });

  it('runs the command through cmd.exe', async () => {
    const shell = runCmd('echo done');
    await expect(shell.done).resolves.toBe(0);
    expect(shell.output().trim()).toBe('done');
    await shell.closed;
  });

  it('reports a failing exit code', async () => {
    const shell = runCmd('exit 3');
    await expect(shell.done).resolves.toBe(3);
    expect(shell.transcript(3)).toContain('Exit code 3');
  });

  it('Stop ends a long-running command and what it started', async () => {
    const shell = runCmd('ping -n 30 127.0.0.1');
    await vi.waitFor(() => expect(shell.output()).toContain('Pinging'), { timeout: 10_000 });
    shell.kill();
    await shell.done;
    await shell.closed;
    expect(shell.transcript(undefined)).toContain('Stopped by the user.');
  }, 20_000);
});
