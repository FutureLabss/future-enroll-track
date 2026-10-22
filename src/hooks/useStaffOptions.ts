import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type StaffOption = { id: string; full_name: string };

export function useStaffOptions(provided?: StaffOption[]) {
  const { data = [] } = useQuery({
    queryKey: ['staff-names'],
    queryFn: async () => {
      const { data } = await supabase.from('staff').select('id, full_name').order('full_name');
      return (data as StaffOption[]) || [];
    },
    enabled: !provided,
    staleTime: 5 * 60_000,
  });
  return provided ?? data;
}
