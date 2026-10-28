import type { FollowupKind, FollowupState } from '@/hooks/usePaymentFollowups';

export const FOLLOWUP_LABELS: Record<FollowupKind, string> = {
  called: 'Called',
  whatsapp: 'WhatsApp message',
  note: 'Note',
  promise: 'Promise to pay',
  written_off: 'Written off',
  reopened: 'Reopened',
};

const money = (n: number) => `₦${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

export type FollowupBucket = 'written_off' | 'promised' | 'broken' | 'none';

export function followupBucket(s: FollowupState | undefined): FollowupBucket {
  if (!s) return 'none';
  if (s.written_off) return 'written_off';
  if (s.promise_active) return 'promised';
  if (s.promise_broken) return 'broken';
  return 'none';
}

export function followupSummary(s: FollowupState | undefined): string | null {
  if (!s) return null;
  if (s.written_off) return 'Written off';
  if (s.promise_active && s.promised_date) {
    return `Promised ${s.promised_amount ? money(s.promised_amount) + ' ' : ''}by ${day(s.promised_date)}`;
  }
  if (s.promise_broken && s.promised_date) return `Promise missed (${day(s.promised_date)})`;
  return null;
}

export function daysAgo(iso: string, now = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
