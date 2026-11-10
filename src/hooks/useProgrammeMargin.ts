import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/lib/untypedRpc';

export interface ProgrammeMarginRow {
  program_id: string;
  program_name: string;
  revenue: number;
  paying_students: number;
  tutor_pay: number;
  tutors: { name: string; amount: number }[];
}

export interface ProgrammeMargin {
  rows: ProgrammeMarginRow[];
  overhead: { amount: number; staff: { name: string; role: string | null; amount: number }[] };
}

const EMPTY: ProgrammeMargin = { rows: [], overhead: { amount: 0, staff: [] } };

// Fees received per programme against the pay of the tutors who teach it, for a date range.
export function useProgrammeMargin(from: string, to: string, enabled: boolean) {
  const { data, isLoading: loading, error, refetch } = useQuery({
    queryKey: ['programme-margin', from, to],
    enabled,
    queryFn: async () => {
      const { data, error } = await untypedRpc('get_programme_margin', { p_from: from, p_to: to });
      if (error) throw error;
      return (data as ProgrammeMargin) ?? EMPTY;
    },
  });
  return { data: data ?? EMPTY, loading, error, refetch };
}
