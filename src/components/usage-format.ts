import type { UsageSpend, UsageWindow } from '../ipc/types';
import type { UsageState } from '../store/types';

/** Past this share of a window, the meter turns amber. */
export const USAGE_WARN_PERCENT = 80;

export function remainingPercent(window: UsageWindow): number {
  return Math.max(0, Math.round(100 - window.usedPercent));
}

/** "resets 14:30" for today, "resets Thu 09:00" otherwise, "reset due" once the
 *  time has passed (the API keeps reporting a window until the next request),
 *  '' when unknown. */
export function formatReset(resetsAt: number | null, now = Date.now()): string {
  if (resetsAt === null) return '';
  if (resetsAt <= now) return 'reset due';
  const date = new Date(resetsAt);
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === new Date(now).toDateString()) return `resets ${time}`;
  const day = date.toLocaleDateString(undefined, { weekday: 'short' });
  return `resets ${day} ${time}`;
}

/** "14:02" for a fetch made today, "Thu 14:02" for older snapshots. */
export function formatFetchedAt(fetchedAt: number, now = Date.now()): string {
  const date = new Date(fetchedAt);
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === new Date(now).toDateString()) return time;
  return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}

/** Share of the spend cap used, 0–100; null when uncapped. */
export function spendPercent(spend: UsageSpend): number | null {
  if (spend.limit === null) return null;
  return Math.min(100, (spend.used / spend.limit) * 100);
}

function formatMoney(minor: number, currency: string): string {
  try {
    const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    return fmt.format(minor / 10 ** (fmt.resolvedOptions().maximumFractionDigits ?? 2));
  } catch {
    // Unknown currency code: assume cents rather than hiding the amount.
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/** "$12.34 / $50.00" against a cap, "$12.34 spent" without one. */
export function formatSpend(spend: UsageSpend): string {
  const used = formatMoney(spend.used, spend.currency);
  if (spend.limit === null) return `${used} spent`;
  return `${used} / ${formatMoney(spend.limit, spend.currency)}`;
}

export function hasUsageSnapshot(state: UsageState): boolean {
  return state.fiveHour !== null || state.sevenDay !== null || state.spend !== null;
}

/** A provider shows once it has a snapshot, and stays up through refresh errors
 *  so the user sees why the meter stopped moving. */
export function usageVisible(state: UsageState): boolean {
  return hasUsageSnapshot(state) || state.status === 'error';
}
