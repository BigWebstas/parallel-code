import fs from 'fs';
import os from 'os';
import path from 'path';
import type { UsageResult, UsageWindow } from './shared-types.js';
import { debug as logDebug, warn as logWarn, errMessage } from '../log.js';
import { clampPercent, finite, parseResetsAt } from './usage-shared.js';

export interface AntigravityModelQuota {
  remainingFraction: number;
  resetTime?: string | null;
}

export interface AntigravityCredentials {
  address: string;
  token: string;
}

export function defaultQuotaCachePath(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.AGY_HUD_QUOTA_CACHE ||
    path.join(
      env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'),
      'agy-hud',
      'quota_cache.json',
    )
  );
}

/**
 * Searches process.env or Linux /proc for running Antigravity Language Server credentials.
 */
export function findAntigravityCredentials(
  env: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
): AntigravityCredentials | null {
  if (env.ANTIGRAVITY_LS_ADDRESS && env.ANTIGRAVITY_CSRF_TOKEN) {
    return {
      address: env.ANTIGRAVITY_LS_ADDRESS,
      token: env.ANTIGRAVITY_CSRF_TOKEN,
    };
  }

  if (platform === 'linux') {
    try {
      const pids = fs.readdirSync('/proc');
      for (const pid of pids) {
        if (!/^\d+$/.test(pid)) continue;
        try {
          const environ = fs.readFileSync(`/proc/${pid}/environ`, 'utf8');
          if (environ.includes('ANTIGRAVITY_CSRF_TOKEN=')) {
            const lines = environ.split('\0');
            let token: string | null = null;
            let address: string | null = null;
            for (const l of lines) {
              if (l.startsWith('ANTIGRAVITY_CSRF_TOKEN=')) token = l.slice(23);
              if (l.startsWith('ANTIGRAVITY_LS_ADDRESS=')) address = l.slice(23);
            }
            if (token && address) {
              return { address, token };
            }
          }
        } catch {
          // Process exited or permission denied; continue scanning.
        }
      }
    } catch {
      // /proc unreadable
    }
  }

  return null;
}

/**
 * Selects the best model quota to track (prioritizing Pro models, or the model
 * with the lowest remaining fraction) and maps it to a standard UsageResult.
 */
export function parseModelQuotas(
  models: Record<string, AntigravityModelQuota>,
  now = Date.now(),
): UsageResult | null {
  const entries = Object.entries(models).filter(
    ([, q]) => q && typeof q.remainingFraction === 'number' && Number.isFinite(q.remainingFraction),
  );
  if (entries.length === 0) return null;

  // Prefer Pro models, or pick the model with minimum remaining quota
  let chosen = entries.find(([label]) => label.toLowerCase().includes('pro'));
  if (!chosen) {
    chosen = entries.reduce((min, cur) =>
      cur[1].remainingFraction < min[1].remainingFraction ? cur : min,
    );
  }

  const [, quota] = chosen;
  const remaining = Math.max(0, Math.min(1, quota.remainingFraction));
  const usedPercent = clampPercent(Math.round((1 - remaining) * 100));
  const resetsAt = parseResetsAt(quota.resetTime);

  const fiveHour: UsageWindow = { usedPercent, resetsAt };
  return {
    status: 'ok',
    fiveHour,
    sevenDay: null,
    fetchedAt: now,
  };
}

/**
 * Parses the GetUserStatus JSON returned by the Antigravity Language Server.
 */
export function parseLanguageServerResponse(body: unknown, now = Date.now()): UsageResult | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as {
    userStatus?: {
      cascadeModelConfigData?: {
        clientModelConfigs?: Array<{
          label?: unknown;
          quotaInfo?: {
            remainingFraction?: unknown;
            resetTime?: unknown;
          };
        }>;
      };
    };
  };

  const configs = raw.userStatus?.cascadeModelConfigData?.clientModelConfigs;
  if (!Array.isArray(configs)) return null;

  const models: Record<string, AntigravityModelQuota> = {};
  for (const c of configs) {
    if (typeof c.label === 'string' && c.quotaInfo) {
      const remaining = finite(c.quotaInfo.remainingFraction);
      if (remaining !== null) {
        models[c.label] = {
          remainingFraction: remaining,
          resetTime: typeof c.quotaInfo.resetTime === 'string' ? c.quotaInfo.resetTime : null,
        };
      }
    }
  }

  return parseModelQuotas(models, now);
}

/**
 * Parses the quota cache file written by agy-hud or Antigravity tools.
 */
export function parseQuotaCacheJson(json: string, now = Date.now()): UsageResult | null {
  try {
    const parsed = JSON.parse(json) as {
      models?: Record<string, { remainingFraction?: unknown; resetTime?: unknown }>;
    };
    if (!parsed || typeof parsed.models !== 'object' || parsed.models === null) return null;

    const models: Record<string, AntigravityModelQuota> = {};
    for (const [label, q] of Object.entries(parsed.models)) {
      if (q && typeof q === 'object') {
        const remaining = finite(q.remainingFraction);
        if (remaining !== null) {
          models[label] = {
            remainingFraction: remaining,
            resetTime: typeof q.resetTime === 'string' ? q.resetTime : null,
          };
        }
      }
    }

    return parseModelQuotas(models, now);
  } catch {
    return null;
  }
}

/**
 * Reads Antigravity quota from the local Language Server or the agy-hud quota cache.
 */
export async function fetchAntigravityUsage(
  creds = findAntigravityCredentials(),
  cachePath = defaultQuotaCachePath(),
  now = Date.now(),
): Promise<UsageResult> {
  // 1. Try querying the language server if credentials are found
  if (creds) {
    try {
      const url = `http://${creds.address}/exa.language_server_pb.LanguageServerService/GetUserStatus`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Connect-Protocol-Version': '1',
          'x-codeium-csrf-token': creds.token,
        },
        body: '{}',
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const data = await res.json();
        const result = parseLanguageServerResponse(data, now);
        if (result && result.status === 'ok') {
          // Sync with cache file so agy-hud / other tools stay updated
          try {
            const raw = data as {
              userStatus?: {
                planStatus?: { planInfo?: { planName?: string } };
                cascadeModelConfigData?: {
                  clientModelConfigs?: Array<{ label?: string; quotaInfo?: unknown }>;
                };
              };
            };
            const configs = raw.userStatus?.cascadeModelConfigData?.clientModelConfigs;
            if (Array.isArray(configs)) {
              const cacheModels: Record<string, unknown> = {};
              for (const c of configs) {
                if (c.label && c.quotaInfo) cacheModels[c.label] = c.quotaInfo;
              }
              const planName = raw.userStatus?.planStatus?.planInfo?.planName ?? 'Pro';
              const cacheDir = path.dirname(cachePath);
              if (fs.existsSync(cacheDir)) {
                fs.writeFileSync(
                  cachePath,
                  JSON.stringify(
                    {
                      timestamp: new Date(now).toISOString(),
                      plan_name: planName,
                      models: cacheModels,
                    },
                    null,
                    2,
                  ),
                  { encoding: 'utf8', mode: 0o600 },
                );
              }
            }
          } catch {
            // Non-critical cache write failure
          }
          return result;
        }
      }
    } catch (err) {
      logDebug('antigravity-usage', 'language server fetch failed, trying cache', {
        err: errMessage(err),
      });
    }
  }

  // 2. Fall back to reading the cached quota file
  try {
    if (fs.existsSync(cachePath)) {
      const content = await fs.promises.readFile(cachePath, 'utf8');
      const result = parseQuotaCacheJson(content, now);
      if (result) return result;
    }
  } catch (err) {
    logWarn('antigravity-usage', 'failed to read quota cache', {
      file: cachePath,
      err: errMessage(err),
    });
  }

  return { status: 'unavailable', reason: 'No Antigravity quota found' };
}
