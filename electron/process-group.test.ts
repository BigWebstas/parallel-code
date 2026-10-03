import { afterEach, describe, expect, it, vi } from 'vitest';

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: execFileMock }));

import { signalProcessGroup, waitForProcessTreeKills } from './process-group.js';

type Callback = (error: (Error & { code?: number }) | null) => void;
/** Make the mocked taskkill finish with \`error\` (null for success). */
function taskkillFinishes(error: (Error & { code?: number }) | null): void {
  execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Callback) =>
    cb(error),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  execFileMock.mockReset();
});

function withPlatform(platform: NodeJS.Platform, run: () => void): void {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform });
  try {
    run();
  } finally {
    if (original) Object.defineProperty(process, 'platform', original);
  }
}

describe('signalProcessGroup', () => {
  it('signals the negative pid on POSIX', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    withPlatform('linux', () => signalProcessGroup({ pid: 42, kill: vi.fn() }, 'SIGTERM'));
    expect(kill).toHaveBeenCalledWith(-42, 'SIGTERM');
  });

  it('ends the whole tree with taskkill on Windows without blocking, and can be awaited', async () => {
    let finish: Callback = () => {};
    execFileMock.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Callback) => (finish = cb),
    );
    withPlatform('win32', () => signalProcessGroup({ pid: 42, kill: vi.fn() }, 'SIGKILL'));
    expect(execFileMock).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '42', '/T', '/F'],
      expect.objectContaining({ windowsHide: true, timeout: 5000 }),
      expect.any(Function),
    );
    let done = false;
    const waited = waitForProcessTreeKills().then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    finish(null);
    await waited;
    expect(done).toBe(true);
  });

  it('falls back to proc.kill when taskkill fails on Windows', async () => {
    taskkillFinishes(Object.assign(new Error('timed out'), { code: 1 }));
    const kill = vi.fn();
    withPlatform('win32', () => signalProcessGroup({ pid: 42, kill }, 'SIGKILL'));
    await waitForProcessTreeKills();
    expect(kill).toHaveBeenCalledWith();
  });

  it('does not kill again a process taskkill reports as already gone', async () => {
    // node-pty crashes when an exited ConPTY process is killed again.
    taskkillFinishes(Object.assign(new Error('not found'), { code: 128 }));
    const kill = vi.fn();
    withPlatform('win32', () => signalProcessGroup({ pid: 42, kill }, 'SIGKILL'));
    await waitForProcessTreeKills();
    expect(kill).not.toHaveBeenCalled();
  });

  it('falls back to the child when there is no pid or pid <= 0', () => {
    withPlatform('linux', () => {
      const kill = vi.fn();
      signalProcessGroup({ kill }, 'SIGTERM');
      expect(kill).toHaveBeenCalledWith('SIGTERM');

      const killZero = vi.fn();
      signalProcessGroup({ pid: 0, kill: killZero }, 'SIGTERM');
      expect(killZero).toHaveBeenCalledWith('SIGTERM');
    });
    // Windows has no signals, so the fallback kills without one.
    const kill = vi.fn();
    withPlatform('win32', () => signalProcessGroup({ kill }, 'SIGTERM'));
    expect(kill).toHaveBeenCalledWith(undefined);
  });

  it('refuses to kill Electron own process.pid with taskkill', () => {
    withPlatform('win32', () => signalProcessGroup({ pid: process.pid, kill: vi.fn() }, 'SIGKILL'));
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
