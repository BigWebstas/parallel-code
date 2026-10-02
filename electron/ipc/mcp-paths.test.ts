import path from 'path';
import { describe, expect, it } from 'vitest';
import { getDockerMcpServerDestPath, hostMcpServerPath } from './mcp-paths.js';

describe('hostMcpServerPath', () => {
  it('points to mcp-server.cjs next to dist-electron in dev mode', () => {
    const p = hostMcpServerPath();
    expect(p).toMatch(/mcp-server\.cjs$/);
    expect(p).not.toContain('app.asar.unpacked');
  });

  it.skipIf(process.platform === 'win32')(
    'redirects from app.asar to app.asar.unpacked on POSIX paths',
    () => {
      const asarUrl = 'file:///opt/parallel-code/resources/app.asar/dist-electron/ipc/mcp-paths.js';
      const result = hostMcpServerPath(asarUrl);
      expect(result).toBe(
        '/opt/parallel-code/resources/app.asar.unpacked/dist-electron/mcp-server.cjs',
      );
    },
  );

  it('redirects from app.asar to app.asar.unpacked on Windows paths', () => {
    const asarUrl =
      'file:///C:/Users/runner/AppData/Local/Programs/parallel-code/resources/app.asar/dist-electron/ipc/mcp-paths.js';
    const result = hostMcpServerPath(asarUrl);
    // On POSIX hosts fileURLToPath will create /C:/..., on Windows C:\...; both must resolve to app.asar.unpacked
    expect(result).toContain('app.asar.unpacked');
    expect(result).not.toMatch(/[/\\]app\.asar[/\\]/);
    expect(result).toMatch(/mcp-server\.cjs$/);
  });
});

describe('getDockerMcpServerDestPath', () => {
  it('places mcp-server.cjs under .parallel-code in the worktree', () => {
    expect(getDockerMcpServerDestPath('/repo/worktree', '/repo')).toBe(
      path.join('/repo/worktree', '.parallel-code', 'mcp-server.cjs'),
    );
  });

  it('falls back to projectRoot when worktreePath is undefined', () => {
    expect(getDockerMcpServerDestPath(undefined, '/repo')).toBe(
      path.join('/repo', '.parallel-code', 'mcp-server.cjs'),
    );
  });
});
