import { describe, it, expect } from 'vitest';
import {
  ageOn,
  computePartnerReport,
  PartnerReportInput,
  quarterBounds,
  ReportEnrollment,
  youthStatus,
} from '@/lib/partnerReport';

const enrollment = (overrides: Partial<ReportEnrollment>): ReportEnrollment => ({
  id: 'e1',
  full_name: 'Student',
  created_at: '2026-02-01T10:00:00Z',
  enrollment_status: 'active',
  total_amount: 100000,
  organization_name: null,
  organization_type: null,
  cohort_ids: [],
  date_of_birth: null,
  age_category: null,
  ...overrides,
});

const cohorts = [
  { id: 'q1', cohort_label: 'Ended Q1', start_date: '2026-01-10', end_date: '2026-03-20' },
  { id: 'q3', cohort_label: 'Ended Q3', start_date: '2026-06-01', end_date: '2026-08-15' },
  { id: 'running', cohort_label: 'Running', start_date: '2026-09-01', end_date: '2026-10-30' },
  { id: 'future', cohort_label: 'Future', start_date: '2026-10-05', end_date: '2026-12-01' },
  { id: 'last-year', cohort_label: '2025', start_date: '2025-09-01', end_date: '2025-11-30' },
];

const input = (enrollments: ReportEnrollment[], extra: Partial<PartnerReportInput> = {}): PartnerReportInput => ({
  enrollments,
  cohorts,
  money: [],
  otherIncome: [],
  staff: [],
  ...extra,
});

const TODAY = '2026-09-25';

describe('quarterBounds', () => {
  it('returns the first day, next quarter start, and last day', () => {
    expect(quarterBounds(2026, 1)).toEqual({ start: '2026-01-01', next: '2026-04-01', last: '2026-03-31' });
    expect(quarterBounds(2026, 4)).toEqual({ start: '2026-10-01', next: '2027-01-01', last: '2026-12-31' });
  });
});

describe('age and youth', () => {
  it('counts a birthday not yet reached this year', () => {
    expect(ageOn('2000-09-26', TODAY)).toBe(25);
    expect(ageOn('2000-09-25', TODAY)).toBe(26);
  });

  it('rejects malformed or implausible dates of birth', () => {
    expect(ageOn('14/12/1994', TODAY)).toBeNull();
    expect(ageOn('2026-01-01', TODAY)).toBeNull();
  });

  it('prefers date of birth over the age category', () => {
    expect(youthStatus('1980-01-01', '18–24', TODAY)).toEqual({ age: 46, youth: false });
  });

  it('falls back to the age category, leaving the 13–17 bucket undecided', () => {
    expect(youthStatus(null, '25–30', TODAY).youth).toBe(true);
    expect(youthStatus(null, 'Above 40', TODAY).youth).toBe(false);
    expect(youthStatus(null, '13–17', TODAY).youth).toBeNull();
  });
});

describe('computePartnerReport — training status', () => {
  it('ignores enrollment_status "completed", which means fully paid, not trained', () => {
    const r = computePartnerReport(
      input([enrollment({ enrollment_status: 'completed', cohort_ids: ['running'] })]),
      2026, 3, TODAY,
    );
    expect(r.completedYear).toBe(0);
    expect(r.inTraining).toBe(1);
  });

  it('counts completions by the last cohort end date in the year and quarter', () => {
    const r = computePartnerReport(
      input([
        enrollment({ id: 'a', cohort_ids: ['q1'] }),
        enrollment({ id: 'b', cohort_ids: ['q3'] }),
        enrollment({ id: 'c', cohort_ids: ['last-year'], created_at: '2025-08-01T00:00:00Z' }),
      ]),
      2026, 3, TODAY,
    );
    expect(r.completedYear).toBe(2);
    expect(r.completedQuarter).toBe(1);
  });

  it('treats a student in a course sequence as training until their last cohort ends', () => {
    const r = computePartnerReport(input([enrollment({ cohort_ids: ['q3', 'running'] })]), 2026, 3, TODAY);
    expect(r.completedYear).toBe(0);
    expect(r.inTraining).toBe(1);
  });

  it('separates not-started cohorts and enrollments without a cohort from the counts', () => {
    const r = computePartnerReport(
      input([enrollment({ id: 'a', cohort_ids: ['future'] }), enrollment({ id: 'b', cohort_ids: [] })]),
      2026, 3, TODAY,
    );
    expect(r.inTraining).toBe(0);
    expect(r.gaps.notStarted).toBe(1);
    expect(r.gaps.noCohort.map(t => t.id)).toEqual(['b']);
  });

  it('evaluates a past quarter as of its last day, not today', () => {
    const r = computePartnerReport(input([enrollment({ cohort_ids: ['q3'] })]), 2026, 2, TODAY);
    expect(r.period.asOf).toBe('2026-06-30');
    expect(r.completedYear).toBe(0);
    expect(r.inTraining).toBe(1);
  });

  it('counts a student whose record was typed in after their cohort ended', () => {
    const r = computePartnerReport(
      input([enrollment({ cohort_ids: ['q1'], created_at: '2026-07-20T09:00:00Z' })]),
      2026, 1, TODAY,
    );
    expect(r.completedQuarter).toBe(1);
  });

  it('skips cancelled enrollments', () => {
    const r = computePartnerReport(
      input([enrollment({ enrollment_status: 'cancelled', cohort_ids: ['q3'] })]),
      2026, 3, TODAY,
    );
    expect(r.trainees).toHaveLength(0);
  });
});

describe('computePartnerReport — PIND and youth shares', () => {
  it('computes PIND share of the quarter completers and of the youths', () => {
    const r = computePartnerReport(
      input([
        enrollment({ id: 'a', cohort_ids: ['q3'], organization_name: 'PIND ', organization_type: 'sponsor', date_of_birth: '2000-01-01' }),
        enrollment({ id: 'b', cohort_ids: ['q3'], date_of_birth: '2001-01-01' }),
        enrollment({ id: 'c', cohort_ids: ['running'], date_of_birth: '1970-01-01' }),
        enrollment({ id: 'd', cohort_ids: ['running'] }),
      ]),
      2026, 3, TODAY,
    );
    expect(r.completedQuarterPindPct).toBe(50);
    expect(r.youthBase).toBe(4);
    expect(r.youthAgeKnown).toBe(3);
    expect(r.youthPct).toBe(66.7);
    expect(r.youthPindPct).toBe(50);
  });

  it('returns null rather than 0% when there is nobody to take a share of', () => {
    const r = computePartnerReport(input([]), 2026, 3, TODAY);
    expect(r.completedQuarterPindPct).toBeNull();
    expect(r.youthPct).toBeNull();
  });
});

describe('computePartnerReport — money', () => {
  const people = [
    enrollment({ id: 'self', cohort_ids: ['running'] }),
    enrollment({ id: 'pind', cohort_ids: ['running'], organization_name: 'PIND', organization_type: 'sponsor' }),
    enrollment({ id: 'uni', cohort_ids: ['running'], organization_name: 'AKSU', organization_type: 'sponsor' }),
    enrollment({ id: 'partner', cohort_ids: ['running'], organization_name: 'TopFaith', organization_type: 'partner' }),
  ];

  it('sums tuition in the quarter and treats non-PIND sponsors as external funding', () => {
    const r = computePartnerReport(
      input(people, {
        money: [
          { enrollment_id: 'self', amount: 50000, date: '2026-07-02' },
          { enrollment_id: 'pind', amount: 80000, date: '2026-08-10' },
          { enrollment_id: 'uni', amount: 30000, date: '2026-09-01' },
          { enrollment_id: 'partner', amount: 20000, date: '2026-09-02' },
          { enrollment_id: 'self', amount: 99999, date: '2026-06-30' },
        ],
      }),
      2026, 3, TODAY,
    );
    expect(r.tuitionIncome).toBe(180000);
    expect(r.externalFunding).toBe(30000);
    expect(r.externalFunders).toEqual(['AKSU']);
    expect(r.sponsorIncome[0]).toEqual({ name: 'PIND', amount: 80000 });
  });

  it('compares tuition plus other income against the previous quarter, across a year boundary', () => {
    const r = computePartnerReport(
      input(people, {
        money: [
          { enrollment_id: 'self', amount: 100000, date: '2025-11-15' },
          { enrollment_id: 'self', amount: 120000, date: '2026-02-15' },
        ],
        otherIncome: [{ amount: 30000, payment_date: '2026-03-01' }],
      }),
      2026, 1, TODAY,
    );
    expect(r.incomeChangePct).toBe(50);
  });

  it('averages the invoiced total of priced enrollments created that year', () => {
    const r = computePartnerReport(
      input([
        enrollment({ id: 'a', total_amount: 100000 }),
        enrollment({ id: 'b', total_amount: 50000 }),
        enrollment({ id: 'free', total_amount: 0 }),
        enrollment({ id: 'old', total_amount: 900000, created_at: '2025-05-01T00:00:00Z' }),
      ]),
      2026, 3, TODAY,
    );
    expect(r.averageCost).toBe(75000);
  });
});
