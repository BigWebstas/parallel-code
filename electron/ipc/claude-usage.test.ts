import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchClaudeUsage,
  parseClaudeUsageResponse,
  parseCreditUsage,
  readStatusLineUsage,
  parseClaudeStatusLine,
  recordClaudeStatusLine,
  resetClaudeUsage,
} from './claude-usage.js';

const NOW = 1_800_000_000_000;
const IN_AN_HOUR = NOW / 1000 + 3600;

function payload(rateLimits: unknown): unknown {
  return { session_id: 's', model: { id: 'm' }, rate_limits: rateLimits };
}

describe('parseClaudeStatusLine', () => {
  it('reads both windows in epoch seconds and clamps percentages', () => {
    expect(
      parseClaudeStatusLine(
        payload({
          five_hour: { used_percentage: 42.5, resets_at: IN_AN_HOUR },
          seven_day: { used_percentage: 120, resets_at: IN_AN_HOUR + 60 },
        }),
        NOW,
      ),
    ).toEqual({
      status: 'ok',
      fiveHour: { usedPercent: 42.5, resetsAt: IN_AN_HOUR * 1000 },
      sevenDay: { usedPercent: 100, resetsAt: (IN_AN_HOUR + 60) * 1000 },
      fetchedAt: NOW,
    });
  });

  it('keeps a window that arrives alone', () => {
    const parsed = parseClaudeStatusLine(payload({ seven_day: { used_percentage: 3 } }), NOW);
    expect(parsed).toMatchObject({
      fiveHour: null,
      sevenDay: { usedPercent: 3, resetsAt: null },
    });
  });

  it('reads a gateway spend limit once its dollar figures arrive', () => {
    expect(
      parseClaudeStatusLine(
        payload({ spend_limit: { used_percentage: 63, used_usd: 314.12, limit_usd: 500 } }),
        NOW,
      ),
    ).toMatchObject({
      creditUsage: { used: 314.12, limit: 500, currency: 'USD', usedPercent: 63 },
    });
    expect(parseClaudeStatusLine(payload({ spend_limit: { used_percentage: 63 } }), NOW)).toBe(
      null,
    );
  });

  it('returns null without rate limits, as for an API-key session', () => {
    expect(parseClaudeStatusLine({ session_id: 's' }, NOW)).toBeNull();
    expect(parseClaudeStatusLine(payload({}), NOW)).toBeNull();
    expect(parseClaudeStatusLine(payload('nope'), NOW)).toBeNull();
    expect(parseClaudeStatusLine(null, NOW)).toBeNull();
  });
});

describe('readStatusLineUsage', () => {
  afterEach(() => resetClaudeUsage());

  it('is unavailable until a session reports, then serves the last report', () => {
    expect(readStatusLineUsage(NOW).status).toBe('unavailable');
    recordClaudeStatusLine(
      payload({ five_hour: { used_percentage: 10, resets_at: IN_AN_HOUR } }),
      NOW,
    );
    expect(readStatusLineUsage(NOW + 1000)).toEqual({
      status: 'ok',
      fiveHour: { usedPercent: 10, resetsAt: IN_AN_HOUR * 1000 },
      sevenDay: null,
      fetchedAt: NOW,
    });
  });

  it('drops windows whose reset has passed', () => {
    recordClaudeStatusLine(
      payload({
        five_hour: { used_percentage: 10, resets_at: IN_AN_HOUR },
        seven_day: { used_percentage: 20, resets_at: IN_AN_HOUR + 86_400 },
      }),
      NOW,
    );
    const later = (IN_AN_HOUR + 1) * 1000;
    expect(readStatusLineUsage(later)).toMatchObject({
      fiveHour: null,
      sevenDay: { usedPercent: 20 },
    });
    expect(readStatusLineUsage((IN_AN_HOUR + 86_401) * 1000).status).toBe('unavailable');
  });

  it('reports a change only when the numbers move', () => {
    const report = payload({ five_hour: { used_percentage: 10, resets_at: IN_AN_HOUR } });
    expect(recordClaudeStatusLine(report, NOW)).toBe(true);
    expect(recordClaudeStatusLine(report, NOW + 300)).toBe(false);
    expect(
      recordClaudeStatusLine(
        payload({ five_hour: { used_percentage: 11, resets_at: IN_AN_HOUR } }),
        NOW + 600,
      ),
    ).toBe(true);
    expect(recordClaudeStatusLine({ session_id: 's' }, NOW + 900)).toBe(false);
    expect(readStatusLineUsage(NOW + 1000)).toMatchObject({ fiveHour: { usedPercent: 11 } });
  });
});

// The shape an enterprise seat with a monthly credit limit returns (figures rounded).
const ENTERPRISE_BODY = {
  five_hour: null,
  seven_day: null,
  extra_usage: {
    is_enabled: true,
    monthly_limit: 40000,
    used_credits: 7911,
    utilization: 19.7775,
    currency: 'USD',
    decimal_places: 2,
  },
  spend: {
    used: { amount_minor: 7911, currency: 'USD', exponent: 2 },
    limit: { amount_minor: 40000, currency: 'USD', exponent: 2 },
    percent: 20,
    enabled: true,
  },
};

describe('parseCreditUsage', () => {
  it('reads the monthly allotment in dollars from extra_usage', () => {
    expect(parseCreditUsage(ENTERPRISE_BODY)).toEqual({
      used: 79.11,
      limit: 400,
      currency: 'USD',
      usedPercent: 19.7775,
    });
  });

  it('falls back to the spend object, and works out the percentage when it is missing', () => {
    expect(
      parseCreditUsage({
        spend: {
          used: { amount_minor: 5000, currency: 'EUR', exponent: 2 },
          limit: { amount_minor: 20000, exponent: 2 },
          enabled: true,
        },
      }),
    ).toEqual({ used: 50, limit: 200, currency: 'EUR', usedPercent: 25 });
  });

  it('ignores credits that are switched off and unused', () => {
    expect(
      parseCreditUsage({ extra_usage: { is_enabled: false, monthly_limit: 100, used_credits: 0 } }),
    ).toBeNull();
    expect(parseCreditUsage(null)).toBeNull();
  });
});

describe('parseClaudeUsageResponse', () => {
  it('returns credits alone when the login has no rate-limit windows', () => {
    expect(parseClaudeUsageResponse(ENTERPRISE_BODY, NOW)).toEqual({
      status: 'ok',
      fiveHour: null,
      sevenDay: null,
      creditUsage: { used: 79.11, limit: 400, currency: 'USD', usedPercent: 19.7775 },
      fetchedAt: NOW,
    });
  });

  it('reads windows spelled utilization', () => {
    expect(
      parseClaudeUsageResponse({ five_hour: { utilization: 42, resets_at: IN_AN_HOUR } }, NOW),
    ).toMatchObject({ fiveHour: { usedPercent: 42, resetsAt: IN_AN_HOUR * 1000 } });
  });

  it('returns null when the body has nothing to show', () => {
    expect(parseClaudeUsageResponse({ five_hour: null, seven_day: null }, NOW)).toBeNull();
  });
});

describe('fetchClaudeUsage', () => {
  const dirs: string[] = [];
  afterEach(() => {
    resetClaudeUsage();
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  function configWith(oauth: Record<string, unknown> | null): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-usage-'));
    dirs.push(dir);
    if (oauth)
      fs.writeFileSync(
        path.join(dir, '.credentials.json'),
        JSON.stringify({ claudeAiOauth: oauth }),
      );
    return dir;
  }

  const okCredits = {
    status: 'ok' as const,
    fiveHour: null,
    sevenDay: null,
    creditUsage: { used: 79.11, limit: 400, currency: 'USD', usedPercent: 19.8 },
    fetchedAt: NOW,
  };

  it.skipIf(process.platform === 'darwin')(
    'asks the usage endpoint with the login token when no session has reported',
    async () => {
      const request = vi.fn().mockResolvedValue(okCredits);
      const result = await fetchClaudeUsage({
        now: NOW,
        configDir: configWith({ accessToken: 'tok-123', expiresAt: NOW + 60_000 }),
        request,
      });
      expect(result).toBe(okCredits);
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0][0]).toMatchObject({
        url: 'https://api.anthropic.com/api/oauth/usage',
        headers: { Authorization: 'Bearer tok-123' },
      });
    },
  );

  it('never reads the login while a session has reported', async () => {
    recordClaudeStatusLine(
      payload({ five_hour: { used_percentage: 10, resets_at: IN_AN_HOUR } }),
      NOW,
    );
    const request = vi.fn();
    const result = await fetchClaudeUsage({
      now: NOW + 1000,
      configDir: configWith({ accessToken: 'tok-123', expiresAt: NOW + 60_000 }),
      request,
    });
    expect(result).toMatchObject({ status: 'ok', fiveHour: { usedPercent: 10 } });
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps the status line answer for an API-key login with no credentials file', async () => {
    const request = vi.fn();
    const result = await fetchClaudeUsage({ now: NOW, configDir: configWith(null), request });
    expect(result.status).toBe('unavailable');
    expect(request).not.toHaveBeenCalled();
  });

  it('does not call out with a lapsed token', async () => {
    const request = vi.fn();
    const result = await fetchClaudeUsage({
      now: NOW,
      configDir: configWith({ accessToken: 'tok-123', expiresAt: NOW - 1 }),
      request,
    });
    expect(result.status).toBe('unavailable');
    expect(request).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform === 'darwin')(
    'passes a failed lookup on, and shrugs off an empty one',
    async () => {
      const configDir = configWith({ accessToken: 'tok-123', expiresAt: NOW + 60_000 });
      const failed = { status: 'error' as const, message: 'login token rejected' };
      await expect(
        fetchClaudeUsage({ now: NOW, configDir, request: vi.fn().mockResolvedValue(failed) }),
      ).resolves.toBe(failed);
      const empty = { status: 'unavailable' as const, reason: 'No rate-limit windows in response' };
      const result = await fetchClaudeUsage({
        now: NOW,
        configDir,
        request: vi.fn().mockResolvedValue(empty),
      });
      expect(result).toMatchObject({
        status: 'unavailable',
        reason: expect.stringContaining('No Claude Code session'),
      });
    },
  );
});
