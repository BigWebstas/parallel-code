import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAntigravityUsage,
  findAntigravityCredentials,
  parseLanguageServerResponse,
  parseModelQuotas,
  parseQuotaCacheJson,
} from './antigravity-usage.js';

const NOW = 1_700_000_000_000;

describe('parseModelQuotas', () => {
  it('prefers a Pro model when available and computes used percentage', () => {
    const result = parseModelQuotas(
      {
        'Gemini 3.8 Flash (High)': {
          remainingFraction: 0.8,
          resetTime: '2026-09-29T03:40:56Z',
        },
        'Gemini 3.1 Pro (High)': {
          remainingFraction: 0.6,
          resetTime: '2026-09-29T03:40:56Z',
        },
      },
      NOW,
    );

    expect(result).toEqual({
      status: 'ok',
      fiveHour: {
        usedPercent: 40,
        resetsAt: Date.parse('2026-09-29T03:40:56Z'),
      },
      sevenDay: null,
      fetchedAt: NOW,
    });
  });

  it('selects the model with minimum remainingFraction if no Pro model is present', () => {
    const result = parseModelQuotas(
      {
        'Gemini 3.8 Flash (Low)': {
          remainingFraction: 0.9,
          resetTime: '2026-09-29T03:40:56Z',
        },
        'Gemini 3.8 Flash (High)': {
          remainingFraction: 0.3,
          resetTime: '2026-09-29T03:40:56Z',
        },
      },
      NOW,
    );

    expect(result).toEqual({
      status: 'ok',
      fiveHour: {
        usedPercent: 70,
        resetsAt: Date.parse('2026-09-29T03:40:56Z'),
      },
      sevenDay: null,
      fetchedAt: NOW,
    });
  });

  it('returns null when no valid models are provided', () => {
    expect(parseModelQuotas({}, NOW)).toBeNull();
  });
});

describe('parseLanguageServerResponse', () => {
  it('parses clientModelConfigs from GetUserStatus response', () => {
    const response = {
      userStatus: {
        cascadeModelConfigData: {
          clientModelConfigs: [
            {
              label: 'Gemini 3.1 Pro (High)',
              quotaInfo: {
                remainingFraction: 0.75,
                resetTime: '2026-09-29T05:00:00Z',
              },
            },
            {
              label: 'Claude Sonnet 4.6 (Thinking)',
              quotaInfo: {
                remainingFraction: 1,
                resetTime: '2026-09-29T06:00:00Z',
              },
            },
          ],
        },
      },
    };

    const result = parseLanguageServerResponse(response, NOW);
    expect(result).toEqual({
      status: 'ok',
      fiveHour: {
        usedPercent: 25,
        resetsAt: Date.parse('2026-09-29T05:00:00Z'),
      },
      sevenDay: null,
      fetchedAt: NOW,
    });
  });

  it('returns null on invalid response payload', () => {
    expect(parseLanguageServerResponse(null)).toBeNull();
    expect(parseLanguageServerResponse({})).toBeNull();
    expect(parseLanguageServerResponse({ userStatus: {} })).toBeNull();
  });
});

describe('parseQuotaCacheJson', () => {
  it('parses agy-hud quota cache JSON format', () => {
    const json = JSON.stringify({
      timestamp: '2026-09-28T17:00:00Z',
      plan_name: 'Pro',
      models: {
        'Gemini 3.1 Pro (High)': {
          remainingFraction: 0.5,
          resetTime: '2026-09-29T01:00:00Z',
        },
      },
    });

    const result = parseQuotaCacheJson(json, NOW);
    expect(result).toEqual({
      status: 'ok',
      fiveHour: {
        usedPercent: 50,
        resetsAt: Date.parse('2026-09-29T01:00:00Z'),
      },
      sevenDay: null,
      fetchedAt: NOW,
    });
  });

  it('handles invalid JSON gracefully', () => {
    expect(parseQuotaCacheJson('invalid-json')).toBeNull();
    expect(parseQuotaCacheJson('{}')).toBeNull();
  });
});

describe('findAntigravityCredentials', () => {
  it('reads credentials from environment variables', () => {
    const env = {
      ANTIGRAVITY_LS_ADDRESS: 'localhost:54321',
      ANTIGRAVITY_CSRF_TOKEN: 'mock-csrf-token',
    };
    expect(findAntigravityCredentials(env, 'linux')).toEqual({
      address: 'localhost:54321',
      token: 'mock-csrf-token',
    });
  });

  it('returns null when environment variables are absent and platform is not linux', () => {
    expect(findAntigravityCredentials({}, 'darwin')).toBeNull();
  });
});

describe('fetchAntigravityUsage', () => {
  let tmpDir: string;

  afterEach(() => {
    vi.restoreAllMocks();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('falls back to quota cache file when language server is unreachable', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-test-'));
    const cacheFile = path.join(tmpDir, 'quota_cache.json');
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        timestamp: '2026-09-28T12:00:00Z',
        plan_name: 'Pro',
        models: {
          'Gemini 3.1 Pro (High)': {
            remainingFraction: 0.65,
            resetTime: '2026-09-29T02:00:00Z',
          },
        },
      }),
    );

    const result = await fetchAntigravityUsage(null, cacheFile, NOW);
    expect(result).toEqual({
      status: 'ok',
      fiveHour: {
        usedPercent: 35,
        resetsAt: Date.parse('2026-09-29T02:00:00Z'),
      },
      sevenDay: null,
      fetchedAt: NOW,
    });
  });

  it('returns unavailable when neither server nor cache is found', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-test-'));
    const nonExistentCache = path.join(tmpDir, 'missing.json');

    const result = await fetchAntigravityUsage(null, nonExistentCache, NOW);
    expect(result).toEqual({
      status: 'unavailable',
      reason: 'No Antigravity quota found',
    });
  });
});
