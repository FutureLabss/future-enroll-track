import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface CohortAnalytics {
  enrollment: {
    total_students: number;
    active_count: number;
    pending_count: number;
    overdue_count: number;
    completed_count: number;
    cancelled_count: number;
    total_invoiced: number;
    total_paid: number;
    total_outstanding: number;
  };
  sessions: {
    total_sessions: number;
    closed_sessions: number;
    open_sessions: number;
  };
  attendance: {
    total_marks: number;
    present_count: number;
    late_count: number;
    attendance_rate: number;
  };
  trend: Array<{
    code: string;
    date: string;
    present: number;
    late: number;
    absent: number;
  }>;
  students: Array<{
    student_id: string;
    full_name: string | null;
    sessions_attended: number;
    total_sessions: number;
  }>;
}

export function useCohortAnalytics(cohortId: string) {
  const { data = null, isLoading: loading } = useQuery<CohortAnalytics | null>({
    queryKey: ['cohort-analytics', cohortId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_cohort_analytics' as any, {
        p_cohort_id: cohortId,
      });
      if (error) throw error;
      return data as CohortAnalytics | null;
    },
    enabled: Boolean(cohortId),
    staleTime: 60_000,
  });

  return { analytics: data, loading };
}
