import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeDeferredRemovals,
  deferWorktreeRemoval,
  isQueueableWorktree,
  isRemovalDeferred,
  openDeferredRemovals,
  runDeferredRemovals,
} from './deferred-worktree-removals.js';

let dir: string;
let journal: string;
let project: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deferred-removals-'));
  journal = path.join(dir, 'journal.json');
  project = path.join(dir, 'repo');
});

afterEach(() => {
  closeDeferredRemovals();
  fs.rmSync(dir, { recursive: true, force: true });
});

const entryFor = (name: string) => ({
  worktreePath: path.join(project, '.worktrees', name),
  projectRoot: project,
  branchName: `task/${name}`,
  reason: 'EBUSY',
});

describe('isQueueableWorktree', () => {
  it('accepts folders under .worktrees only', () => {
    expect(isQueueableWorktree(project, path.join(project, '.worktrees', 'task', 'a'))).toBe(true);
    expect(isQueueableWorktree(project, project)).toBe(false);
    expect(isQueueableWorktree(project, path.join(project, 'src'))).toBe(false);
    expect(isQueueableWorktree(project, path.join(project, '.worktrees'))).toBe(false);
    expect(isQueueableWorktree(project, path.join(project, '.worktrees', '..', 'src'))).toBe(false);
  });
});

describe('deferred worktree removals', () => {
  it('queues nothing until the journal is open', () => {
    expect(deferWorktreeRemoval(entryFor('a'))).toBe(false);
  });

  it('refuses a folder outside .worktrees', () => {
    openDeferredRemovals(journal, async () => true);
    expect(deferWorktreeRemoval({ ...entryFor('a'), worktreePath: project })).toBe(false);
    expect(isRemovalDeferred(project)).toBe(false);
  });

  it('writes the journal and reloads it on the next start', () => {
    openDeferredRemovals(journal, async () => false);
    expect(deferWorktreeRemoval(entryFor('a'))).toBe(true);
    expect(isRemovalDeferred(entryFor('a').worktreePath)).toBe(true);
    closeDeferredRemovals();
    openDeferredRemovals(journal, async () => false);
    expect(isRemovalDeferred(entryFor('a').worktreePath)).toBe(true);
  });

  it('keeps a still-locked folder and drops one that is finished', async () => {
    const retry = vi.fn(async (e: { worktreePath: string }) => e.worktreePath.endsWith('done'));
    openDeferredRemovals(journal, retry);
    deferWorktreeRemoval(entryFor('done'));
    deferWorktreeRemoval(entryFor('locked'));
    await runDeferredRemovals();
    expect(retry).toHaveBeenCalledTimes(2);
    expect(isRemovalDeferred(entryFor('done').worktreePath)).toBe(false);
    expect(isRemovalDeferred(entryFor('locked').worktreePath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(journal, 'utf8')) as { entries: unknown[] };
    expect(saved.entries).toHaveLength(1);
  });

  it('treats a retry that throws as still locked', async () => {
    openDeferredRemovals(journal, async () => {
      throw new Error('EBUSY');
    });
    deferWorktreeRemoval(entryFor('a'));
    await runDeferredRemovals();
    expect(isRemovalDeferred(entryFor('a').worktreePath)).toBe(true);
  });

  it('ignores a journal entry that points outside .worktrees', async () => {
    fs.writeFileSync(
      journal,
      JSON.stringify({
        version: 1,
        entries: [
          {
            worktreePath: project,
            projectRoot: project,
            queuedAt: new Date().toISOString(),
            reason: 'x',
          },
        ],
      }),
    );
    const retry = vi.fn(async () => false);
    openDeferredRemovals(journal, retry);
    await runDeferredRemovals();
    expect(retry).not.toHaveBeenCalled();
    expect(isRemovalDeferred(project)).toBe(false);
  });
});
