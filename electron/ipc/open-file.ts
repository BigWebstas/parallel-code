import { spawn } from 'child_process';
import path from 'path';

/**
 * Editors whose CLI can open a file at a line, keyed by executable name.
 * shortcut: known editors only — a user-defined argument template if others
 * (JetBrains, Vim in a terminal) are wanted.
 */
const GOTO_ARGS: Record<string, (target: string) => string[]> = {
  code: (target) => ['--goto', target],
  'code-insiders': (target) => ['--goto', target],
  codium: (target) => ['--goto', target],
  cursor: (target) => ['--goto', target],
  windsurf: (target) => ['--goto', target],
  zed: (target) => [target],
  subl: (target) => [target],
  // Notepad++ takes the line as a separate `-n` flag rather than `path:line`.
  'notepad++': (target) => {
    const match = target.match(/^(.*):(\d+)$/);
    return match ? [`-n${match[2]}`, match[1]] : [target];
  },
};

/**
 * Normalizes an editor executable for GOTO_ARGS lookup: strips a Windows
 * `.cmd`/`.exe`/`.bat` wrapper suffix and folds case, so `C:\…\code.cmd`
 * resolves to the `code` entry.
 */
export function editorLookupKey(editorCommand: string): string {
  // win32.basename understands both `\` and `/`, so Windows paths resolve on
  // any host while POSIX paths are unaffected.
  return path.win32
    .basename(editorCommand)
    .replace(/\.(cmd|exe|bat)$/i, '')
    .toLowerCase();
}

/** Rejects commands that could smuggle shell syntax; spawn runs them without a shell. */
export function validateEditorCommand(editorCommand: unknown): string {
  if (typeof editorCommand !== 'string' || !editorCommand.trim()) {
    throw new Error('editorCommand must be a non-empty string');
  }
  const cmd = editorCommand.trim();
  // Backslashes and drive-letter colons are legitimate Windows path
  // characters (`C:\tools\code.cmd`); spawn runs without a shell, so they
  // are passed literally and cannot escape into shell syntax.
  if (/[;&|`$(){}[\]<>'"*?!#~]/.test(cmd)) {
    throw new Error('editorCommand must not contain shell metacharacters');
  }
  return cmd;
}

/**
 * Arguments that open `absolutePath` at `line` in the configured editor, or
 * null when the editor is not one whose line syntax is known.
 */
export function editorGotoArgs(
  editorCommand: string,
  absolutePath: string,
  line: number,
): string[] | null {
  const build = GOTO_ARGS[editorLookupKey(editorCommand)];
  return build ? build(`${absolutePath}:${line}`) : null;
}

/** Launches a GUI program detached from the app; resolves once it has spawned. */
export function spawnDetached(cmd: string, args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const child = spawn(cmd, args, {
      detached: true,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Failed to launch "${cmd}": ${err.message}`));
      }
    });
    child.on('spawn', () => {
      if (!settled) {
        settled = true;
        child.unref();
        resolve();
      }
    });
  });
}
