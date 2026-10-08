import { spawn, type ChildProcess } from 'child_process';
import { once } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  findWorktreeLockers,
  killWorktreeLockers,
  lockedRemovalError,
  parseLockerOutput,
  partitionLockers,
} from './worktree-lockers.js';

describe('parseLockerOutput', () => {
  it('reads pid and name lines and ignores other output', () => {
    expect(parseLockerOutput('warning: noise\r\n123\tclaude\r\n\r\n456\tcaveman-proxy\n')).toEqual([
      { pid: 123, name: 'claude' },
      { pid: 456, name: 'caveman-proxy' },
    ]);
  });

  it('returns nothing for empty output', () => {
    expect(parseLockerOutput('')).toEqual([]);
  });
});

describe('partitionLockers', () => {
  it('keeps this app, its parent and the user shell out of the kill list', () => {
    const { killable, kept } = partitionLockers([
      { pid: process.pid, name: 'node' },
      { pid: process.ppid, name: 'node' },
      { pid: 900001, name: 'Explorer' },
      { pid: 900002, name: 'Parallel Code' },
      { pid: 900003, name: 'caveman-proxy' },
    ]);
    expect(killable).toEqual([{ pid: 900003, name: 'caveman-proxy' }]);
    expect(kept.map((l) => l.pid)).toEqual([process.pid, process.ppid, 900001, 900002]);
  });
});

describe('lockedRemovalError', () => {
  it('names the processes that hold the folder', () => {
    const err = lockedRemovalError('/work/wt', new Error('EBUSY'), [
      { pid: 7, name: 'caveman-proxy' },
    ]);
    expect(err.message).toContain('caveman-proxy (pid 7)');
    expect(err.message).toContain('EBUSY');
  });

  it('falls back to generic advice when no holder is known', () => {
    expect(lockedRemovalError('/work/wt', new Error('EBUSY')).message).toContain(
      'may still hold files open',
    );
  });
});

const tempDirs: string[] = [];
const children: ChildProcess[] = [];

afterEach(async () => {
  // Wait for each holder to be gone: its working directory is released only then.
  await Promise.all(
    children.splice(0).map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill();
      await once(child, 'exit');
    }),
  );
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe.runIf(process.platform === 'win32')('worktree lockers on Windows', () => {
  function startHolder(cwd: string): number {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      cwd,
      stdio: 'ignore',
      windowsHide: true,
    });
    if (child.pid === undefined) throw new Error('holder did not start');
    children.push(child);
    return child.pid;
  }

  it('finds a process by its working directory and ends it', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-lockers-'));
    tempDirs.push(root);
    const nested = path.join(root, 'sub');
    fs.mkdirSync(nested);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-lockers-out-'));
    tempDirs.push(outside);

    const inRoot = startHolder(root);
    const inNested = startHolder(nested);
    const elsewhere = startHolder(outside);

    const found = await findWorktreeLockers(root);
    const pids = found.map((l) => l.pid);
    expect(pids).toContain(inRoot);
    expect(pids).toContain(inNested);
    expect(pids).not.toContain(elsewhere);

    await killWorktreeLockers(found.filter((l) => l.pid === inRoot || l.pid === inNested));
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect((await findWorktreeLockers(root)).map((l) => l.pid)).toEqual([]);
  }, 60_000);
});
