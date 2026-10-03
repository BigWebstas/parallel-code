import { execFile } from 'node:child_process';

/** Spawn option: give the child its own process group on POSIX. On Windows
 *  `detached` opens a new console window and there are no groups, so the tree
 *  is reached with `taskkill /T` instead (see `signalProcessGroup`). */
export const OWN_PROCESS_GROUP = process.platform !== 'win32';

interface Killable {
  pid?: number;
  // `unknown` covers both ChildProcess.kill (boolean) and node-pty's kill (void).
  kill(signal?: NodeJS.Signals): unknown;
}

// taskkill exits 128 when the process is already gone.
const TASKKILL_NOT_FOUND = 128;

const pendingTreeKills = new Set<Promise<void>>();

/** Resolves once every Windows tree kill started so far has finished. Removing a
 *  worktree awaits this so no killed process still holds its files. */
export function waitForProcessTreeKills(): Promise<void> {
  return Promise.all(pendingTreeKills).then(() => undefined);
}

/**
 * Signal a child and everything it launched. POSIX: the negative pid reaches
 * the group made by `detached: true`, and this throws like `process.kill` when
 * the process is already gone. Windows: `taskkill /T /F` ends the tree in the
 * background — waiting for it would freeze the main process, and with it the
 * UI, for up to seconds per process. Use `waitForProcessTreeKills` when the
 * tree must be gone first.
 */
export function signalProcessGroup(proc: Killable, signal: NodeJS.Signals): void {
  const pid = proc.pid;
  if (!pid || pid <= 0) {
    try {
      proc.kill(process.platform === 'win32' ? undefined : signal);
    } catch {
      /* already dead */
    }
    return;
  }
  if (process.platform === 'win32') {
    if (pid === process.pid) return;
    const kill = new Promise<void>((resolve) => {
      execFile(
        'taskkill',
        ['/pid', String(pid), '/T', '/F'],
        { windowsHide: true, timeout: 5000 },
        (error) => {
          // Only fall back when taskkill could not run or timed out. A process that is
          // already gone must not be killed again: node-pty crashes on an exited ConPTY.
          if (error && (error as { code?: unknown }).code !== TASKKILL_NOT_FOUND) {
            try {
              proc.kill();
            } catch {
              /* already dead */
            }
          }
          resolve();
        },
      );
    });
    pendingTreeKills.add(kill);
    void kill.finally(() => pendingTreeKills.delete(kill));
    return;
  }
  process.kill(-pid, signal);
}
