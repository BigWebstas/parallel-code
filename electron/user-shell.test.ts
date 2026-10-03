import { describe, expect, it } from 'vitest';
import { resolveTerminalShell, resolveUserShell } from './user-shell.js';

const mockUserInfo = {
  username: 'test-user',
  uid: 501,
  gid: 20,
  homedir: '/home/test-user',
};

const allowShells =
  (...shells: string[]) =>
  (shell: string) =>
    shells.includes(shell);

describe('resolveUserShell', () => {
  it('prefers the OS account shell over the inherited SHELL env var', () => {
    const shell = resolveUserShell({
      userInfo: () => ({
        ...mockUserInfo,
        shell: '/bin/zsh',
      }),
      env: { SHELL: '/bin/bash' },
      platform: 'darwin',
      canUseShell: allowShells('/bin/zsh', '/bin/bash'),
    });

    expect(shell).toBe('/bin/zsh');
  });

  it('falls back to SHELL when the OS lookup has no shell', () => {
    const shell = resolveUserShell({
      userInfo: () => ({
        ...mockUserInfo,
        shell: '',
      }),
      env: { SHELL: '/opt/homebrew/bin/bash' },
      platform: 'darwin',
      canUseShell: allowShells('/opt/homebrew/bin/bash'),
    });

    expect(shell).toBe('/opt/homebrew/bin/bash');
  });

  it('falls back to SHELL when the OS lookup throws', () => {
    const shell = resolveUserShell({
      userInfo: () => {
        throw new Error('unavailable');
      },
      env: { SHELL: '/bin/zsh' },
      platform: 'linux',
      canUseShell: allowShells('/bin/zsh'),
    });

    expect(shell).toBe('/bin/zsh');
  });

  it('falls back to SHELL when the OS shell is not executable', () => {
    const shell = resolveUserShell({
      userInfo: () => ({
        ...mockUserInfo,
        shell: '/missing/zsh',
      }),
      env: { SHELL: '/bin/bash' },
      platform: 'linux',
      canUseShell: allowShells('/bin/bash'),
    });

    expect(shell).toBe('/bin/bash');
  });

  it('falls back to /bin/sh on POSIX when neither OS nor env provides a usable shell', () => {
    const shell = resolveUserShell({
      userInfo: () => ({
        ...mockUserInfo,
        shell: '/missing/zsh',
      }),
      env: { SHELL: '/missing/bash' },
      platform: 'linux',
      canUseShell: allowShells(),
    });

    expect(shell).toBe('/bin/sh');
  });

  it('falls back to COMSPEC on Windows when neither OS nor env provides a usable shell', () => {
    const shell = resolveUserShell({
      userInfo: () => ({
        ...mockUserInfo,
        shell: '',
      }),
      env: { COMSPEC: 'C:\\Windows\\system32\\cmd.exe' },
      platform: 'win32',
      canUseShell: allowShells(),
    });

    expect(shell).toBe('C:\\Windows\\system32\\cmd.exe');
  });
});

describe('resolveTerminalShell', () => {
  const noShell = {
    userInfo: () => ({ ...mockUserInfo, shell: '' }),
    platform: 'win32' as const,
    canUseShell: allowShells(),
  };

  it('opens PowerShell 7 on Windows when it is installed', () => {
    const shell = resolveTerminalShell({
      ...noShell,
      env: { COMSPEC: 'C:\\Windows\\system32\\cmd.exe' },
      findProgram: (name) =>
        name === 'pwsh' ? 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' : undefined,
    });
    expect(shell).toBe('C:\\Program Files\\PowerShell\\7\\pwsh.exe');
  });

  it('falls back to the built-in Windows PowerShell, never cmd.exe', () => {
    const shell = resolveTerminalShell({
      ...noShell,
      env: { COMSPEC: 'C:\\Windows\\system32\\cmd.exe', SystemRoot: 'D:\\Windows' },
      findProgram: () => undefined,
    });
    expect(shell).toBe('D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  });

  it("keeps the user's own shell and the POSIX default", () => {
    const shell = resolveTerminalShell({
      ...noShell,
      env: { SHELL: 'C:\\tools\\nu.exe' },
      canUseShell: allowShells('C:\\tools\\nu.exe'),
      findProgram: () => undefined,
    });
    expect(shell).toBe('C:\\tools\\nu.exe');
    expect(
      resolveTerminalShell({
        ...noShell,
        platform: 'linux',
        env: {},
        findProgram: () => undefined,
      }),
    ).toBe('/bin/sh');
  });
});
