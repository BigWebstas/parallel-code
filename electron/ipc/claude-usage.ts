import fs from 'fs';
import os from 'os';
import path from 'path';
import type { CreditUsage, UsageResult, UsageWindow } from './shared-types.js';
import { warn as logWarn, errMessage } from '../log.js';
import { clampPercent, finite, parseResetsAt, requestUsage } from './usage-shared.js';

/**
 * The rate-limit windows Claude Code shows under `/usage`, as the CLI itself
 * reports them to the status line command the app registers (`rate_limits` in
 * the status line's stdin JSON). The CLI sends those numbers only to Pro/Max
 * logins (or behind a gateway with a spend limit), and only after a session's
 * first response.
 *
 * Enterprise logins get no `rate_limits`, yet have a dollar allotment of their
 * own. When no session has reported, `fetchClaudeUsage` falls back to the same
 * OAuth usage endpoint the CLI calls, using the login's access token from the
 * credentials file, and shows that allotment. A login that never needs the
 * fallback is never read.
 */

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

interface RateWindowJson {
  used_percentage?: unknown;
  resets_at?: unknown;
}

interface SpendLimitJson extends RateWindowJson {
  used_usd?: unknown;
  limit_usd?: unknown;
}

let latest: Extract<UsageResult, { status: 'ok' }> | null = null;

function parseWindow(value: unknown): UsageWindow | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as RateWindowJson;
  const usedPercent = finite(raw.used_percentage);
  if (usedPercent === null) return null;
  return { usedPercent: clampPercent(usedPercent), resetsAt: parseResetsAt(raw.resets_at) };
}

/** A gateway spend limit, once the CLI has its dollar figures; the percentage alone arrives first. */
function parseSpendLimit(value: unknown): CreditUsage | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as SpendLimitJson;
  const used = finite(raw.used_usd);
  if (used === null) return null;
  const percent = finite(raw.used_percentage);
  return {
    used,
    limit: finite(raw.limit_usd),
    currency: 'USD',
    usedPercent: percent !== null ? clampPercent(percent) : null,
  };
}

/** Reads the `rate_limits` of a status line payload. Null when it carries none. */
export function parseClaudeStatusLine(body: unknown, now = Date.now()): UsageResult | null {
  if (typeof body !== 'object' || body === null) return null;
  const limits = (body as { rate_limits?: unknown }).rate_limits;
  if (typeof limits !== 'object' || limits === null) return null;
  const raw = limits as { five_hour?: unknown; seven_day?: unknown; spend_limit?: unknown };
  const fiveHour = parseWindow(raw.five_hour);
  const sevenDay = parseWindow(raw.seven_day);
  const creditUsage = parseSpendLimit(raw.spend_limit);
  if (!fiveHour && !sevenDay && !creditUsage) return null;
  return {
    status: 'ok',
    fiveHour,
    sevenDay,
    ...(creditUsage ? { creditUsage } : {}),
    fetchedAt: now,
  };
}

function sameWindow(a: UsageWindow | null, b: UsageWindow | null): boolean {
  return a?.usedPercent === b?.usedPercent && a?.resetsAt === b?.resetsAt;
}

function sameCredit(a: CreditUsage | null | undefined, b: CreditUsage | null | undefined): boolean {
  return (
    a?.used === b?.used &&
    a?.limit === b?.limit &&
    a?.currency === b?.currency &&
    a?.usedPercent === b?.usedPercent
  );
}

/**
 * Records a status line payload. Returns true when the windows changed, so the
 * caller tells the renderer only then: the status line re-runs on every update
 * of a streaming session, almost always with the same numbers.
 */
export function recordClaudeStatusLine(body: unknown, now = Date.now()): boolean {
  const parsed = parseClaudeStatusLine(body, now);
  if (parsed?.status !== 'ok') return false;
  const changed =
    !latest ||
    !sameWindow(latest.fiveHour, parsed.fiveHour) ||
    !sameWindow(latest.sevenDay, parsed.sevenDay) ||
    !sameCredit(latest.creditUsage, parsed.creditUsage);
  latest = parsed;
  return changed;
}

/** Forgets the last report. For tests. */
export function resetClaudeUsage(): void {
  latest = null;
}

function current(window: UsageWindow | null, now: number): UsageWindow | null {
  // The CLI drops a window once it resets, so a passed reset means a stale number.
  return window && window.resetsAt !== null && window.resetsAt <= now ? null : window;
}

/** The last windows a Claude Code session reported, minus any that have since reset. */
export function readStatusLineUsage(now = Date.now()): UsageResult {
  if (!latest) {
    return { status: 'unavailable', reason: 'No Claude Code session has reported usage yet' };
  }
  const fiveHour = current(latest.fiveHour, now);
  const sevenDay = current(latest.sevenDay, now);
  if (!fiveHour && !sevenDay && !latest.creditUsage) {
    return { status: 'unavailable', reason: 'Claude Code usage windows have reset' };
  }
  return { ...latest, fiveHour, sevenDay };
}

// --- Dollar allotment from the usage endpoint (enterprise and other logins without rate limits) ---

interface RawSpendMinor {
  amount_minor?: unknown;
  currency?: unknown;
  exponent?: unknown;
}

interface RawSpend {
  used?: RawSpendMinor | null;
  limit?: RawSpendMinor | null;
  percent?: unknown;
  enabled?: unknown;
}

interface RawExtraUsage {
  is_enabled?: unknown;
  monthly_limit?: unknown;
  used_credits?: unknown;
  utilization?: unknown;
  currency?: unknown;
  decimal_places?: unknown;
}

/** Credits a login has spent against its monthly limit, from either spelling the endpoint uses. */
export function parseCreditUsage(body: unknown): CreditUsage | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { extra_usage?: unknown; spend?: unknown };

  if (typeof raw.extra_usage === 'object' && raw.extra_usage !== null) {
    const eu = raw.extra_usage as RawExtraUsage;
    const divisor = 10 ** (typeof eu.decimal_places === 'number' ? eu.decimal_places : 2);
    const rawUsed = finite(eu.used_credits);
    const rawLimit = finite(eu.monthly_limit);
    const used = rawUsed !== null ? rawUsed / divisor : null;
    const limit = rawLimit !== null ? rawLimit / divisor : null;
    const percent = finite(eu.utilization);
    if (used !== null && (eu.is_enabled === true || used > 0)) {
      const calculated = limit !== null && limit > 0 ? clampPercent((used / limit) * 100) : null;
      return {
        used,
        limit,
        currency: typeof eu.currency === 'string' && eu.currency ? eu.currency : 'USD',
        usedPercent: percent !== null ? clampPercent(percent) : calculated,
      };
    }
  }

  if (typeof raw.spend === 'object' && raw.spend !== null) {
    const sp = raw.spend as RawSpend;
    const usedMinor = finite(sp.used?.amount_minor);
    const exponent = typeof sp.used?.exponent === 'number' ? sp.used.exponent : 2;
    const used = usedMinor !== null ? usedMinor / 10 ** exponent : null;
    const limitMinor = finite(sp.limit?.amount_minor);
    const limitExponent = typeof sp.limit?.exponent === 'number' ? sp.limit.exponent : exponent;
    const limit = limitMinor !== null ? limitMinor / 10 ** limitExponent : null;
    const percent = finite(sp.percent);
    if (used !== null && (sp.enabled === true || used > 0)) {
      const calculated = limit !== null && limit > 0 ? clampPercent((used / limit) * 100) : null;
      return {
        used,
        limit,
        currency:
          typeof sp.used?.currency === 'string' && sp.used.currency ? sp.used.currency : 'USD',
        usedPercent: percent !== null ? clampPercent(percent) : calculated,
      };
    }
  }
  return null;
}

/** The endpoint spells a window's percentage `utilization`; the status line spells it `used_percentage`. */
function parseEndpointWindow(value: unknown): UsageWindow | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as { utilization?: unknown; used_percentage?: unknown; resets_at?: unknown };
  const usedPercent = finite(raw.utilization) ?? finite(raw.used_percentage);
  if (usedPercent === null) return null;
  return { usedPercent: clampPercent(usedPercent), resetsAt: parseResetsAt(raw.resets_at) };
}

/** Parses the usage endpoint body. Null when it carries neither a window nor credits. */
export function parseClaudeUsageResponse(body: unknown, now = Date.now()): UsageResult | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { five_hour?: unknown; seven_day?: unknown };
  const fiveHour = parseEndpointWindow(raw.five_hour);
  const sevenDay = parseEndpointWindow(raw.seven_day);
  const creditUsage = parseCreditUsage(body);
  if (!fiveHour && !sevenDay && !creditUsage) return null;
  return {
    status: 'ok',
    fiveHour,
    sevenDay,
    ...(creditUsage ? { creditUsage } : {}),
    fetchedAt: now,
  };
}

export function claudeConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

/** The login's access token and when it lapses, from a credentials JSON document. */
export function parseAccessToken(json: string): { token: string; expiresAt: number | null } | null {
  try {
    const parsed = JSON.parse(json) as {
      claudeAiOauth?: { accessToken?: unknown; expiresAt?: unknown };
    };
    const oauth = parsed?.claudeAiOauth;
    const token = oauth?.accessToken;
    if (typeof token !== 'string' || token.length === 0) return null;
    return { token, expiresAt: finite(oauth?.expiresAt) };
  } catch {
    return null;
  }
}

async function readCredentials(configDir: string): Promise<string | null> {
  // macOS keeps the live token in the keychain, which this does not read.
  if (process.platform === 'darwin') return null;
  const file = path.join(configDir, '.credentials.json');
  try {
    return await fs.promises.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logWarn('claude-usage', 'credentials file unreadable', { file, err: errMessage(err) });
    }
    return null;
  }
}

export interface FetchClaudeUsageOptions {
  now?: number;
  configDir?: string;
  /** The HTTP call; injectable so tests never reach the network. */
  request?: typeof requestUsage;
}

/**
 * What a session's status line last reported, or, when none has, the login's
 * dollar allotment from the usage endpoint. A lapsed token is not refreshed
 * here (that would rotate the CLI's login): a running Claude Code session
 * refreshes the file, and until then the status line's own answer stands.
 */
export async function fetchClaudeUsage(opts: FetchClaudeUsageOptions = {}): Promise<UsageResult> {
  const now = opts.now ?? Date.now();
  const reported = readStatusLineUsage(now);
  if (reported.status === 'ok') return reported;

  const json = await readCredentials(opts.configDir ?? claudeConfigDir());
  const credentials = json ? parseAccessToken(json) : null;
  if (!credentials) return reported;
  if (credentials.expiresAt !== null && credentials.expiresAt <= now) return reported;

  const fetched = await (opts.request ?? requestUsage)({
    scope: 'claude-usage',
    agent: 'Claude Code',
    url: USAGE_URL,
    headers: {
      Authorization: `Bearer ${credentials.token}`,
      'anthropic-beta': 'oauth-2025-04-20',
      // Only the CLI talks to this endpoint; present as it does so we get the same response.
      'User-Agent': 'claude-code/2.1.0',
    },
    parse: (body) => parseClaudeUsageResponse(body, now),
  });
  // An empty lookup should not hide the more specific status line reason.
  return fetched.status === 'unavailable' ? reported : fetched;
}
