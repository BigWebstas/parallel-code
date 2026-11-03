import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcRow } from './process-stats.js';

const { mockReadTable } = vi.hoisted(() => ({ mockReadTable: vi.fn() }));
vi.mock('./windows-process-table.js', () => ({ readWindowsProcessTable: mockReadTable }));
vi.mock('../log.js', () => ({ debug: vi.fn(), warn: vi.fn() }));

import { elevatedHoldersError, findUnreachable, isBeyondReach } from './unreachable-processes.js';

function row(pid: number, ppid: number, name: string, startTicks = pid): ProcRow {
  return { pid, ppid, name, memoryBytes: 0, startTicks };
}

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

const realPlatform = process.platform;

describe('isBeyondReach', () => {
  beforeEach(() => setPlatform('win32'));
  afterEach(() => {
    setPlatform(realPlatform);
    vi.restoreAllMocks();
  });

  it('is true when the process exists but refuses us', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' });
    });
    expect(isBeyondReach(4242)).toBe(true);
  });

  it('is false for a process we can signal and for one that is gone', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    expect(isBeyondReach(4242)).toBe(false);
    kill.mockImplementation(() => {
      throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
    });
    expect(isBeyondReach(4242)).toBe(false);
  });

  it('only probes with signal 0, which ends nothing', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    isBeyondReach(4242);
    expect(kill).toHaveBeenCalledWith(4242, 0);
  });

  it('is false off Windows and for a bad pid', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' });
    });
    expect(isBeyondReach(0)).toBe(false);
    setPlatform('linux');
    expect(isBeyondReach(4242)).toBe(false);
    expect(kill).not.toHaveBeenCalled();
  });
});

describe('findUnreachable', () => {
  beforeEach(() => {
    setPlatform('win32');
    mockReadTable.mockReset();
  });
  afterEach(() => {
    setPlatform(realPlatform);
    vi.restoreAllMocks();
  });

  function refuse(...pids: number[]): void {
    vi.spyOn(process, 'kill').mockImplementation((pid) => {
      if (pids.includes(pid)) throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' });
      return true;
    });
  }

  it('returns the agent and the recorded descendants that are still running and refuse us', async () => {
    mockReadTable.mockResolvedValue([
      row(100, 1, 'claude.exe'),
      row(101, 100, 'node.exe'),
      row(102, 100, 'cmd.exe'),
      row(999, 1, 'explorer.exe'),
    ]);
    refuse(100, 101, 999);
    const found = await findUnreachable(
      [100],
      [row(101, 100, 'node.exe'), row(102, 100, 'cmd.exe')],
    );
    expect(found.map((r) => r.pid)).toEqual([100, 101]);
  });

  it('ignores a pid that was reused by a different process', async () => {
    mockReadTable.mockResolvedValue([row(101, 1, 'other.exe', 7777)]);
    refuse(101);
    expect(await findUnreachable([], [row(101, 100, 'node.exe', 101)])).toEqual([]);
  });

  it('is empty when nothing is recorded or the process table cannot be read', async () => {
    expect(await findUnreachable([], [])).toEqual([]);
    mockReadTable.mockRejectedValue(new Error('powershell failed'));
    expect(await findUnreachable([100], [])).toEqual([]);
  });
});

describe('elevatedHoldersError', () => {
  const cause = new Error('EBUSY: resource busy or locked');

  it('names the processes and the one command that ends them', () => {
    const message = elevatedHoldersError('C:\\w\\task', cause, [
      row(100, 1, 'claude.exe'),
      row(101, 100, 'node.exe'),
      row(102, 101, 'cmd.exe'),
    ]).message;
    expect(message).toContain(
      'Cannot remove worktree "C:\\w\\task": EBUSY: resource busy or locked.',
    );
    expect(message).toContain('3 processes from this task are running with administrator rights');
    expect(message).toContain('claude (pid 100), node (pid 101), cmd (pid 102)');
    // One taskkill /T on the topmost process reaches its children.
    expect(message).toContain('taskkill /F /T /PID 100 —');
    expect(message).not.toContain('/PID 101');
  });

  it('names every topmost process when several trees are stuck', () => {
    const message = elevatedHoldersError('w', cause, [
      row(100, 1, 'claude.exe'),
      row(200, 1, 'node.exe'),
    ]).message;
    expect(message).toContain('taskkill /F /T /PID 100 /PID 200');
  });

  it('uses the singular for one process and caps a long list', () => {
    expect(elevatedHoldersError('w', cause, [row(100, 1, 'claude.exe')]).message).toContain(
      '1 process from this task is running with administrator rights',
    );
    const many = Array.from({ length: 9 }, (_, i) => row(100 + i, 100, 'node.exe'));
    expect(elevatedHoldersError('w', cause, many).message).toContain(', and 3 more');
  });
});
