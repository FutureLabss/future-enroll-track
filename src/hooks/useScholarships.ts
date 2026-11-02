import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { untypedRpc } from '@/lib/untypedRpc';

export interface Scholarship {
  id: string;
  enrollment_id: string;
  amount: number;
  applied_amount: number;
  funded_by: string;
  reason: string;
  awarded_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  student_name: string;
  program_name: string;
  cohort_label: string | null;
  outstanding: number;
  awarded_by_name: string | null;
  can_manage: boolean;
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['scholarships'] });
    queryClient.invalidateQueries({ queryKey: ['scholarship'] });
    queryClient.invalidateQueries({ queryKey: ['enrollment-detail'] });
    queryClient.invalidateQueries({ queryKey: ['outstanding-invoices'] });
  };
}

export async function revokeScholarship(id: string, reason: string) {
  const { error } = await untypedRpc('revoke_scholarship', { p_scholarship_id: id, p_reason: reason });
  if (error) throw error;
}

export function useScholarships(includeRevoked: boolean) {
  const invalidate = useInvalidate();
  const { data = [], isLoading: loading, error } = useQuery({
    queryKey: ['scholarships', includeRevoked],
    queryFn: async () => {
      const { data, error } = await untypedRpc('list_scholarships', { p_include_revoked: includeRevoked });
      if (error) throw error;
      return (data as Scholarship[]) || [];
    },
  });
  const revoke = async (id: string, reason: string) => { await revokeScholarship(id, reason); invalidate(); };
  return { data, loading, error, refetch: invalidate, revoke };
}

// One enrollment's live scholarship, and whether the viewer may award or revoke it.
export function useEnrollmentScholarship(enrollmentId: string | undefined) {
  const invalidate = useInvalidate();
  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['scholarship', enrollmentId],
    enabled: Boolean(enrollmentId),
    queryFn: async () => {
      const [{ data: row, error }, { data: canAward, error: permError }] = await Promise.all([
        supabase.from('scholarships' as never).select('id, amount, applied_amount, funded_by, reason, awarded_at')
          .eq('enrollment_id', enrollmentId!).is('revoked_at', null).maybeSingle(),
        untypedRpc('can_award_scholarship', { p_enrollment_id: enrollmentId }),
      ]);
      if (error) throw error;
      if (permError) throw permError;
      return { scholarship: row as Pick<Scholarship, 'id' | 'amount' | 'applied_amount' | 'funded_by' | 'reason' | 'awarded_at'> | null, canAward: Boolean(canAward) };
    },
  });

  const award = async (amount: number, reason: string, fundedBy: string) => {
    const { error } = await untypedRpc('award_scholarship', {
      p_enrollment_id: enrollmentId, p_amount: amount, p_reason: reason, p_funded_by: fundedBy,
    });
    if (error) throw error;
    invalidate();
  };
  const revoke = async (id: string, reason: string) => { await revokeScholarship(id, reason); invalidate(); };

  return { data: data ?? { scholarship: null, canAward: false }, loading, error, refetch: invalidate, award, revoke };
}
