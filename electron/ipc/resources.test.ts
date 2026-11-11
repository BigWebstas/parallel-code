import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { readProcessTable, readWindowsProcessTable, getAppMetrics } = vi.hoisted(() => ({
  readProcessTable: vi.fn(),
  readWindowsProcessTable: vi.fn(),
  getAppMetrics: vi.fn(() => [] as unknown[]),
}));

vi.mock('electron', () => ({ app: { getAppMetrics } }));
vi.mock('./windows-process-table.js', () => ({ readWindowsProcessTable }));
vi.mock('./pty.js', () => ({ getPtyProcessRoots: () => [] }));
vi.mock('./process-stats.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./process-stats.js')>()),
  readProcessTable,
}));

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform });
}

describe('getResourceSnapshot', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

  beforeEach(() => {
    vi.resetModules();
    setPlatform('linux');
    readProcessTable.mockReset().mockResolvedValue([]);
    getAppMetrics.mockReset().mockReturnValue([]);
    readWindowsProcessTable.mockReset();
  });

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
  });

  it('on Windows groups the PowerShell process table, not just Electron metrics', async () => {
    setPlatform('win32');
    getAppMetrics.mockReturnValue([
      { pid: process.pid, type: 'Browser', name: 'Main', cpu: {}, memory: {} },
    ]);
    readWindowsProcessTable.mockResolvedValue([
      { pid: process.pid, ppid: 1, name: 'Parallel Code', memoryBytes: 5000, cpuSeconds: 1 },
      { pid: 77, ppid: process.pid, name: 'node', memoryBytes: 3000, cpuSeconds: 1 },
    ]);
    const { getResourceSnapshot } = await import('./resources.js');
    const snapshot = await getResourceSnapshot();
    expect(readProcessTable).not.toHaveBeenCalled();
    expect(snapshot.groups.find((group) => group.kind === 'app')?.processes).toMatchObject([
      { pid: process.pid, name: 'Main', memoryBytes: 5000 },
    ]);
    expect(snapshot.groups.find((group) => group.kind === 'other')?.processes).toMatchObject([
      { pid: 77, name: 'node', memoryBytes: 3000 },
    ]);
  });

  it('on Windows falls back to Electron metrics when the process table cannot be read', async () => {
    setPlatform('win32');
    readWindowsProcessTable.mockRejectedValue(new Error('no powershell'));
    getAppMetrics.mockReturnValue([
      {
        pid: process.pid,
        type: 'Browser',
        name: 'Main',
        cpu: { percentCPUUsage: 3 },
        memory: { workingSetSize: 2048 },
      },
    ]);
    const { getResourceSnapshot } = await import('./resources.js');
    const snapshot = await getResourceSnapshot();
    expect(snapshot.groups.find((group) => group.kind === 'app')?.processes).toEqual([
      { pid: process.pid, name: 'Main', cpuPercent: 3, memoryBytes: 2048 * 1024 },
    ]);
  });

  it('shares one sample between overlapping and back-to-back callers', async () => {
    const { getResourceSnapshot } = await import('./resources.js');
    const [a, b] = await Promise.all([getResourceSnapshot(), getResourceSnapshot()]);
    const c = await getResourceSnapshot();
    expect(readProcessTable).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('samples again once the minimum gap has passed', async () => {
    vi.useFakeTimers();
    const { getResourceSnapshot } = await import('./resources.js');
    await getResourceSnapshot();
    vi.advanceTimersByTime(600);
    await getResourceSnapshot();
    expect(readProcessTable).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
