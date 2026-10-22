import { useQuery, useQueryClient } from '@tanstack/react-query';
import { untypedRpc } from '@/lib/untypedRpc';
import type { ActivityEvent } from '@/lib/activity';

export interface ActivityViewer {
  id: string;
  hub_id: string;
  hub_name: string | null;
  user_id: string;
  full_name: string | null;
  email: string | null;
  granted_at: string;
  granted_by_name: string | null;
}

export interface ActivityViewerCandidate {
  user_id: string;
  full_name: string | null;
  email: string | null;
  hub_id: string;
  hub_name: string | null;
}

export function useCanViewActivityReport() {
  const { data = false, isLoading: loading, error } = useQuery({
    queryKey: ['can-view-activity-report'],
    queryFn: async () => {
      const { data, error } = await untypedRpc('can_view_activity_report');
      if (error) throw error;
      return Boolean(data);
    },
    staleTime: 5 * 60_000,
  });
  return { data, loading, error };
}

export function useActivityReport(sinceDays: number, category: string | null, enabled: boolean) {
  const queryClient = useQueryClient();

  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['activity-report', sinceDays, category],
    queryFn: async () => {
      const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
      const until = new Date().toISOString();
      const [events, counts] = await Promise.all([
        untypedRpc('get_activity_report', { p_since: since, p_until: until, p_category: category, p_limit: 2000 }),
        untypedRpc('get_activity_counts', { p_since: since, p_until: until }),
      ]);
      if (events.error) throw events.error;
      if (counts.error) throw counts.error;
      return {
        events: (events.data as ActivityEvent[]) || [],
        counts: (counts.data as { event_type: string; category: string; total: number }[]) || [],
      };
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['activity-report'] });

  return { data: data ?? { events: [], counts: [] }, loading, error, refetch };
}

export function useActivityReportViewers(enabled: boolean) {
  const queryClient = useQueryClient();

  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['activity-report-viewers'],
    queryFn: async () => {
      const [viewers, candidates] = await Promise.all([
        untypedRpc('list_activity_report_viewers'),
        untypedRpc('list_activity_report_candidates'),
      ]);
      if (viewers.error) throw viewers.error;
      if (candidates.error) throw candidates.error;
      return {
        viewers: (viewers.data as ActivityViewer[]) || [],
        candidates: (candidates.data as ActivityViewerCandidate[]) || [],
      };
    },
    enabled,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['activity-report-viewers'] });

  const grant = async (userId: string) => {
    const { error } = await untypedRpc('grant_activity_report_access', { p_user_id: userId });
    if (error) throw error;
    refetch();
  };

  const revoke = async (viewerId: string) => {
    const { error } = await untypedRpc('revoke_activity_report_access', { p_viewer_id: viewerId });
    if (error) throw error;
    refetch();
  };

  return { data: data ?? { viewers: [], candidates: [] }, loading, error, refetch, grant, revoke };
}
