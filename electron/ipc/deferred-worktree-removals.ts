import fs from 'fs';
import path from 'path';
import { atomicWriteFileSync } from '../mcp/atomic.js';
import { errMessage, warn as logWarn, debug as logDebug } from '../log.js';

/**
 * Worktree folders Windows would not release when their task was closed.
 *
 * A folder can stay locked for minutes by something this app cannot see or end
 * (an IDE watching it, an Explorer window, a virus scan). Failing the close
 * leaves the task stuck, and retrying by hand fails the same way. Instead the
 * task closes and the leftover folder is journaled here; it is deleted in the
 * background, on the next start if need be.
 */
export interface DeferredRemoval {
  worktreePath: string;
  projectRoot: string;
  /** Branch to delete once git no longer lists the worktree. */
  branchName?: string;
  queuedAt: string;
  reason: string;
}

/** Deletes what is left of one entry. Resolves true when nothing remains to do. */
export type RetryDeferredRemoval = (entry: DeferredRemoval) => Promise<boolean>;

const JOURNAL_VERSION = 1;
const FIRST_RETRY_MS = 20_000;
const RETRY_EVERY_MS = 5 * 60_000;
/** Give up (and say so) on a folder that has resisted this long. */
const MAX_AGE_MS = 30 * 24 * 60 * 60_000;

let journalPath: string | null = null;
let retry: RetryDeferredRemoval | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
const queue = new Map<string, DeferredRemoval>();

const keyOf = (worktreePath: string): string => path.resolve(worktreePath).toLowerCase();

function isEntry(value: unknown): value is DeferredRemoval {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.worktreePath === 'string' &&
    typeof v.projectRoot === 'string' &&
    typeof v.queuedAt === 'string' &&
    typeof v.reason === 'string' &&
    (v.branchName === undefined || typeof v.branchName === 'string')
  );
}

function readJournal(file: string): DeferredRemoval[] {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    const entries = (parsed as { entries?: unknown } | null)?.entries;
    return Array.isArray(entries) ? entries.filter(isEntry) : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logWarn('worktrees', 'unreadable deferred removal journal', { err: errMessage(err) });
    }
    return [];
  }
}

function writeJournal(): void {
  if (!journalPath) return;
  try {
    fs.mkdirSync(path.dirname(journalPath), { recursive: true });
    atomicWriteFileSync(
      journalPath,
      JSON.stringify({ version: JOURNAL_VERSION, entries: [...queue.values()] }, null, 2) + '\n',
    );
  } catch (err) {
    logWarn('worktrees', 'failed to write deferred removal journal', { err: errMessage(err) });
  }
}

/**
 * Only folders under `<project>/.worktrees` are ever queued, so a corrupt or
 * edited journal cannot point the retry at anything else.
 */
export function isQueueableWorktree(projectRoot: string, worktreePath: string): boolean {
  const base = path.resolve(projectRoot, '.worktrees');
  const target = path.resolve(worktreePath);
  const rel = path.relative(base, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Remember a folder to delete later. Returns false when it may not be queued. */
export function deferWorktreeRemoval(entry: Omit<DeferredRemoval, 'queuedAt'>): boolean {
  if (!journalPath || !retry) return false;
  if (!isQueueableWorktree(entry.projectRoot, entry.worktreePath)) return false;
  queue.set(keyOf(entry.worktreePath), { ...entry, queuedAt: new Date().toISOString() });
  writeJournal();
  schedule(RETRY_EVERY_MS);
  return true;
}

/** Whether a folder is waiting to be deleted. */
export function isRemovalDeferred(worktreePath: string): boolean {
  return queue.has(keyOf(worktreePath));
}

function schedule(delayMs: number): void {
  if (timer || queue.size === 0) return;
  timer = setTimeout(() => {
    timer = null;
    void runDeferredRemovals();
  }, delayMs);
  timer.unref();
}

/** One pass over the queue. Entries still locked stay for the next pass. */
export async function runDeferredRemovals(): Promise<void> {
  if (running || !retry) return;
  running = true;
  try {
    let changed = false;
    for (const [key, entry] of [...queue]) {
      const expired = Date.now() - Date.parse(entry.queuedAt) > MAX_AGE_MS;
      let done = false;
      try {
        done = isQueueableWorktree(entry.projectRoot, entry.worktreePath)
          ? await retry(entry)
          : true;
      } catch (err) {
        logDebug('worktrees', 'deferred worktree removal still blocked', {
          worktreePath: entry.worktreePath,
          err: errMessage(err),
        });
      }
      if (!done && expired) {
        logWarn('worktrees', 'giving up on a worktree folder that stayed locked', { ...entry });
        done = true;
      }
      if (done) {
        queue.delete(key);
        changed = true;
        logDebug('worktrees', 'deferred worktree removal finished', {
          worktreePath: entry.worktreePath,
        });
      }
    }
    if (changed) writeJournal();
  } finally {
    running = false;
    schedule(RETRY_EVERY_MS);
  }
}

/** Load the journal and start retrying. Call once at startup. */
export function openDeferredRemovals(file: string, retryEntry: RetryDeferredRemoval): void {
  journalPath = file;
  retry = retryEntry;
  for (const entry of readJournal(file)) queue.set(keyOf(entry.worktreePath), entry);
  schedule(FIRST_RETRY_MS);
}

/** Stop retrying (tests, and quitting). The journal stays for the next start. */
export function closeDeferredRemovals(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  journalPath = null;
  retry = null;
  queue.clear();
}
