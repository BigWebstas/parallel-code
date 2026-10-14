import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { getBranchCommits } from './git.js';

const dirs: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function commit(cwd: string, file: string, message: string): void {
  fs.writeFileSync(path.join(cwd, file), message);
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-q', '-m', message);
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('getBranchCommits memo', () => {
  it('follows new commits and base moves, and never serves a stale list', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pc-memo-')));
    dirs.push(root);
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 't@example.com');
    git(root, 'config', 'user.name', 't');
    git(root, 'config', 'commit.gpgsign', 'false');
    commit(root, 'a.txt', 'base');
    const wt = path.join(root, '.worktrees', 'feat');
    git(root, 'worktree', 'add', '-q', '-b', 'task/feat', wt);

    expect(await getBranchCommits(wt, 'main')).toEqual([]);
    commit(wt, 'b.txt', 'first');
    expect((await getBranchCommits(wt, 'main')).map((c) => c.message)).toEqual(['first']);
    // Same signature again: identical answer.
    expect((await getBranchCommits(wt, 'main')).map((c) => c.message)).toEqual(['first']);

    commit(wt, 'c.txt', 'second');
    expect((await getBranchCommits(wt, 'main')).map((c) => c.message)).toEqual(['first', 'second']);
  });
});
