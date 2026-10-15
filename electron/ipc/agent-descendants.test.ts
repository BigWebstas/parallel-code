import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcRow } from './process-stats.js';

const mocks = vi.hoisted(() => ({
  readTable: vi.fn<() => Promise<ProcRow[]>>(),
  terminatePid: vi.fn((_pid: number) => true),
}));

vi.mock('./windows-process-table.js', () => ({ readWindowsProcessTable: mocks.readTable }));
vi.mock('../process-group.js', () => ({ terminatePid: mocks.terminatePid }));

import { descendantsOf, endLeftovers, snapshotDescendants } from './agent-descendants.js';

function row(pid: number, ppid: number, startTicks = 1): ProcRow {
  return { pid, ppid, name: `p${pid}`, memoryBytes: 0, cpuSeconds: 0, startTicks };
}

const onWindows = process.platform === 'win32' ? it : it.skip;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('descendantsOf', () => {
  it('follows parent links through grandchildren and ignores unrelated processes', () => {
    const rows = [row(10, 1), row(11, 10), row(12, 11), row(20, 1), row(21, 20)];
    expect(
      descendantsOf(rows, [10])
        .map((r) => r.pid)
        .sort(),
    ).toEqual([11, 12]);
  });

  it('does not loop on a parent cycle', () => {
    expect(descendantsOf([row(10, 11), row(11, 10)], [10]).map((r) => r.pid)).toEqual([11]);
  });
});

describe('endLeftovers', () => {
  onWindows(
    'ends only recorded processes that are still running with the same start time',
    async () => {
      mocks.readTable.mockResolvedValue([row(11, 1, 5), row(12, 1, 99)]);
      const ended = await endLeftovers([row(11, 10, 5), row(12, 10, 6), row(13, 10, 7)]);
      expect(ended.map((r) => r.pid)).toEqual([11]);
      expect(mocks.terminatePid).toHaveBeenCalledTimes(1);
      expect(mocks.terminatePid).toHaveBeenCalledWith(11);
    },
  );

  onWindows('does nothing when the process table cannot be read', async () => {
    mocks.readTable.mockRejectedValue(new Error('boom'));
    expect(await endLeftovers([row(11, 10)])).toEqual([]);
    expect(mocks.terminatePid).not.toHaveBeenCalled();
  });
});

describe('snapshotDescendants', () => {
  onWindows('returns the agent descendants', async () => {
    mocks.readTable.mockResolvedValue([row(10, 1), row(11, 10)]);
    expect((await snapshotDescendants([10])).map((r) => r.pid)).toEqual([11]);
  });

  it('skips the table read when there are no agents', async () => {
    expect(await snapshotDescendants([])).toEqual([]);
    expect(mocks.readTable).not.toHaveBeenCalled();
  });
});
