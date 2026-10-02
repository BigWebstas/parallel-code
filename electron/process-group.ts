import { execFileSync } from 'node:child_process';

/** Spawn option: give the child its own process group on POSIX. On Windows
 *  `detached` opens a new console window and there are no groups, so the tree
 *  is reached with `taskkill /T` instead (see `signalProcessGroup`). */
export const OWN_PROCESS_GROUP = process.platform !== 'win32';

interface Killable {
  pid?: number;
  // `unknown` covers both ChildProcess.kill (boolean) and node-pty's kill (void).
  kill(signal?: NodeJS.Signals): unknown;
}

/**
 * Signal a child and everything it launched. POSIX: the negative pid reaches
 * the group made by `detached: true`. Windows: `taskkill /T /F` ends the tree
 * synchronously so all child and grandchild processes are terminated before returning.
 * Throws like `process.kill` when the process is already gone.
 */
export function signalProcessGroup(proc: Killable, signal: NodeJS.Signals): void {
  const pid = proc.pid;
  if (!pid) {
    proc.kill(process.platform === 'win32' ? undefined : signal);
    return;
  }
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 5000,
      });
    } catch {
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
    }
    return;
  }
  process.kill(-pid, signal);
}
