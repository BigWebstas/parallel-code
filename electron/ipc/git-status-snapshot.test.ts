import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { getChangedFiles, getWorktreeStatus, parseStatusV2Z } from './git.js';

describe('parseStatusV2Z', () => {
  it('reads branch, tracked, renamed, unmerged and untracked entries, spaces included', () => {
    const h = 'a'.repeat(40);
    const out = [
      '# branch.oid ' + 'b'.repeat(40),
      '# branch.head task/x',
      `1 .M N... 100644 100644 100644 ${h} ${h} src/has space.ts`,
      `2 R. N... 100644 100644 100644 ${h} ${h} R100 new name.ts`,
      'old name.ts',
      `u UU N... 100644 100644 100644 100644 ${h} ${h} ${h} conflict.ts`,
      '? notes/todo.md',
      '! ignored.log',
      '',
    ].join('\0');
    const snapshot = parseStatusV2Z(out);
    expect(snapshot).toMatchObject({
      currentBranch: 'task/x',
      headSha: 'b'.repeat(40),
      hasUncommittedChanges: true,
    });
    expect([...snapshot.changedPaths]).toEqual(['src/has space.ts', 'new name.ts', 'conflict.ts']);
    expect([...snapshot.untrackedPaths]).toEqual(['notes/todo.md']);
  });

  it('reports a clean tree and an unborn branch', () => {
    const snapshot = parseStatusV2Z('# branch.oid (initial)\0# branch.head main\0');
    expect(snapshot).toMatchObject({ headSha: null, currentBranch: 'main' });
    expect(snapshot.hasUncommittedChanges).toBe(false);
  });
});

const dirs: string[] = [];
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('changed files and worktree status share one status snapshot', () => {
  it('marks committed, edited and untracked files correctly against real git', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pc-snap-')));
    dirs.push(root);
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 't@example.com');
    git(root, 'config', 'user.name', 't');
    git(root, 'config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(root, 'base.txt'), 'base\n');
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'base');
    const wt = path.join(root, '.worktrees', 'feat');
    git(root, 'worktree', 'add', '-q', '-b', 'task/feat', wt);

    fs.writeFileSync(path.join(wt, 'done.txt'), 'committed\n');
    fs.writeFileSync(path.join(wt, 'edited.txt'), 'v1\n');
    git(wt, 'add', '.');
    git(wt, 'commit', '-q', '-m', 'work');
    fs.writeFileSync(path.join(wt, 'edited.txt'), 'v1\nv2\n');
    fs.mkdirSync(path.join(wt, 'sub dir'));
    fs.writeFileSync(path.join(wt, 'sub dir', 'new.txt'), 'new\n');

    const [files, status] = await Promise.all([
      getChangedFiles(wt, 'main'),
      getWorktreeStatus(wt, 'main'),
    ]);
    expect(files.map((f) => [f.path, f.committed])).toEqual([
      ['done.txt', true],
      ['edited.txt', false],
      ['sub dir/new.txt', false],
    ]);
    expect(status).toMatchObject({
      has_committed_changes: true,
      has_uncommitted_changes: true,
      current_branch: 'task/feat',
    });
  });
});
