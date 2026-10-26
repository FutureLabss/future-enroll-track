import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export interface StaffMember {
  id: string;
  full_name: string;
  email: string | null;
  role_title: string | null;
}

// Active staff with their email, for choosing exactly who receives an email.
export function useStaffDirectory() {
  const { hubId } = useAuth();
  const { data = [], isLoading: loading, error, refetch } = useQuery({
    queryKey: ['staff-directory', hubId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('id, full_name, email, role_title')
        .eq('active', true)
        // staff.hub_id is newer than the generated types
        .eq('hub_id' as never, hubId!)
        .order('full_name');
      if (error) throw error;
      return (data as StaffMember[]) || [];
    },
    enabled: Boolean(hubId),
    staleTime: 5 * 60_000,
  });
  return { data, loading, error, refetch };
}
