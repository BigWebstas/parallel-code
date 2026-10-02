import { randomUUID } from 'crypto';
import { createWorktree, removeWorktree, worktreePathFor } from './git.js';
import { killAgent, notifyAgentListChanged, waitForAgentExit } from './pty.js';
import { stopPlanWatcher, stopPlanWatchersForPath } from './plans.js';
import { stopStepsWatcher, stopStepsWatchersForPath } from './steps.js';
import { verificationRunner } from './verify.js';
import { recordWorktreeIntent } from './worktree-intents.js';
import { debug as logDebug } from '../log.js';

const MAX_SLUG_LEN = 72;

function slug(name: string): string {
  let result = '';
  let prevWasHyphen = false;
  for (const c of name.toLowerCase()) {
    if (result.length >= MAX_SLUG_LEN) break;
    if (/[a-z0-9]/.test(c)) {
      result += c;
      prevWasHyphen = false;
    } else if (!prevWasHyphen) {
      result += '-';
      prevWasHyphen = true;
    }
  }
  return result.replace(/^-+|-+$/g, '');
}

function sanitizeBranchPrefix(prefix: string): string {
  const parts = prefix
    .split('/')
    .map(slug)
    .filter((p) => p.length > 0);
  return parts.length === 0 ? 'task' : parts.join('/');
}

export async function createTask(
  name: string,
  projectRoot: string,
  symlinkDirs: string[],
  branchPrefix: string,
  baseBranch?: string,
  snapshotCommit?: string,
): Promise<{ id: string; branch_name: string; worktree_path: string }> {
  const id = randomUUID();
  const prefix = sanitizeBranchPrefix(branchPrefix);
  const branchName = `${prefix}/${slug(name)}-${id.slice(0, 6)}`;
  // Before provisioning, so a crash before the task is saved leaves a trace.
  recordWorktreeIntent({
    worktreePath: worktreePathFor(projectRoot, branchName),
    branchName,
    projectRoot,
  });
  const worktree = await createWorktree(
    projectRoot,
    branchName,
    symlinkDirs,
    snapshotCommit ?? baseBranch,
  );
  return {
    id,
    branch_name: worktree.branch,
    worktree_path: worktree.path,
  };
}

interface DeleteTaskOpts {
  taskId?: string;
  agentIds: string[];
  branchName: string;
  deleteBranch: boolean;
  projectRoot: string;
  /** Real worktree location; the folder keeps its original branch-derived
   *  name even after the task adopts a branch the agent switched to. */
  worktreePath?: string;
}

export async function deleteTask(opts: DeleteTaskOpts): Promise<void> {
  logDebug(
    'tasks',
    `deleteTask starting for task=${opts.taskId ?? 'unknown'} branch=${opts.branchName}`,
    {
      agentIds: opts.agentIds,
      deleteBranch: opts.deleteBranch,
      worktreePath: opts.worktreePath,
    },
  );
  if (opts.taskId) {
    verificationRunner.cancel(opts.taskId);
    stopPlanWatcher(opts.taskId);
    stopStepsWatcher(opts.taskId);
  }
  const targetWorktree = opts.worktreePath ?? worktreePathFor(opts.projectRoot, opts.branchName);
  if (targetWorktree) {
    stopPlanWatchersForPath(targetWorktree);
    stopStepsWatchersForPath(targetWorktree);
  }
  for (const agentId of opts.agentIds) {
    try {
      killAgent(agentId);
    } catch {
      /* already dead */
    }
  }
  // A killed process tree releases its file handles asynchronously — on Windows
  // a ConPTY tree can hold the worktree's files for seconds after the kill.
  // Removing the worktree before the processes exit fails with EPERM/EBUSY and
  // leaves the task stuck in its closing state, so wait (bounded) first.
  await Promise.all(opts.agentIds.map((agentId) => waitForAgentExit(agentId)));
  // Yield to the event loop macrotask queue so libuv can process uv_close callbacks
  // for any closed watchers and killed processes before attempting directory removal.
  await new Promise((resolve) => setTimeout(resolve, 50));
  logDebug(
    'tasks',
    `deleteTask: agents exited or timed out, removing worktree for branch=${opts.branchName}`,
  );
  await removeWorktree(opts.projectRoot, opts.branchName, opts.deleteBranch, opts.worktreePath);
  logDebug('tasks', `deleteTask: worktree removed successfully for branch=${opts.branchName}`);
  notifyAgentListChanged();
}
