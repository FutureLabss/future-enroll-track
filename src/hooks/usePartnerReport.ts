import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import {
  computePartnerReport,
  PartnerReportInput,
  ReportEnrollment,
  ReportMoney,
} from '@/lib/partnerReport';

const CHUNK = 100;

// The generated types predate hub_id, hubs and cohort_students, so this hook
// queries through an untyped handle rather than disabling checks for the file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface EnrollmentRow {
  id: string;
  full_name: string;
  created_at: string;
  enrollment_status: string;
  total_amount: number | null;
  cohort_id: string | null;
  organizations: { organization_name: string; organization_type: string } | null;
}

interface InstallmentRow {
  amount: number;
  paid_at: string;
  paid_at_actual: string | null;
  invoices: { enrollment_id: string };
}

interface PaymentRow {
  amount: number;
  payment_date: string;
  paid_at_actual: string | null;
  invoices: { enrollment_id: string };
}

async function inChunks<T>(ids: string[], fetch: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await fetch(ids.slice(i, i + CHUNK));
    if (error) throw error;
    out.push(...(data ?? []));
  }
  return out;
}

// Loads everything computePartnerReport needs for the active hub. Money is
// fetched from the start of the previous year so any quarter (and the one
// before it, for the income-change column) can be computed without refetching.
export function usePartnerReport(year: number, quarter: number) {
  const { hubId } = useAuth();

  const query = useQuery({
    queryKey: ['partner-report', hubId, year],
    enabled: Boolean(hubId),
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const [hubRes, programsRes, fieldsRes] = await Promise.all([
        db.from('hubs').select('name, contact_email').eq('id', hubId!).maybeSingle(),
        db.from('programs').select('id').eq('hub_id', hubId!),
        db.from('custom_fields').select('id, key').eq('hub_id', hubId!).in('key', ['date_of_birth', 'age_category']),
      ]);
      if (programsRes.error) throw programsRes.error;
      const programIds = (programsRes.data ?? []).map((p: { id: string }) => p.id);

      const enrollmentRows = await inChunks<EnrollmentRow>(programIds, chunk =>
        db
          .from('enrollments')
          .select('id, full_name, created_at, enrollment_status, total_amount, cohort_id, organizations(organization_name, organization_type)')
          .in('program_id', chunk),
      );
      const enrollmentIds = enrollmentRows.map(e => e.id);
      const fieldKeyById = new Map<string, string>((fieldsRes.data ?? []).map((f: { id: string; key: string }) => [f.id, f.key]));
      const since = `${year - 1}-01-01`;

      const [memberships, fieldValues, installments, payments, cohortsRes, otherIncomeRes, staffRes] = await Promise.all([
        inChunks<{ enrollment_id: string; cohort_id: string }>(enrollmentIds, chunk =>
          db.from('cohort_students').select('enrollment_id, cohort_id').in('enrollment_id', chunk),
        ),
        fieldKeyById.size
          ? inChunks<{ enrollment_id: string; field_id: string; value: string | null }>(enrollmentIds, chunk =>
              db.from('field_values').select('enrollment_id, field_id, value').in('field_id', [...fieldKeyById.keys()]).in('enrollment_id', chunk),
            )
          : Promise.resolve([]),
        // Same legs and filters as get_finance_summary's cash basis: paid
        // installments + payments, cancelled invoices excluded, bank date
        // preferred over the staff-entered one.
        inChunks<InstallmentRow>(enrollmentIds, chunk =>
          db
            .from('installments')
            .select('amount, paid_at, paid_at_actual, invoices!inner(status, enrollment_id)')
            .eq('status', 'paid')
            .neq('invoices.status', 'cancelled')
            .in('invoices.enrollment_id', chunk)
            .gte('paid_at', since),
        ),
        inChunks<PaymentRow>(enrollmentIds, chunk =>
          db
            .from('payments')
            .select('amount, payment_date, paid_at_actual, invoices!inner(status, enrollment_id)')
            .neq('invoices.status', 'cancelled')
            .in('invoices.enrollment_id', chunk)
            .gte('payment_date', since),
        ),
        db.from('cohorts').select('id, cohort_label, start_date, end_date').eq('hub_id', hubId!),
        db.from('other_income').select('amount, payment_date').eq('hub_id', hubId!).gte('payment_date', since),
        db.from('staff').select('full_name, role_title, created_at').eq('hub_id', hubId!).gte('created_at', since),
      ]);
      for (const r of [cohortsRes, otherIncomeRes, staffRes]) if (r.error) throw r.error;

      const cohortIdsByEnrollment = new Map<string, Set<string>>();
      const addCohort = (enrollmentId: string, cohortId: string | null) => {
        if (!cohortId) return;
        if (!cohortIdsByEnrollment.has(enrollmentId)) cohortIdsByEnrollment.set(enrollmentId, new Set());
        cohortIdsByEnrollment.get(enrollmentId)!.add(cohortId);
      };
      // enrollments.cohort_id and cohort_students disagree for many students
      // (course sequences, classroom moves), so take the union of both.
      enrollmentRows.forEach(e => addCohort(e.id, e.cohort_id));
      memberships.forEach(m => addCohort(m.enrollment_id, m.cohort_id));

      const fieldsByEnrollment = new Map<string, Record<string, string>>();
      for (const fv of fieldValues) {
        const key = fieldKeyById.get(fv.field_id);
        if (!key || !fv.value) continue;
        if (!fieldsByEnrollment.has(fv.enrollment_id)) fieldsByEnrollment.set(fv.enrollment_id, {});
        fieldsByEnrollment.get(fv.enrollment_id)![key] = fv.value;
      }

      const enrollments: ReportEnrollment[] = enrollmentRows.map(e => ({
        id: e.id,
        full_name: e.full_name,
        created_at: e.created_at,
        enrollment_status: e.enrollment_status,
        total_amount: Number(e.total_amount ?? 0),
        organization_name: e.organizations?.organization_name ?? null,
        organization_type: e.organizations?.organization_type ?? null,
        cohort_ids: [...(cohortIdsByEnrollment.get(e.id) ?? [])],
        date_of_birth: fieldsByEnrollment.get(e.id)?.date_of_birth ?? null,
        age_category: fieldsByEnrollment.get(e.id)?.age_category ?? null,
      }));

      const money: ReportMoney[] = [
        ...installments.map(i => ({
          enrollment_id: i.invoices.enrollment_id,
          amount: Number(i.amount),
          date: String(i.paid_at_actual ?? i.paid_at).slice(0, 10),
        })),
        ...payments.map(p => ({
          enrollment_id: p.invoices.enrollment_id,
          amount: Number(p.amount),
          date: String(p.paid_at_actual ?? p.payment_date).slice(0, 10),
        })),
      ];

      const input: PartnerReportInput = {
        enrollments,
        cohorts: cohortsRes.data ?? [],
        money,
        otherIncome: otherIncomeRes.data ?? [],
        staff: staffRes.data ?? [],
      };
      return { hub: hubRes.data as { name: string; contact_email: string | null } | null, input };
    },
  });

  const report = useMemo(() => {
    if (!query.data) return null;
    const today = new Date().toISOString().slice(0, 10);
    return computePartnerReport(query.data.input, year, quarter, today);
  }, [query.data, year, quarter]);

  return {
    data: report,
    hub: query.data?.hub ?? null,
    loading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
