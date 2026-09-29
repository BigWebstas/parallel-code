import { spawn } from 'node:child_process';

/** Spawn option: give the child its own process group on POSIX. On Windows
 *  `detached` opens a new console window and there are no groups, so the tree
 *  is reached with `taskkill /T` instead (see `signalProcessGroup`). */
export const OWN_PROCESS_GROUP = process.platform !== 'win32';

interface Killable {
  pid?: number;
  kill(signal?: NodeJS.Signals): boolean;
}

/**
 * Signal a child and everything it launched. POSIX: the negative pid reaches
 * the group made by `detached: true`. Windows: `taskkill /T /F` ends the tree
 * (there is no graceful signal, so SIGTERM and SIGKILL behave alike).
 * Throws like `process.kill` when the process is already gone.
 */
export function signalProcessGroup(proc: Killable, signal: NodeJS.Signals): void {
  const pid = proc.pid;
  if (!pid) {
    proc.kill(signal);
    return;
  }
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
      .on('error', () => proc.kill(signal))
      .unref();
    return;
  }
  process.kill(-pid, signal);
}
