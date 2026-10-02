import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { commandExistsOnPath, isExplicitCommandPath } from './command-path.js';

/** accessSync fake backed by a set of "existing" paths; records every probe. */
function fakeAccess(existing: Set<string>, seen: string[]) {
  return (candidate: string, _mode: number): void => {
    seen.push(candidate);
    if (!existing.has(candidate)) {
      const err = new Error(`ENOENT: ${candidate}`);
      throw err;
    }
  };
}

describe('isExplicitCommandPath', () => {
  it('treats slash paths as explicit on any platform', () => {
    expect(isExplicitCommandPath('/usr/bin/claude', 'win32')).toBe(true);
    expect(isExplicitCommandPath('./agent', 'darwin')).toBe(true);
  });

  it('treats drive-letter and backslash paths as explicit on Windows only', () => {
    expect(isExplicitCommandPath('C:\\tools\\claude.exe', 'win32')).toBe(true);
    expect(isExplicitCommandPath('C:claude', 'win32')).toBe(true);
    expect(isExplicitCommandPath('C:\\tools\\claude.exe', 'darwin')).toBe(false);
  });

  it('treats bare names as PATH lookups', () => {
    expect(isExplicitCommandPath('claude', 'win32')).toBe(false);
    expect(isExplicitCommandPath('claude', 'darwin')).toBe(false);
  });
});

describe('commandExistsOnPath', () => {
  it('finds a bare command in PATH without spawning a process', () => {
    const seen: string[] = [];
    const found = path.join('/usr/local/bin', 'claude');
    const ok = commandExistsOnPath('claude', {
      platform: 'darwin',
      pathEnv: '/usr/local/bin:/usr/bin',
      accessSync: fakeAccess(new Set([found]), seen),
    });
    expect(ok).toBe(true);
    expect(seen).toEqual([found]);
  });

  it('returns false when no PATH entry has the command', () => {
    const seen: string[] = [];
    const ok = commandExistsOnPath('nope', {
      platform: 'darwin',
      pathEnv: '/usr/local/bin:/usr/bin',
      accessSync: fakeAccess(new Set(), seen),
    });
    expect(ok).toBe(false);
    expect(seen).toEqual([path.join('/usr/local/bin', 'nope'), path.join('/usr/bin', 'nope')]);
  });

  it('checks an absolute path directly instead of scanning PATH', () => {
    const seen: string[] = [];
    const ok = commandExistsOnPath('/opt/agent/bin/run', {
      platform: 'darwin',
      pathEnv: '/usr/bin',
      accessSync: fakeAccess(new Set(['/opt/agent/bin/run']), seen),
    });
    expect(ok).toBe(true);
    expect(seen).toEqual(['/opt/agent/bin/run']);
  });

  it('returns false for a missing absolute path', () => {
    const ok = commandExistsOnPath('/nonexistent/run', {
      platform: 'darwin',
      pathEnv: '/usr/bin',
      accessSync: fakeAccess(new Set(), []),
    });
    expect(ok).toBe(false);
  });

  it('tries PATHEXT extensions for bare commands on Windows', () => {
    const seen: string[] = [];
    const withExe = path.win32.join('C:/tools', 'claude.EXE');
    const ok = commandExistsOnPath('claude', {
      platform: 'win32',
      pathEnv: 'C:/tools;D:/bin',
      pathextEnv: '.COM;.EXE;.BAT;.CMD',
      accessSync: fakeAccess(new Set([withExe]), seen),
    });
    expect(ok).toBe(true);
    expect(seen).toContain(withExe);
  });

  it('tries a Windows command with an executable extension as-is only', () => {
    const seen: string[] = [];
    const asIs = path.win32.join('C:/tools', 'app.exe');
    const ok = commandExistsOnPath('app.exe', {
      platform: 'win32',
      pathEnv: 'C:/tools',
      pathextEnv: '.COM;.EXE;.BAT;.CMD',
      accessSync: fakeAccess(new Set([asIs]), seen),
    });
    expect(ok).toBe(true);
    expect(seen).toEqual([asIs]);
  });

  it('rejects empty commands', () => {
    const accessSync = vi.fn();
    expect(commandExistsOnPath('', { accessSync })).toBe(false);
    expect(commandExistsOnPath('   ', { accessSync })).toBe(false);
    expect(accessSync).not.toHaveBeenCalled();
  });
});
