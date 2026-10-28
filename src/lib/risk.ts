export type RiskReason = 'missed_classes' | 'missing_assignment';

export interface RiskFlag {
  id: string;
  cohort_id: string;
  cohort_label: string;
  student_id: string;
  student_name: string | null;
  email: string | null;
  phone: string | null;
  reason: RiskReason;
  detail: {
    sessions?: { id: string; at: string }[];
    assignments?: { id: string; title: string; due: string }[];
  };
  flagged_at: string;
  dismissed: boolean;
}

export interface UncountedSession {
  cohort_label: string;
  at: string;
  marked: number;
  cohort_size: number;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });

export function describeRisk(flag: Pick<RiskFlag, 'reason' | 'detail'>): string {
  if (flag.reason === 'missed_classes') {
    const dates = (flag.detail.sessions ?? []).map(s => shortDate(s.at)).reverse();
    return dates.length ? `Missed the last two classes (${dates.join(', ')})` : 'Missed the last two classes';
  }
  const items = flag.detail.assignments ?? [];
  if (items.length === 1) return `Hasn't submitted “${items[0].title}” (due ${shortDate(items[0].due)})`;
  return `Hasn't submitted ${items.length} overdue assignments`;
}

// Nigerian numbers arrive as 0803…, +234 803… or 234803…; wa.me wants 234803….
export function whatsappLink(phone: string | null): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const intl = digits.startsWith('234') ? digits : digits.startsWith('0') ? `234${digits.slice(1)}` : digits.length === 10 ? `234${digits}` : digits;
  return `https://wa.me/${intl}`;
}
