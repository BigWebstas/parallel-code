import { describe, expect, it } from 'vitest';
import { buildClaudeHookSettings, detectWindowsHookShell } from './claude-settings.js';

describe('buildClaudeHookSettings', () => {
  // Explicit platform so this POSIX expectation holds on Windows dev machines too.
  const settings = buildClaudeHookSettings('/Users/me/Library/App Support/hook.sh', 'darwin');

  it('registers turn, tool, and notification events', () => {
    expect(Object.keys(settings.hooks).sort()).toEqual(
      [
        'Notification',
        'PermissionRequest',
        'PostToolUse',
        'PostToolUseFailure',
        'PreToolUse',
        'SessionStart',
        'Stop',
        'StopFailure',
        'UserPromptSubmit',
      ].sort(),
    );
  });

  it('matches every tool and only the blocking notification types', () => {
    expect(settings.hooks.PreToolUse[0].matcher).toBe('*');
    expect(settings.hooks.PermissionRequest[0].matcher).toBe('*');
    expect(settings.hooks.Stop[0].matcher).toBeUndefined();
    expect(settings.hooks.Notification[0].matcher).toBe(
      'permission_prompt|idle_prompt|agent_needs_input|elicitation_dialog|elicitation_url_dialog',
    );
  });

  it('runs the script through /bin/sh with the path quoted and a short timeout', () => {
    const hook = settings.hooks.Stop[0].hooks[0];
    expect(hook).toEqual({
      type: 'command',
      command: "/bin/sh '/Users/me/Library/App Support/hook.sh'",
      timeout: 10,
    });
  });

  it('runs the batch script through cmd.exe from Git Bash with path rewriting off', () => {
    const win = buildClaudeHookSettings('C:\\Users\\me\\App Data\\hook.cmd', 'win32', 'bash');
    expect(win.hooks.Stop[0].hooks[0]).toEqual({
      type: 'command',
      command:
        'MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL=\'*\' cmd.exe /d /c "C:\\Users\\me\\App Data\\hook.cmd"',
      timeout: 10,
      shell: 'bash',
    });
  });

  it('runs the batch script directly from PowerShell when Git Bash is missing', () => {
    const win = buildClaudeHookSettings('C:\\Users\\me\\App Data\\hook.cmd', 'win32', 'powershell');
    expect(win.hooks.Stop[0].hooks[0]).toEqual({
      type: 'command',
      command: '& "C:\\Users\\me\\App Data\\hook.cmd"',
      timeout: 10,
      shell: 'powershell',
    });
  });

  it('pins no shell off Windows', () => {
    expect(settings.hooks.Stop[0].hooks[0].shell).toBeUndefined();
  });

  it('does not register compaction hooks, which fire mid-turn', () => {
    expect(settings.hooks.PreCompact).toBeUndefined();
    expect(settings.hooks.PostCompact).toBeUndefined();
  });
});

describe('detectWindowsHookShell', () => {
  const files =
    (...present: string[]) =>
    (file: string) =>
      present.includes(file);

  it('uses Git Bash when git.exe on PATH sits beside a bin\\bash.exe', () => {
    const env = { PATH: 'C:\\Windows;C:\\Program Files\\Git\\cmd' };
    const exists = files(
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files\\Git\\bin\\bash.exe',
    );
    expect(detectWindowsHookShell(env, exists)).toBe('bash');
  });

  it('falls back to PowerShell without Git for Windows', () => {
    expect(detectWindowsHookShell({ PATH: 'C:\\Windows' }, files())).toBe('powershell');
  });

  it('follows CLAUDE_CODE_GIT_BASH_PATH like Claude Code does', () => {
    const env = { CLAUDE_CODE_GIT_BASH_PATH: 'D:\\tools\\bash.exe', PATH: '' };
    expect(detectWindowsHookShell(env, files('D:\\tools\\bash.exe'))).toBe('bash');
    expect(detectWindowsHookShell(env, files())).toBe('powershell');
  });
});
