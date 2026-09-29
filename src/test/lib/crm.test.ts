import { describe, expect, it } from 'vitest';
import { parseLeadCsv, qualificationForScore } from '@/lib/crm';

describe('CRM qualification', () => {
  it('uses the configured threshold boundaries', () => {
    expect(qualificationForScore(29)).toBe('cold');
    expect(qualificationForScore(30)).toBe('warm');
    expect(qualificationForScore(69)).toBe('warm');
    expect(qualificationForScore(70)).toBe('hot');
  });
});

describe('lead CSV import', () => {
  it('supports quoted commas, aliases, consent, and skips invalid rows', () => {
    const rows = parseLeadCsv('name,email,phone,source,marketing_consent\n"Doe, Ada",ada@example.com,,referral,yes\nMissing,,,manual,no');
    expect(rows).toEqual([{ full_name: 'Doe, Ada', email: 'ada@example.com', phone: '', source: 'referral', marketing_consent: true }]);
  });
});
