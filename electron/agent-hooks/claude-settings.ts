/**
 * Builds the `--settings` JSON handed to every Claude Code launch. Hooks from
 * a `--settings` file merge with the user's own hooks rather than replacing
 * them, so this never touches `~/.claude/settings.json`.
 */

import fs from 'fs';
import path from 'path';

/** Hook wall-clock budget. The script answers in milliseconds; this only caps a wedged curl. */
const HOOK_TIMEOUT_SECONDS = 10;

/** Events that carry a `tool_name` and therefore need a matcher. */
const TOOL_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'];
const TURN_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Stop', 'StopFailure'];
// idle_prompt is a turn boundary signal; the rest all mean "blocked on the human".
const NOTIFICATION_MATCHER =
  'permission_prompt|idle_prompt|agent_needs_input|elicitation_dialog|elicitation_url_dialog';

/** The shell Claude Code runs a hook command through on Windows. */
export type WindowsHookShell = 'bash' | 'powershell';

interface CommandHook {
  type: 'command';
  command: string;
  timeout: number;
  shell?: WindowsHookShell;
}

interface HookGroup {
  matcher?: string;
  hooks: CommandHook[];
}

export interface ClaudeHookSettings {
  hooks: Record<string, HookGroup[]>;
}

/** Quote for `/bin/sh` so a userData path with spaces survives. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * The shell Claude Code will run hooks through on Windows, found the way
 * Claude Code finds it: `CLAUDE_CODE_GIT_BASH_PATH`, else the `bin\bash.exe`
 * of a Git for Windows install whose `git.exe` is on PATH. Scans PATH with
 * file checks rather than `where`, which would block the main process.
 */
export function detectWindowsHookShell(
  env: NodeJS.ProcessEnv = process.env,
  exists: (file: string) => boolean = fs.existsSync,
): WindowsHookShell {
  const configured = env.CLAUDE_CODE_GIT_BASH_PATH;
  if (configured) return exists(configured) ? 'bash' : 'powershell';
  const dirs = (env.PATH ?? env.Path ?? '').split(';').filter(Boolean);
  const found = dirs.some(
    (dir) =>
      exists(path.win32.join(dir, 'git.exe')) &&
      exists(path.win32.join(dir, '..', 'bin', 'bash.exe')),
  );
  return found ? 'bash' : 'powershell';
}

/**
 * Hook command that runs the hook script. POSIX uses `/bin/sh`. On Windows
 * Claude Code runs hook commands through Git Bash, or PowerShell without it;
 * the settings pin that shell and the command runs the batch script in it:
 *  - bash: Git Bash rewrites `/d` and `/c` into drive paths, which would start
 *    an interactive cmd.exe reading the hook payload as commands — the
 *    MSYS_NO_PATHCONV and MSYS2_ARG_CONV_EXCL prefixes turn that rewriting off.
 *  - powershell: `&` runs the quoted path. If bash ever gets this command it
 *    is a syntax error, so it fails closed rather than running anything.
 */
export function hookCommand(
  hookScriptPath: string,
  platform: NodeJS.Platform = process.platform,
  windowsShell: WindowsHookShell = 'powershell',
): string {
  if (platform === 'win32') {
    const quoted = `"${hookScriptPath}"`;
    return windowsShell === 'bash'
      ? `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cmd.exe /d /c ${quoted}`
      : `& ${quoted}`;
  }
  return `/bin/sh ${shellQuote(hookScriptPath)}`;
}

export function buildClaudeHookSettings(
  hookScriptPath: string,
  platform: NodeJS.Platform = process.platform,
  windowsShell: WindowsHookShell = 'powershell',
): ClaudeHookSettings {
  const hook: CommandHook = {
    type: 'command',
    command: hookCommand(hookScriptPath, platform, windowsShell),
    timeout: HOOK_TIMEOUT_SECONDS,
    ...(platform === 'win32' ? { shell: windowsShell } : {}),
  };
  const hooks: Record<string, HookGroup[]> = {};
  for (const event of TURN_EVENTS) hooks[event] = [{ hooks: [hook] }];
  for (const event of TOOL_EVENTS) hooks[event] = [{ matcher: '*', hooks: [hook] }];
  hooks.Notification = [{ matcher: NOTIFICATION_MATCHER, hooks: [hook] }];
  return { hooks };
}
