import { debug as logDebug, warn as logWarn } from '../log.js';
import { terminatePid } from '../process-group.js';
import type { ProcRow } from './process-stats.js';
import { readWindowsProcessTable } from './windows-process-table.js';

// `taskkill /T` follows parent links, so a helper whose parent already exited
// (an MCP server, a shell) escapes it and keeps the task's worktree locked.
// Recording the agent's descendants before the kill lets us finish the job.

/** Every process below any of `rootPids`, found through parent links. */
export function descendantsOf(rows: ProcRow[], rootPids: number[]): ProcRow[] {
  const childrenOf = new Map<number, ProcRow[]>();
  for (const row of rows) {
    const siblings = childrenOf.get(row.ppid);
    if (siblings) siblings.push(row);
    else childrenOf.set(row.ppid, [row]);
  }
  const found = new Map<number, ProcRow>();
  const queue = [...rootPids];
  while (queue.length > 0) {
    const parent = queue.pop();
    if (parent === undefined) break;
    for (const child of childrenOf.get(parent) ?? []) {
      if (found.has(child.pid) || rootPids.includes(child.pid)) continue;
      found.set(child.pid, child);
      queue.push(child.pid);
    }
  }
  return [...found.values()];
}

/** Descendants of the given agents right now. Empty off Windows or when the table cannot be read. */
export async function snapshotDescendants(rootPids: number[]): Promise<ProcRow[]> {
  if (process.platform !== 'win32' || rootPids.length === 0) return [];
  try {
    return descendantsOf(await readWindowsProcessTable(), rootPids);
  } catch (err) {
    logWarn('tasks', 'could not list the agent process tree', {
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * End the recorded processes that are still running. A pid counts only when it
 * still has the start time we recorded, so a reused pid is never touched.
 */
export async function endLeftovers(recorded: ProcRow[]): Promise<ProcRow[]> {
  if (process.platform !== 'win32' || recorded.length === 0) return [];
  let alive: ProcRow[];
  try {
    alive = await readWindowsProcessTable();
  } catch (err) {
    logWarn('tasks', 'could not check for leftover agent processes', {
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  const running = new Set(alive.map((row) => `${row.pid}:${row.startTicks}`));
  const leftovers = recorded.filter((row) => running.has(`${row.pid}:${row.startTicks}`));
  for (const row of leftovers) {
    logWarn('tasks', 'agent child outlived its tree kill, ending it', {
      pid: row.pid,
      name: row.name,
    });
    terminatePid(row.pid);
  }
  if (leftovers.length === 0) logDebug('tasks', 'no agent child processes left after the kill');
  return leftovers;
}
