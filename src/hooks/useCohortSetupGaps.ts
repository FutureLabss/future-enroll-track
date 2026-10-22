import { useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedRpc } from '@/lib/untypedRpc';

export interface CohortSetupGap {
  cohort_id: string;
  cohort_label: string;
  classroom_id: string | null;
  classroom_name: string | null;
  program_id: string | null;
  hub_id: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  primary_tutor_id: string | null;
  primary_tutor_name: string | null;
  past_sessions: number;
  needs_schedule: boolean;
  needs_tutor: boolean;
}

// Open cohorts missing a primary tutor, and running cohorts with no upcoming
// classes (see list_cohort_setup_gaps).
export function useCohortSetupGaps(classroomId?: string) {
  const queryClient = useQueryClient();

  const { data = [], isLoading: loading, error } = useQuery({
    queryKey: ['cohort-setup-gaps', classroomId ?? 'all'],
    queryFn: async () => {
      const { data, error } = await untypedRpc('list_cohort_setup_gaps', { p_classroom_id: classroomId ?? null });
      if (error) throw error;
      return (data as CohortSetupGap[]) || [];
    },
    staleTime: 60_000,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['cohort-setup-gaps'] });

  return { data, loading, error, refetch };
}
