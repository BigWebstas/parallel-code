import { describe, expect, it } from 'vitest';
import { bindMount, toContainerArgs, toContainerPath } from './docker-paths.js';

describe('toContainerPath', () => {
  it('keeps host paths on macOS and Linux', () => {
    expect(toContainerPath('/Users/me/repo', 'darwin')).toBe('/Users/me/repo');
    expect(toContainerPath('/home/me/repo', 'linux')).toBe('/home/me/repo');
  });

  it('maps Windows drive paths to /<drive>/… in the container', () => {
    expect(toContainerPath('C:\\Git\\repo', 'win32')).toBe('/c/Git/repo');
    expect(toContainerPath('D:/work/my repo/', 'win32')).toBe('/d/work/my repo');
    expect(toContainerPath('C:\\', 'win32')).toBe('/c');
  });

  it('leaves paths that are not drive paths alone', () => {
    expect(toContainerPath('/tmp/home', 'win32')).toBe('/tmp/home');
    expect(toContainerPath('\\\\server\\share', 'win32')).toBe('\\\\server\\share');
  });
});

describe('bindMount', () => {
  it('mounts the host path at its container path', () => {
    expect(bindMount('C:\\Git\\repo', 'win32')).toEqual(['-v', 'C:\\Git\\repo:/c/Git/repo']);
    expect(bindMount('/home/me/repo', 'linux')).toEqual(['-v', '/home/me/repo:/home/me/repo']);
  });
});

describe('toContainerArgs', () => {
  it('translates only drive-path arguments on Windows', () => {
    expect(
      toContainerArgs(
        ['--mcp-config', 'C:\\repo\\.parallel-code\\mcp.json', 'C: is a drive'],
        'win32',
      ),
    ).toEqual(['--mcp-config', '/c/repo/.parallel-code/mcp.json', 'C: is a drive']);
    expect(toContainerArgs(['C:\\repo'], 'linux')).toEqual(['C:\\repo']);
  });
});
