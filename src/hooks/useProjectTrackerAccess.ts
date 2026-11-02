import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { untypedRpc } from '@/lib/untypedRpc';

export type TrackerRole = 'member' | 'manager' | 'admin';

export interface TrackerAccessRow {
  user_id: string;
  full_name: string;
  email: string;
  tracker_role: TrackerRole;
  granted_at: string;
  updated_at: string;
  revoked_at: string | null;
  synced_at: string | null;
  sync_error: string | null;
}

export interface TrackerCandidate {
  user_id: string;
  full_name: string;
  email: string;
  lms_roles: string[];
}

export type AccessChange =
  | { action: 'grant'; userId: string; role: TrackerRole }
  | { action: 'revoke' | 'sync'; userId: string };

// A row the Tracker has not confirmed since its last change. Revoked rows that are
// confirmed need no attention, so they drop off the page.
export function needsSync(row: TrackerAccessRow) {
  return !row.synced_at || Boolean(row.sync_error);
}

export function useProjectTrackerAccess(enabled: boolean) {
  const queryClient = useQueryClient();

  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['project-tracker-access'],
    queryFn: async () => {
      const [access, candidates] = await Promise.all([
        untypedRpc('list_project_tracker_access'),
        untypedRpc('list_project_tracker_candidates'),
      ]);
      if (access.error) throw access.error;
      if (candidates.error) throw candidates.error;
      return {
        access: (access.data as TrackerAccessRow[]) || [],
        candidates: (candidates.data as TrackerCandidate[]) || [],
      };
    },
    enabled,
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['project-tracker-access'] });
    // The superadmin may have just granted or revoked their own sidebar link.
    queryClient.invalidateQueries({ queryKey: ['has-project-tracker-access'] });
  };

  // Resolves with the Tracker sync outcome; rejects only when the LMS change itself failed.
  const change = async (input: AccessChange): Promise<{ synced: boolean; error?: string }> => {
    const { data: result, error: invokeError } = await supabase.functions.invoke('project-tracker-access', {
      body: { action: input.action, user_id: input.userId, ...(input.action === 'grant' ? { role: input.role } : {}) },
    });
    refetch();
    if (invokeError) {
      const body = await (invokeError as { context?: Response }).context?.json?.().catch(() => null);
      throw new Error(body?.error || 'Could not update Project Tracker access');
    }
    return result as { synced: boolean; error?: string };
  };

  return { data: data ?? { access: [], candidates: [] }, loading, error, change };
}

export function useHasProjectTrackerAccess(userId: string | undefined) {
  const { data = false } = useQuery({
    queryKey: ['has-project-tracker-access', userId],
    queryFn: async () => {
      const { data } = await untypedRpc('has_project_tracker_access');
      return Boolean(data);
    },
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
  });
  return data;
}
