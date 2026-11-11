import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { readBranchTips, readHeadSha, refExists } from './git-refs.js';

const dirs: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function repo(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pc-refs-')));
  dirs.push(root);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@example.com');
  git(root, 'config', 'user.name', 't');
  git(root, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(root, 'a.txt'), 'a');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'one');
  return root;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('git-refs', () => {
  it('reads HEAD like rev-parse, before and after packing refs', async () => {
    const root = repo();
    expect(await readHeadSha(root)).toBe(git(root, 'rev-parse', 'HEAD'));
    git(root, 'pack-refs', '--all');
    expect(await readHeadSha(root)).toBe(git(root, 'rev-parse', 'HEAD'));
  });

  it('follows a linked worktree to the shared refs and its own HEAD', async () => {
    const root = repo();
    const linked = path.join(root, '.worktrees', 'feat');
    git(root, 'worktree', 'add', '-q', '-b', 'task/feat', linked);
    fs.writeFileSync(path.join(linked, 'b.txt'), 'b');
    git(linked, 'add', '.');
    git(linked, 'commit', '-q', '-m', 'two');
    expect(await readHeadSha(linked)).toBe(git(linked, 'rev-parse', 'HEAD'));
    expect(await readHeadSha(root)).toBe(git(root, 'rev-parse', 'HEAD'));
    const tips = await readBranchTips(linked, 'main');
    expect(tips).toEqual({ local: git(root, 'rev-parse', 'main'), origin: '' });
  });

  it('reads a detached HEAD', async () => {
    const root = repo();
    const sha = git(root, 'rev-parse', 'HEAD');
    git(root, 'checkout', '-q', '--detach');
    expect(await readHeadSha(root)).toBe(sha);
  });

  it('reports existing and missing refs, loose or packed', async () => {
    const root = repo();
    expect(await refExists(root, 'refs/heads/main')).toBe(true);
    expect(await refExists(root, 'refs/heads/nope')).toBe(false);
    git(root, 'pack-refs', '--all');
    expect(await refExists(root, 'refs/heads/main')).toBe(true);
    expect(await refExists(root, 'refs/heads/nope')).toBe(false);
  });

  it('returns null outside a repository and for unborn HEAD', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-refs-empty-'));
    dirs.push(empty);
    expect(await readHeadSha(empty)).toBeNull();
    expect(await refExists(empty, 'refs/heads/main')).toBeNull();
    git(empty, 'init', '-q', '-b', 'main');
    expect(await readHeadSha(empty)).toBeNull();
  });

  it('rejects ref names that escape refs/', async () => {
    const root = repo();
    expect(await refExists(root, 'refs/../HEAD')).toBe(false);
    expect(await refExists(root, 'HEAD')).toBe(false);
  });
});
