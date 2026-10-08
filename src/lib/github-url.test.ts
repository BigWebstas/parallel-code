import { describe, expect, it } from 'vitest';
import { parseGitHubUrl, extractGitHubUrl, taskNameFromGitHubUrl } from './github-url';

describe('enterprise PR URLs', () => {
  it('recognizes PRs on arbitrary hosts for task naming', () => {
    const parsed = parseGitHubUrl('https://code.acme.test/team/repo/pull/42/files');
    expect(parsed).toEqual({ org: 'team', repo: 'repo', type: 'pull', number: '42' });
    expect(parsed && taskNameFromGitHubUrl(parsed)).toBe('pr 42');
  });

  it('extracts enterprise PR links after unrelated URLs', () => {
    expect(
      extractGitHubUrl('See https://example.com/docs/page then https://code.acme.test/o/r/pull/42'),
    ).toBe('https://code.acme.test/o/r/pull/42');
  });

  it.each([
    'https://example.com/docs/page',
    'https://code.acme.test/o/r/pull/no',
    'https://user:pass@code.acme.test/o/r/pull/42',
    'http://code.acme.test/o/r/pull/42',
  ])('rejects %s', (url) => expect(parseGitHubUrl(url)).toBeNull());

  it('keeps public GitHub repository and issue parsing', () => {
    expect(parseGitHubUrl('https://github.com/o/r')).toEqual({ org: 'o', repo: 'r' });
    expect(parseGitHubUrl('https://github.com/o/r/issues/4')?.number).toBe('4');
  });
});
