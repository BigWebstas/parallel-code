import fs from 'fs';
import path from 'path';

// Process creation is the dominant cost of a git call on Windows (500 ms here,
// mostly endpoint-security scanning), so questions answerable from a few small
// files are read in-process. Every function returns null whenever the layout is
// not the plain one (reftable, odd worktree setups, unreadable files); callers
// then fall back to running git.

const SHA = /^[0-9a-f]{40}$/;

async function readText(file: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

interface GitDirs {
  /** Per-worktree directory (holds HEAD). */
  gitDir: string;
  /** Shared directory (holds refs/ and packed-refs). */
  commonDir: string;
}

/** `.git` directory or `gitdir:` pointer file of a checkout, plus the shared dir. */
export async function resolveGitDirs(worktreePath: string): Promise<GitDirs | null> {
  const dotGit = path.join(worktreePath, '.git');
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(dotGit);
  } catch {
    return null;
  }
  let gitDir = dotGit;
  if (stat.isFile()) {
    const match = /^gitdir:\s*(.+?)\s*$/m.exec((await readText(dotGit)) ?? '');
    if (!match) return null;
    gitDir = path.resolve(worktreePath, match[1]);
  }
  const common = (await readText(path.join(gitDir, 'commondir')))?.trim();
  const commonDir = common ? path.resolve(gitDir, common) : gitDir;
  // The reftable backend keeps refs in binary tables, so loose files would
  // read as "no such ref" and hide changes.
  if (await fs.promises.stat(path.join(commonDir, 'reftable')).catch(() => null)) return null;
  return { gitDir, commonDir };
}

/** SHA of a full ref name (`refs/heads/x`), from a loose file or packed-refs. */
export async function readRefSha(commonDir: string, ref: string): Promise<string | null> {
  if (!ref.startsWith('refs/') || ref.split('/').includes('..')) return null;
  const loose = (await readText(path.join(commonDir, ...ref.split('/'))))?.trim();
  if (loose) return SHA.test(loose) ? loose : null;
  const packed = await readText(path.join(commonDir, 'packed-refs'));
  if (packed === null) return null;
  for (const line of packed.split('\n')) {
    if (line.endsWith(` ${ref}`) && SHA.test(line.slice(0, 40))) return line.slice(0, 40);
  }
  return null;
}

/** Whether `ref` exists; null when this cannot be told without running git. */
export async function refExists(worktreePath: string, ref: string): Promise<boolean | null> {
  const dirs = await resolveGitDirs(worktreePath);
  if (!dirs) return null;
  return (await readRefSha(dirs.commonDir, ref)) !== null;
}

/** Commit HEAD points at, as `git rev-parse HEAD` would print, without running git. */
export async function readHeadSha(worktreePath: string): Promise<string | null> {
  const dirs = await resolveGitDirs(worktreePath);
  if (!dirs) return null;
  const head = (await readText(path.join(dirs.gitDir, 'HEAD')))?.trim();
  if (!head) return null;
  if (SHA.test(head)) return head;
  const ref = /^ref:\s*(refs\/\S+)$/.exec(head)?.[1];
  return ref ? readRefSha(dirs.commonDir, ref) : null;
}

/** Tips of `refs/heads/<branch>` and `refs/remotes/origin/<branch>` ('' when absent). */
export async function readBranchTips(
  worktreePath: string,
  branch: string,
): Promise<{ local: string; origin: string } | null> {
  const dirs = await resolveGitDirs(worktreePath);
  if (!dirs) return null;
  const [local, origin] = await Promise.all([
    readRefSha(dirs.commonDir, `refs/heads/${branch}`),
    readRefSha(dirs.commonDir, `refs/remotes/origin/${branch}`),
  ]);
  return { local: local ?? '', origin: origin ?? '' };
}
