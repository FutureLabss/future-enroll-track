// Computes the PIND "Phase IV Partners Progress Status" quarterly return from
// LMS data. Every figure is evaluated "as of" the earlier of today and the
// quarter's last day, so re-running a past quarter reproduces what it said then.
//
// Training completion comes from cohort end dates, NOT enrollment_status:
// 'completed' on an enrollment means fully paid (the payment pages set it when
// the last installment clears), and graduation statuses are never computed.
// Likewise enrollments.created_at is when the record was typed in (most 2026
// enrollments were entered in one July sitting), so timing comes from cohorts.

export interface ReportEnrollment {
  id: string;
  full_name: string;
  created_at: string;
  enrollment_status: string;
  total_amount: number;
  organization_name: string | null;
  organization_type: string | null;
  cohort_ids: string[];
  date_of_birth: string | null;
  age_category: string | null;
}

export interface ReportCohort {
  id: string;
  cohort_label: string;
  start_date: string | null;
  end_date: string | null;
}

// One unit of tuition money with its effective date already resolved
// (bank date where reconciled, else the staff-entered date).
export interface ReportMoney {
  enrollment_id: string;
  amount: number;
  date: string;
}

export interface ReportOtherIncome {
  amount: number;
  payment_date: string;
}

export interface ReportStaff {
  full_name: string;
  role_title: string | null;
  created_at: string;
}

export interface PartnerReportInput {
  enrollments: ReportEnrollment[];
  cohorts: ReportCohort[];
  money: ReportMoney[];
  otherIncome: ReportOtherIncome[];
  staff: ReportStaff[];
}

export type TrainingStatus = 'completed' | 'in_training' | 'not_started' | 'no_cohort';

export interface TraineeRow {
  id: string;
  full_name: string;
  cohorts: string;
  status: TrainingStatus;
  completed_on: string | null;
  first_start: string | null;
  pind: boolean;
  sponsor: string | null;
  age: number | null;
  youth: boolean | null;
  counted_completed_year: boolean;
  counted_completed_quarter: boolean;
  counted_in_training: boolean;
}

export interface SponsorIncome {
  name: string;
  amount: number;
}

export interface PartnerReportResult {
  period: { year: number; quarter: number; start: string; end: string; asOf: string; inProgress: boolean };
  completedYear: number;
  completedQuarter: number;
  completedQuarterPindPct: number | null;
  inTraining: number;
  inTrainingEnrolledThisYear: number;
  inTrainingThisYearPindPct: number | null;
  youthPct: number | null;
  youthBase: number;
  youthAgeKnown: number;
  youthPindPct: number | null;
  tuitionIncome: number;
  tuitionIncomePrev: number;
  otherIncome: number;
  otherIncomePrev: number;
  incomeChangePct: number | null;
  sponsorIncome: SponsorIncome[];
  externalFunding: number;
  externalFunders: string[];
  averageCost: number | null;
  newStaff: ReportStaff[];
  trainees: TraineeRow[];
  gaps: { noCohort: TraineeRow[]; notStarted: number; ageUnknown: number };
}

const YOUTH_CATEGORIES = new Set(['18–24', '25–30', '31–35']);
const NON_YOUTH_CATEGORIES = new Set(['8–12', '36–40', 'Above 40']);

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function quarterBounds(year: number, quarter: number) {
  const start = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
  const next = new Date(Date.UTC(year, quarter * 3, 1));
  const last = new Date(next.getTime() - 86_400_000);
  return { start: iso(start), next: iso(next), last: iso(last) };
}

export function isPind(orgName: string | null) {
  return (orgName ?? '').trim().toLowerCase() === 'pind';
}

export function pct(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export function ageOn(dob: string | null, onDate: string): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return null;
  const [y, m, d] = dob.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = onDate.split('-').map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return age >= 5 && age <= 100 ? age : null;
}

// 16–35 per PIND. DOB wins; the age-category bucket is the fallback, except
// 13–17, which straddles 16 and so can't decide either way.
export function youthStatus(dob: string | null, category: string | null, onDate: string): { age: number | null; youth: boolean | null } {
  const age = ageOn(dob, onDate);
  if (age !== null) return { age, youth: age >= 16 && age <= 35 };
  const c = (category ?? '').trim();
  if (YOUTH_CATEGORIES.has(c)) return { age: null, youth: true };
  if (NON_YOUTH_CATEGORIES.has(c)) return { age: null, youth: false };
  return { age: null, youth: null };
}

// Rounded to whole naira: amounts are numeric in Postgres but float here.
const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0));

export function computePartnerReport(
  input: PartnerReportInput,
  year: number,
  quarter: number,
  today: string,
): PartnerReportResult {
  const q = quarterBounds(year, quarter);
  const prev = quarter === 1 ? quarterBounds(year - 1, 4) : quarterBounds(year, quarter - 1);
  const asOf = today < q.last ? today : q.last;
  const yearStart = `${year}-01-01`;
  const cohortById = new Map(input.cohorts.map(c => [c.id, c]));
  const enrollmentById = new Map(input.enrollments.map(e => [e.id, e]));

  const trainees: TraineeRow[] = [];
  for (const e of input.enrollments) {
    if (e.enrollment_status === 'cancelled') continue;

    const cohorts = e.cohort_ids.map(id => cohortById.get(id)).filter((c): c is ReportCohort => Boolean(c));
    const pind = isPind(e.organization_name);
    const { age, youth } = youthStatus(e.date_of_birth, e.age_category, asOf);

    let status: TrainingStatus;
    let completedOn: string | null = null;
    let firstStart: string | null = null;
    if (cohorts.length === 0) {
      status = 'no_cohort';
    } else {
      // A student moving through a course sequence sits in several cohorts;
      // they've finished only when the last of them has ended.
      const openEnded = cohorts.some(c => !c.end_date);
      const lastEnd = openEnded ? null : cohorts.map(c => c.end_date!).sort().at(-1)!;
      const starts = cohorts.map(c => c.start_date).filter((s): s is string => Boolean(s)).sort();
      firstStart = starts[0] ?? null;
      if (lastEnd && lastEnd <= asOf) {
        status = 'completed';
        completedOn = lastEnd;
      } else if (starts.length > 0 && starts[0] > asOf) {
        status = 'not_started';
      } else {
        status = 'in_training';
      }
    }

    trainees.push({
      id: e.id,
      full_name: e.full_name,
      cohorts: cohorts.map(c => c.cohort_label).join(', '),
      status,
      completed_on: completedOn,
      first_start: firstStart,
      pind,
      sponsor: e.organization_type === 'sponsor' ? e.organization_name : null,
      age,
      youth,
      counted_completed_year: status === 'completed' && completedOn! >= yearStart,
      counted_completed_quarter: status === 'completed' && completedOn! >= q.start,
      counted_in_training: status === 'in_training',
    });
  }

  const completedYear = trainees.filter(t => t.counted_completed_year);
  const completedQuarter = trainees.filter(t => t.counted_completed_quarter);
  const inTraining = trainees.filter(t => t.counted_in_training);
  const inTrainingThisYear = inTraining.filter(t => t.first_start !== null && t.first_start >= yearStart);

  const youthBase = [...completedYear, ...inTraining];
  const ageKnown = youthBase.filter(t => t.youth !== null);
  const youths = ageKnown.filter(t => t.youth);

  const inRange = (d: string, start: string, next: string) => d >= start && d < next;
  const quarterMoney = input.money.filter(m => inRange(m.date, q.start, q.next));
  const prevMoney = input.money.filter(m => inRange(m.date, prev.start, prev.next));

  const bySponsor = new Map<string, number>();
  for (const m of quarterMoney) {
    const e = enrollmentById.get(m.enrollment_id);
    const name = e?.organization_name?.trim() || 'Self-funded';
    bySponsor.set(name, (bySponsor.get(name) ?? 0) + Number(m.amount));
  }
  const sponsorIncome = [...bySponsor.entries()]
    .map(([name, amount]) => ({ name, amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount);

  // Money paid against enrollments tied to a sponsor organization other than
  // PIND itself — a starting point for "external funding leveraged".
  const external = new Map<string, number>();
  for (const m of quarterMoney) {
    const e = enrollmentById.get(m.enrollment_id);
    if (!e || e.organization_type !== 'sponsor' || isPind(e.organization_name)) continue;
    const name = e.organization_name!.trim();
    external.set(name, (external.get(name) ?? 0) + Number(m.amount));
  }

  const tuitionIncome = sum(quarterMoney.map(m => Number(m.amount)));
  const tuitionIncomePrev = sum(prevMoney.map(m => Number(m.amount)));
  const otherIncome = sum(input.otherIncome.filter(o => inRange(o.payment_date, q.start, q.next)).map(o => Number(o.amount)));
  const otherIncomePrev = sum(input.otherIncome.filter(o => inRange(o.payment_date, prev.start, prev.next)).map(o => Number(o.amount)));
  const incomeNow = tuitionIncome + otherIncome;
  const incomePrev = tuitionIncomePrev + otherIncomePrev;

  const pricedThisYear = input.enrollments.filter(
    e => e.enrollment_status !== 'cancelled' && e.created_at.slice(0, 4) === String(year) && Number(e.total_amount) > 0,
  );

  return {
    period: { year, quarter, start: q.start, end: q.last, asOf, inProgress: today < q.last },
    completedYear: completedYear.length,
    completedQuarter: completedQuarter.length,
    completedQuarterPindPct: pct(completedQuarter.filter(t => t.pind).length, completedQuarter.length),
    inTraining: inTraining.length,
    inTrainingEnrolledThisYear: inTrainingThisYear.length,
    inTrainingThisYearPindPct: pct(inTrainingThisYear.filter(t => t.pind).length, inTrainingThisYear.length),
    youthPct: pct(youths.length, ageKnown.length),
    youthBase: youthBase.length,
    youthAgeKnown: ageKnown.length,
    youthPindPct: pct(youths.filter(t => t.pind).length, youths.length),
    tuitionIncome,
    tuitionIncomePrev,
    otherIncome,
    otherIncomePrev,
    incomeChangePct: incomePrev > 0 ? Math.round(((incomeNow - incomePrev) / incomePrev) * 1000) / 10 : null,
    sponsorIncome,
    externalFunding: sum([...external.values()]),
    externalFunders: [...external.keys()].sort(),
    averageCost: pricedThisYear.length
      ? Math.round(sum(pricedThisYear.map(e => Number(e.total_amount))) / pricedThisYear.length)
      : null,
    newStaff: input.staff.filter(s => inRange(s.created_at.slice(0, 10), q.start, q.next)),
    trainees,
    gaps: {
      noCohort: trainees.filter(t => t.status === 'no_cohort'),
      notStarted: trainees.filter(t => t.status === 'not_started').length,
      ageUnknown: youthBase.length - ageKnown.length,
    },
  };
}
