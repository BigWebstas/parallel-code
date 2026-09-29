import { afterEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { signalProcessGroup } from './process-group.js';

afterEach(() => {
  vi.restoreAllMocks();
  spawnMock.mockReset();
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

  it('ends the whole tree with taskkill on Windows', () => {
    const unref = vi.fn();
    spawnMock.mockReturnValue({ on: vi.fn().mockReturnValue({ unref }) });
    withPlatform('win32', () => signalProcessGroup({ pid: 42, kill: vi.fn() }, 'SIGKILL'));
    expect(spawnMock).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '42', '/T', '/F'],
      expect.objectContaining({ windowsHide: true }),
    );
    expect(unref).toHaveBeenCalled();
  });

  it('falls back to the child when there is no pid', () => {
    const kill = vi.fn();
    signalProcessGroup({ kill }, 'SIGTERM');
    expect(kill).toHaveBeenCalledWith('SIGTERM');
  });
});
