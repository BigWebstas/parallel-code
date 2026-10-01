/**
 * Builds the `--settings` JSON handed to every Claude Code launch. Hooks from
 * a `--settings` file merge with the user's own hooks rather than replacing
 * them, so this never touches `~/.claude/settings.json`.
 */

/** Hook wall-clock budget. The script answers in milliseconds; this only caps a wedged curl. */
const HOOK_TIMEOUT_SECONDS = 10;

/** Events that carry a `tool_name` and therefore need a matcher. */
const TOOL_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'];
const TURN_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Stop', 'StopFailure'];
// idle_prompt is a turn boundary signal; the rest all mean "blocked on the human".
const NOTIFICATION_MATCHER =
  'permission_prompt|idle_prompt|agent_needs_input|elicitation_dialog|elicitation_url_dialog';

interface CommandHook {
  type: 'command';
  command: string;
  timeout: number;
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
 * Hook command that runs the hook script. POSIX uses `/bin/sh`; Windows has
 * no `/bin/sh`, so hooks there run through PowerShell (present since Windows
 * 10) with a double-quoted `-File` path — cmd.exe only honors double quotes.
 */
export function hookCommand(
  hookScriptPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') {
    return `powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "${hookScriptPath.replace(/"/g, '`"')}"`;
  }
  return `/bin/sh ${shellQuote(hookScriptPath)}`;
}

export function buildClaudeHookSettings(
  hookScriptPath: string,
  platform: NodeJS.Platform = process.platform,
): ClaudeHookSettings {
  const hook: CommandHook = {
    type: 'command',
    command: hookCommand(hookScriptPath, platform),
    timeout: HOOK_TIMEOUT_SECONDS,
  };
  const hooks: Record<string, HookGroup[]> = {};
  for (const event of TURN_EVENTS) hooks[event] = [{ hooks: [hook] }];
  for (const event of TOOL_EVENTS) hooks[event] = [{ matcher: '*', hooks: [hook] }];
  hooks.Notification = [{ matcher: NOTIFICATION_MATCHER, hooks: [hook] }];
  return { hooks };
}
