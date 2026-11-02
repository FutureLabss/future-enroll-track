import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/lib/untypedRpc';
import { useAuth } from '@/hooks/useAuth';

export interface PausedEnrollment {
  enrollment_id: string;
  program_id: string;
  program_name: string;
  outstanding: number;
  due_date: string;
  invoice_id: string;
}

// The signed-in student's enrollments whose classroom access is paused for an
// overdue payment (30+ days, after a warning). Cleared by paying or a promise to pay.
export function usePausedAccess() {
  const { user } = useAuth();
  const { data = [], isLoading: loading, error, refetch } = useQuery({
    queryKey: ['paused-access', user?.id],
    queryFn: async () => {
      const { data, error } = await untypedRpc('my_paused_enrollments');
      if (error) throw error;
      return (data as PausedEnrollment[]) || [];
    },
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });
  return { data, loading, error, refetch };
}
