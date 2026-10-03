import os from 'os';
import type { SessionCapabilities } from '../shared/delegation-types.js';
import { join, dirname } from 'path';
import { atomicWriteFile, atomicWriteFileSync } from './atomic.js';
import { toContainerPath } from '../docker-paths.js';

export interface SubTaskMcpConfigOpts {
  serverPath: string;
  serverUrl: string;
  subtaskToken: string;
  taskId: string;
  doneToken: string;
  sessionCapabilities?: SessionCapabilities;
  /** The config is read inside a Docker container, so host paths are translated. */
  inContainer?: boolean;
}

export interface SubTaskMcpConfig {
  mcpServers: {
    'parallel-code': {
      type: 'stdio';
      command: 'node';
      args: string[];
      env: {
        PARALLEL_CODE_MCP_TOKEN: string;
        PARALLEL_CODE_MCP_DONE_TOKEN: string;
      };
    };
  };
}

export function getMCPRemoteServerUrl(
  port: number,
  dockerContainerName?: string,
  platform = os.platform(),
): string {
  if (!dockerContainerName) return `http://127.0.0.1:${port}`;
  // Linux with --network host: the container shares the host's network namespace, so
  // 127.0.0.1 inside the container IS the host's loopback. Docker Desktop on macOS and
  // Windows has no host networking; host.docker.internal resolves to the host there.
  return platform === 'linux' ? `http://127.0.0.1:${port}` : `http://host.docker.internal:${port}`;
}

/**
 * Where to write a sub-task's MCP config file.
 *
 * In Docker mode the sub-task worktree is NOT an explicit volume mount, so
 * auto-discovery inside the container is unreliable. Instead, write the config
 * to the coordinator's .parallel-code/ dir (same dir as mcp-server.cjs) which
 * IS the explicit volume, and always pass it via --mcp-config.
 *
 * In host mode, use the OS temp directory (existing behaviour).
 */
export function getSubTaskMcpConfigPath(
  dockerContainerName: string | null | undefined,
  serverPath: string,
  taskId: string,
  tempDir = os.tmpdir(),
): string {
  return dockerContainerName
    ? join(dirname(serverPath), `subtask-${taskId}.json`)
    : join(tempDir, `parallel-code-subtask-${taskId}.json`);
}

/** Launch-time exposure only; the HTTP server independently enforces authority. */
export function sessionCapabilityArgs(capabilities?: SessionCapabilities): string[] {
  return capabilities
    ? [
        '--session-profile',
        capabilities.profile,
        ...(capabilities.canCreate ? ['--allow-create'] : []),
        ...(capabilities.peers ? ['--peer-tools'] : []),
      ]
    : [];
}

export function buildSubTaskMcpConfig(args: SubTaskMcpConfigOpts): SubTaskMcpConfig {
  return {
    mcpServers: {
      'parallel-code': {
        type: 'stdio',
        command: 'node',
        args: [
          args.inContainer ? toContainerPath(args.serverPath) : args.serverPath,
          '--url',
          args.serverUrl,
          '--task-id',
          args.taskId,
          ...sessionCapabilityArgs(args.sessionCapabilities),
        ],
        env: {
          PARALLEL_CODE_MCP_TOKEN: args.subtaskToken,
          PARALLEL_CODE_MCP_DONE_TOKEN: args.doneToken,
        },
      },
    },
  };
}

export async function writeSubTaskMcpConfig(
  configPath: string,
  config: SubTaskMcpConfig,
): Promise<void> {
  await atomicWriteFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function writeSubTaskMcpConfigSync(configPath: string, config: SubTaskMcpConfig): void {
  atomicWriteFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function isAllowedSubTaskMcpConfigPath(
  configPath: string | undefined,
  args: {
    taskId: string;
    serverPath?: string;
    dockerContainerName?: string | null;
    tempDir?: string;
  },
): boolean {
  if (!configPath) return false;
  const tempDir = args.tempDir ?? os.tmpdir();
  const allowed = new Set([getSubTaskMcpConfigPath(null, '', args.taskId, tempDir)]);
  if (args.dockerContainerName && args.serverPath) {
    allowed.add(
      getSubTaskMcpConfigPath(args.dockerContainerName, args.serverPath, args.taskId, tempDir),
    );
  }
  return allowed.has(configPath);
}

/**
 * Returns a warning string if a Docker coordinator has a stale 127.0.0.1 URL
 * in its MCP config (unreachable from macOS and Windows containers). Returns null if OK.
 */
export function detectStaleDockerMCPUrl(
  url: string,
  containerName: string | undefined,
  currentPlatform = os.platform(),
): string | null {
  if (!containerName) return null; // non-Docker: 127.0.0.1 is correct
  if (currentPlatform !== 'linux' && url.includes('127.0.0.1')) {
    return (
      `Docker coordinator MCP URL contains 127.0.0.1 but container "${containerName}" ` +
      `cannot reach 127.0.0.1 on ${currentPlatform === 'win32' ? 'Windows' : 'macOS'}. Use host.docker.internal instead.`
    );
  }
  return null;
}
