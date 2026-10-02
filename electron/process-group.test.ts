import { afterEach, describe, expect, it, vi } from 'vitest';

const { execFileSyncMock } = vi.hoisted(() => ({ execFileSyncMock: vi.fn() }));
vi.mock('node:child_process', () => ({ execFileSync: execFileSyncMock }));

import { signalProcessGroup } from './process-group.js';

afterEach(() => {
  vi.restoreAllMocks();
  execFileSyncMock.mockReset();
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

  it('ends the whole tree synchronously with taskkill on Windows', () => {
    withPlatform('win32', () => signalProcessGroup({ pid: 42, kill: vi.fn() }, 'SIGKILL'));
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '42', '/T', '/F'],
      expect.objectContaining({ windowsHide: true, timeout: 5000 }),
    );
  });

  it('falls back to proc.kill when taskkill throws on Windows', () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error('Process not found');
    });
    const kill = vi.fn();
    withPlatform('win32', () => signalProcessGroup({ pid: 42, kill }, 'SIGKILL'));
    expect(kill).toHaveBeenCalledWith();
  });

  it('falls back to the child when there is no pid', () => {
    const kill = vi.fn();
    signalProcessGroup({ kill }, 'SIGTERM');
    expect(kill).toHaveBeenCalledWith('SIGTERM');
  });
});
