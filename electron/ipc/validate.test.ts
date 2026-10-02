import { describe, expect, it } from 'vitest';
import {
  assertBoolean,
  assertInt,
  assertOptionalBoolean,
  assertOptionalString,
  assertString,
  assertStringArray,
  validatePath,
} from './validate.js';

describe('validatePath', () => {
  it('accepts POSIX absolute paths', () => {
    expect(() => validatePath('/home/user/project', 'repoRoot')).not.toThrow();
  });

  it('accepts Windows absolute paths with backslashes or forward slashes', () => {
    expect(() => validatePath('C:\\Users\\user\\project', 'repoRoot')).not.toThrow();
    expect(() => validatePath('C:/Users/user/project', 'repoRoot')).not.toThrow();
    expect(() => validatePath('\\\\server\\share\\repo', 'repoRoot')).not.toThrow();
  });

  it('rejects relative paths', () => {
    expect(() => validatePath('relative/path', 'repoRoot')).toThrow('repoRoot must be absolute');
    expect(() => validatePath('./project', 'repoRoot')).toThrow('repoRoot must be absolute');
  });

  it('rejects paths containing traversal (..)', () => {
    expect(() => validatePath('/home/user/../other', 'repoRoot')).toThrow('must not contain ".."');
    expect(() => validatePath('C:\\Users\\user\\..\\other', 'repoRoot')).toThrow(
      'must not contain ".."',
    );
  });

  it('rejects non-string inputs', () => {
    expect(() => validatePath(123, 'repoRoot')).toThrow('repoRoot must be a string');
    expect(() => validatePath(null, 'repoRoot')).toThrow('repoRoot must be a string');
  });
});

describe('type assertion helpers', () => {
  it('assertString validates strings', () => {
    expect(() => assertString('hello', 'test')).not.toThrow();
    expect(() => assertString(42, 'test')).toThrow('test must be a string');
  });

  it('assertInt validates integers', () => {
    expect(() => assertInt(42, 'test')).not.toThrow();
    expect(() => assertInt(3.14, 'test')).toThrow('test must be an integer');
    expect(() => assertInt('42', 'test')).toThrow('test must be an integer');
  });

  it('assertBoolean validates booleans', () => {
    expect(() => assertBoolean(true, 'test')).not.toThrow();
    expect(() => assertBoolean(false, 'test')).not.toThrow();
    expect(() => assertBoolean(1, 'test')).toThrow('test must be a boolean');
  });

  it('assertStringArray validates string arrays', () => {
    expect(() => assertStringArray(['a', 'b'], 'test')).not.toThrow();
    expect(() => assertStringArray([], 'test')).not.toThrow();
    expect(() => assertStringArray(['a', 1], 'test')).toThrow('test must be a string array');
  });

  it('assertOptionalString validates optional strings', () => {
    expect(() => assertOptionalString('hello', 'test')).not.toThrow();
    expect(() => assertOptionalString(undefined, 'test')).not.toThrow();
    expect(() => assertOptionalString(123, 'test')).toThrow('test must be a string or undefined');
  });

  it('assertOptionalBoolean validates optional booleans', () => {
    expect(() => assertOptionalBoolean(true, 'test')).not.toThrow();
    expect(() => assertOptionalBoolean(undefined, 'test')).not.toThrow();
    expect(() => assertOptionalBoolean('true', 'test')).toThrow(
      'test must be a boolean or undefined',
    );
  });
});
