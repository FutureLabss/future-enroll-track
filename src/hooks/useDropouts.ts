import { useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedRpc } from '@/lib/untypedRpc';

export type DropoutStatus = 'open' | 'rejoin_requested' | 'moved' | 'withdrawn' | 'returned';

export interface DropoutCase {
  id: string;
  enrollment_id: string;
  status: DropoutStatus;
  detected_at: string;
  last_attended_at: string | null;
  chosen_at: string | null;
  choice_note: string | null;
  messages_sent: number;
  resolution_note: string | null;
  resolved_at: string | null;
  student_name: string;
  email: string | null;
  phone: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  program_name: string;
  cohort_label: string;
  classroom_id: string | null;
  next_cohort_id: string | null;
  next_cohort_label: string | null;
  next_cohort_start: string | null;
  outstanding: number;
  cohort_options: { id: string; label: string; start_date: string | null }[] | null;
}

export function useDropouts(filter: DropoutStatus | 'live' | 'all') {
  const queryClient = useQueryClient();
  const { data = [], isLoading: loading, error } = useQuery({
    queryKey: ['dropouts', filter],
    queryFn: async () => {
      const { data, error } = await untypedRpc('list_dropout_cases', { p_status: filter });
      if (error) throw error;
      return (data as DropoutCase[]) || [];
    },
  });
  const refetch = () => queryClient.invalidateQueries({ queryKey: ['dropouts'] });

  const move = async (caseId: string, cohortId: string) => {
    const { error } = await untypedRpc('move_dropout_to_cohort', { p_case_id: caseId, p_cohort_id: cohortId });
    if (error) throw error;
    refetch();
  };

  const resolve = async (caseId: string, status: 'rejoin_requested' | 'withdrawn' | 'returned', note: string) => {
    const { error } = await untypedRpc('resolve_dropout_case', { p_case_id: caseId, p_status: status, p_note: note });
    if (error) throw error;
    refetch();
  };

  return { data, loading, error, refetch, move, resolve };
}
