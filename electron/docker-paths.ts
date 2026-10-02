/**
 * Docker tasks mount host folders into a Linux container. On macOS and Linux a
 * folder is mounted at its own path, so host paths work unchanged inside. A
 * Linux container cannot use a Windows path (`C:\Git\repo`), so on Windows each
 * drive-letter path is mounted at `/c/Git/repo` instead, and every host path the
 * container reads (mounts, working directory, agent arguments, MCP configs) must
 * be translated the same way.
 */

const DRIVE_PATH = /^([A-Za-z]):(?:[\\/](.*))?$/;

/** True for an absolute Windows drive-letter path such as `C:\Git\repo`. */
export function isWindowsDrivePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value);
}

/** Where a host path appears inside the container. */
export function toContainerPath(hostPath: string, platform = process.platform): string {
  if (platform !== 'win32') return hostPath;
  const match = DRIVE_PATH.exec(hostPath);
  if (!match) return hostPath;
  const rest = (match[2] ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
  return `/${match[1].toLowerCase()}${rest ? `/${rest}` : ''}`;
}

/** A bind mount of `hostPath` at its container path. */
export function bindMount(hostPath: string, platform = process.platform): string[] {
  return ['-v', `${hostPath}:${toContainerPath(hostPath, platform)}`];
}

/** Agent arguments as the container sees them: host paths are translated, anything else is kept. */
export function toContainerArgs(args: string[], platform = process.platform): string[] {
  if (platform !== 'win32') return args;
  return args.map((arg) => (isWindowsDrivePath(arg) ? toContainerPath(arg, platform) : arg));
}
