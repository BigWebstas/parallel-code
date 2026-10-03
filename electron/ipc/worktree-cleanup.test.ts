import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  findForeignOwnedEntries,
  foreignOwnedRemovalError,
  prepareTreeForRemoval,
} from './worktree-cleanup.js';

const tempDirs: string[] = [];
const OWN_UID = process.getuid?.() ?? 0;
/** A uid nothing on disk can match — stands in for the container user we cannot become in a test. */
const FOREIGN_UID = OWN_UID + 1;

function makeTree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'parallel-code-worktree-cleanup-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('findForeignOwnedEntries', () => {
  it('returns nothing when every entry belongs to the current user', () => {
    const root = makeTree();
    fs.mkdirSync(path.join(root, 'packages/app/node_modules/.cache'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages/app/node_modules/.cache/x'), 'y');

    expect(findForeignOwnedEntries(root, OWN_UID)).toEqual([]);
  });

  it('reports entries owned by another uid without descending into them', () => {
    const root = makeTree();
    fs.mkdirSync(path.join(root, 'packages/app/node_modules/.cache/jiti'), { recursive: true });

    const found = findForeignOwnedEntries(root, FOREIGN_UID);

    // `packages` is itself a blocker, so its children add nothing to the report.
    expect(found).toEqual([
      { path: root, uid: OWN_UID },
      { path: path.join(root, 'packages'), uid: OWN_UID },
    ]);
  });

  it('caps the number of reported entries', () => {
    const root = makeTree();
    for (let i = 0; i < 20; i++) fs.writeFileSync(path.join(root, `file-${i}`), 'x');

    expect(findForeignOwnedEntries(root, FOREIGN_UID, 3)).toHaveLength(3);
  });

  it('does not follow symlinked directories out of the worktree', () => {
    const root = makeTree();
    const outside = makeTree();
    fs.writeFileSync(path.join(outside, 'deep-file'), 'x');
    fs.symlinkSync(outside, path.join(root, 'node_modules'));

    const found = findForeignOwnedEntries(root, FOREIGN_UID, 10);

    expect(found.map((e) => e.path)).not.toContain(path.join(outside, 'deep-file'));
  });

  it('returns nothing when the worktree is already gone', () => {
    expect(findForeignOwnedEntries('/definitely/not/here', OWN_UID)).toEqual([]);
  });
});

describe('foreignOwnedRemovalError', () => {
  // Only POSIX hosts reach the foreign-owner path; Windows reports locked files instead.
  it.skipIf(process.platform === 'win32')(
    'names the offending uid, an example path, and the manual command',
    () => {
      const error = foreignOwnedRemovalError(
        '/repo/.worktrees/feat/x',
        [
          { path: '/repo/.worktrees/feat/x/node_modules/.cache', uid: 65534 },
          { path: '/repo/.worktrees/feat/x/node_modules/.cache/jiti', uid: 65534 },
        ],
        'docker: command not found',
      );

      expect(error.message).toContain('uid 65534');
      expect(error.message).toContain('node_modules/.cache');
      expect(error.message).toContain('docker: command not found');
      expect(error.message).toContain('sudo rm -rf "/repo/.worktrees/feat/x"');
    },
  );
});

describe('prepareTreeForRemoval', () => {
  it('unlinks symlinks without recursing into target directories', async () => {
    const root = makeTree();
    const outside = makeTree();
    fs.writeFileSync(path.join(outside, 'important.txt'), 'do not touch');
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    fs.symlinkSync(outside, path.join(root, 'node_modules', 'dep'));

    await prepareTreeForRemoval(root);

    // The symlink is gone from root
    expect(fs.existsSync(path.join(root, 'node_modules', 'dep'))).toBe(false);
    // The outside directory and file are untouched
    expect(fs.existsSync(path.join(outside, 'important.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(outside, 'important.txt'), 'utf8')).toBe('do not touch');
  });

  it('unlinks dangling symlinks without error', async () => {
    const root = makeTree();
    fs.mkdirSync(path.join(root, 'sub'));
    fs.symlinkSync('/nonexistent/path/outside', path.join(root, 'sub', 'dangling'));

    await prepareTreeForRemoval(root);

    expect(fs.existsSync(path.join(root, 'sub', 'dangling'))).toBe(false);
  });

  it('is a no-op if the directory does not exist', async () => {
    await expect(prepareTreeForRemoval('/definitely/missing/dir')).resolves.toBeUndefined();
  });
});
