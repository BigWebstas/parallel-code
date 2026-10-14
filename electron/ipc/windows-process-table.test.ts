import { describe, expect, it } from 'vitest';

import { parseWindowsProcessTable, readWindowsProcessTable } from './windows-process-table.js';

describe('parseWindowsProcessTable', () => {
  it('reads tab-separated rows and drops damaged ones', () => {
    const rows = parseWindowsProcessTable(
      [
        '4120\t900\t52428800\t25000000\t1760000000000\tnode.exe',
        'garbage',
        '7\tx\t1\t1\t1\tbad.exe',
        '88\t4120\t1024\t0\t1760000000001\tWeird\tName.exe',
        '',
      ].join('\r\n'),
    );
    expect(rows).toEqual([
      {
        pid: 4120,
        ppid: 900,
        name: 'node',
        memoryBytes: 52428800,
        cpuSeconds: 2.5,
        startTicks: 1760000000000,
      },
      {
        pid: 88,
        ppid: 4120,
        name: 'Weird\tName',
        memoryBytes: 1024,
        cpuSeconds: 0,
        startTicks: 1760000000001,
      },
    ]);
  });
});

describe.skipIf(process.platform !== 'win32')('readWindowsProcessTable (real PowerShell)', () => {
  it('lists this process with its parent, and answers repeat reads from one helper', async () => {
    const first = await readWindowsProcessTable();
    const self = first.find((row) => row.pid === process.pid);
    expect(self).toMatchObject({ ppid: process.ppid });
    expect(self?.memoryBytes).toBeGreaterThan(1_000_000);
    expect(self?.startTicks).toBeGreaterThan(0);
    expect((await readWindowsProcessTable()).length).toBeGreaterThan(10);
  }, 60_000);
});
