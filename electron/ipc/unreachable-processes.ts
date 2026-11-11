import { warn as logWarn } from '../log.js';
import type { ProcRow } from './process-stats.js';
import { readWindowsProcessTable } from './windows-process-table.js';

// Privilege-management software can start a CLI elevated while the app that
// launched it stays at normal rights. Windows then refuses this process every
// way in: it cannot end the elevated process, read its working directory or
// command line, or tell what it holds open. So a worktree such as that agent's
// can look free of holders and still be locked, and the only honest report is
// to name the processes and say who can end them.

/**
 * Whether `pid` is running but cannot be signalled from here. On Windows,
 * signal 0 opens the process without ending it and fails with `EPERM` for one
 * that runs at higher rights. Always false elsewhere, where `EPERM` has other causes.
 */
export function isBeyondReach(pid: number): boolean {
  if (process.platform !== 'win32' || !pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * The agent processes and descendants that are still running and out of reach.
 * A recorded descendant counts only while it has the start time we saw, so a
 * reused pid is not blamed for the task.
 */
export async function findUnreachable(
  agentPids: number[],
  descendants: ProcRow[],
): Promise<ProcRow[]> {
  if (process.platform !== 'win32' || agentPids.length + descendants.length === 0) return [];
  let table: ProcRow[];
  try {
    table = await readWindowsProcessTable();
  } catch (err) {
    logWarn('tasks', 'could not list processes to find elevated task holders', {
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  const recorded = new Map(descendants.map((row) => [row.pid, row]));
  return table.filter((row) => {
    const seen = recorded.get(row.pid);
    const ours =
      agentPids.includes(row.pid) || (seen !== undefined && seen.startTicks === row.startTicks);
    return ours && isBeyondReach(row.pid);
  });
}

const MAX_LISTED = 6;

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** The failed removal, explained for a task whose processes this app cannot end. */
export function elevatedHoldersError(
  worktreePath: string,
  cause: unknown,
  stuck: ProcRow[],
): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const names = stuck
    .slice(0, MAX_LISTED)
    .map((row) => `${row.name.replace(/\.exe$/i, '')} (pid ${row.pid})`);
  const more = stuck.length > MAX_LISTED ? `, and ${stuck.length - MAX_LISTED} more` : '';
  // `taskkill /T` follows parent links, so only the topmost stuck processes need naming.
  const stuckPids = new Set(stuck.map((row) => row.pid));
  const roots = stuck.filter((row) => !stuckPids.has(row.ppid));
  const command = `taskkill /F /T ${(roots.length > 0 ? roots : stuck).map((row) => `/PID ${row.pid}`).join(' ')}`;
  return new Error(
    `Cannot remove worktree "${worktreePath}": ${detail}. ` +
      `${stuck.length} ${plural(stuck.length, 'process', 'processes')} from this task ` +
      `${plural(stuck.length, 'is', 'are')} running with administrator rights ` +
      '(privilege-management software usually starts them that way), so Parallel Code can ' +
      `neither see inside ${plural(stuck.length, 'it', 'them')} nor end ${plural(stuck.length, 'it', 'them')}: ` +
      `${names.join(', ')}${more}. ` +
      `End ${plural(stuck.length, 'it', 'them')} from an elevated terminal: ${command} — then close the task again.`,
  );
}
