import { useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedRpc } from '@/lib/untypedRpc';
import type { RiskFlag, UncountedSession } from '@/lib/risk';

export function useStudentRiskFlags(classroomId: string | undefined) {
  const queryClient = useQueryClient();
  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['student-risk-flags', classroomId],
    queryFn: async () => {
      const { data, error } = await untypedRpc('get_student_risk_flags', { p_classroom_id: classroomId });
      if (error) throw error;
      return data as { flags: RiskFlag[]; uncounted_sessions: UncountedSession[] };
    },
    enabled: Boolean(classroomId),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['student-risk-flags', classroomId] });

  const dismiss = async (flagId: string) => {
    const { error } = await untypedRpc('dismiss_student_risk_flag', { p_flag_id: flagId });
    if (error) throw error;
    refetch();
  };

  return {
    data: { flags: data?.flags ?? [], uncountedSessions: data?.uncounted_sessions ?? [] },
    loading, error, refetch, dismiss,
  };
}
