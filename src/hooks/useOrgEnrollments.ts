import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// Shared by OrgDashboard / OrgEnrollmentsPage / OrgReportsPage so navigating
// between them reuses one cached fetch instead of re-resolving the
// organization and re-fetching the same enrollments three times.
export function useOrgEnrollments() {
  const { user } = useAuth();

  const { data, isLoading: loading } = useQuery({
    queryKey: ['org-enrollments', user?.id],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user!.id)
        .single();
      if (!profile?.organization_id) return [] as any[];
      const { data, error } = await supabase
        .from('enrollments')
        .select('*, programs(program_name), cohorts(cohort_label)')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });

  return { enrollments: data ?? [], loading };
}
