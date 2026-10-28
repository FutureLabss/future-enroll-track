import { describe, it, expect } from 'vitest';
import { daysAgo, followupBucket, followupSummary } from '@/lib/followups';
import type { FollowupState } from '@/hooks/usePaymentFollowups';

const state = (over: Partial<FollowupState>): FollowupState => ({
  enrollment_id: 'e1', last_kind: 'called', last_note: null, last_at: '2026-10-27T10:00:00Z', last_by: null,
  promised_amount: null, promised_date: null, promise_active: false, promise_broken: false, written_off: false, contacts: 1, ...over,
});

describe('payment follow-up summaries', () => {
  it('puts each balance in one bucket, write-offs first', () => {
    expect(followupBucket(undefined)).toBe('none');
    expect(followupBucket(state({}))).toBe('none');
    expect(followupBucket(state({ promise_active: true }))).toBe('promised');
    expect(followupBucket(state({ promise_broken: true }))).toBe('broken');
    expect(followupBucket(state({ written_off: true, promise_active: true }))).toBe('written_off');
  });

  it('describes promises kept, pending and missed', () => {
    expect(followupSummary(state({}))).toBeNull();
    expect(followupSummary(state({ promise_active: true, promised_amount: 50000, promised_date: '2026-10-31' }))).toBe('Promised ₦50,000 by 31 Oct');
    expect(followupSummary(state({ promise_active: true, promised_date: '2026-10-31' }))).toBe('Promised by 31 Oct');
    expect(followupSummary(state({ promise_broken: true, promised_date: '2026-10-20' }))).toBe('Promise missed (20 Oct)');
    expect(followupSummary(state({ written_off: true }))).toBe('Written off');
  });

  it('says how long ago someone was contacted', () => {
    const now = new Date('2026-10-28T12:00:00Z');
    expect(daysAgo('2026-10-28T08:00:00Z', now)).toBe('today');
    expect(daysAgo('2026-10-27T08:00:00Z', now)).toBe('yesterday');
    expect(daysAgo('2026-10-20T08:00:00Z', now)).toBe('8 days ago');
  });
});
