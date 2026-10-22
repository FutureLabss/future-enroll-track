import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/lib/untypedRpc';

// Only a cohort's tutor, a training manager or the superadmin may set schedules
// (can_set_schedule). The database enforces it; this hides controls that would fail.
export function useSchedulePermissions(classroomId: string | null | undefined) {
  const { data = [], isLoading: loading, error } = useQuery({
    queryKey: ['schedule-permissions', classroomId],
    queryFn: async () => {
      const { data, error } = await untypedRpc('get_schedule_permissions', { p_classroom_id: classroomId });
      if (error) throw error;
      return (data as { cohort_id: string | null; allowed: boolean }[]) || [];
    },
    enabled: Boolean(classroomId),
    staleTime: 60_000,
  });

  const allowed = new Map(data.map(row => [row.cohort_id, row.allowed]));
  const canSchedule = (cohortId?: string | null) => allowed.get(cohortId ?? null) ?? false;
  const canScheduleAny = data.some(row => row.allowed);

  return { data, loading, error, canSchedule, canScheduleAny };
}
