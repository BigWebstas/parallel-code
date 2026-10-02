import fs from 'fs';
import path from 'path';

/**
 * Creates a symlink that also works for standard (non-elevated) users on
 * Windows. A plain `symlinkSync` defaults to a file link and throws EPERM
 * for directories unless the process is elevated or Developer Mode is on;
 * `junction` links need neither privilege but only work for directories and
 * require an absolute target.
 *
 * Behavior: POSIX is untouched (relative links stay relative). On Windows,
 * directory links first try a relative `dir` symlink — which keeps working
 * where privilege allows — and fall back to an absolute `junction`.
 */
export function symlinkCrossPlatform(source: string, target: string): void {
  if (process.platform !== 'win32') {
    fs.symlinkSync(source, target);
    return;
  }
  const absoluteSource = path.win32.isAbsolute(source)
    ? source
    : path.win32.resolve(path.win32.dirname(target), source);
  let sourceIsDir = false;
  try {
    sourceIsDir = fs.statSync(absoluteSource).isDirectory();
  } catch {
    sourceIsDir = false;
  }
  if (!sourceIsDir) {
    try {
      fs.symlinkSync(source, target);
    } catch {
      // No symlink privilege (no Developer Mode / elevation): a hard link
      // needs none and is enough for the read-mostly metadata files linked
      // here. If linkSync fails (e.g. cross-volume link), fall back to copy.
      try {
        fs.linkSync(absoluteSource, target);
      } catch {
        fs.copyFileSync(absoluteSource, target);
      }
    }
    return;
  }
  try {
    fs.symlinkSync(source, target, 'dir');
  } catch {
    fs.symlinkSync(absoluteSource, target, 'junction');
  }
}

/**
 * Unlinks a symlink or directory junction across platforms.
 * On Windows, Win32 DeleteFile fails on directory junctions (ERROR_ACCESS_DENIED / EPERM).
 * Directory junctions must be removed with fs.rmdirSync.
 */
export function unlinkSymlinkCrossPlatform(linkPath: string): void {
  try {
    fs.unlinkSync(linkPath);
  } catch (err) {
    if (process.platform === 'win32') {
      try {
        fs.rmdirSync(linkPath);
        return;
      } catch {
        // Fall through to re-throw original error
      }
    }
    throw err;
  }
}
