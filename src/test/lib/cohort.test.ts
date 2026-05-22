import { describe, it, expect } from 'vitest';

// Mirrors derivedStatus from CohortsPage / CohortDetailPage
function derivedStatus(cohort: { status?: string; start_date?: string; end_date?: string }): string | null {
  if (cohort.status) return cohort.status;
  const now = new Date();
  if (cohort.start_date && new Date(cohort.start_date) > now) return 'upcoming';
  if (cohort.end_date && new Date(cohort.end_date) < now) return 'completed';
  if (cohort.start_date) return 'active';
  return null;
}

const FUTURE = '2099-01-01';
const PAST   = '2000-01-01';
const today  = new Date().toISOString().split('T')[0];

describe('derivedStatus', () => {
  it('returns explicit status if set', () => {
    expect(derivedStatus({ status: 'archived' })).toBe('archived');
  });

  it('returns explicit status even when dates would say otherwise', () => {
    expect(derivedStatus({ status: 'upcoming', start_date: PAST })).toBe('upcoming');
  });

  it('returns upcoming when start_date is in the future', () => {
    expect(derivedStatus({ start_date: FUTURE })).toBe('upcoming');
  });

  it('returns completed when end_date is in the past', () => {
    expect(derivedStatus({ end_date: PAST })).toBe('completed');
  });

  it('returns active when start_date is in the past and no end_date', () => {
    expect(derivedStatus({ start_date: PAST })).toBe('active');
  });

  it('returns active when start is past and end is future', () => {
    expect(derivedStatus({ start_date: PAST, end_date: FUTURE })).toBe('active');
  });

  it('returns null when no status and no dates', () => {
    expect(derivedStatus({})).toBeNull();
  });

  it('returns null when only end_date is in the future (no start)', () => {
    // No start_date → can't determine active, end is future → not completed
    expect(derivedStatus({ end_date: FUTURE })).toBeNull();
  });
});
