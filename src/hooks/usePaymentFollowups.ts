import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { untypedRpc } from '@/lib/untypedRpc';
import { useAuth } from '@/hooks/useAuth';

export type FollowupKind = 'called' | 'whatsapp' | 'note' | 'promise' | 'written_off' | 'reopened';

export interface FollowupState {
  enrollment_id: string;
  last_kind: FollowupKind;
  last_note: string | null;
  last_at: string;
  last_by: string | null;
  promised_amount: number | null;
  promised_date: string | null;
  promise_active: boolean;
  promise_broken: boolean;
  written_off: boolean;
  contacts: number;
}

export interface FollowupEntry {
  id: string;
  kind: FollowupKind;
  note: string | null;
  promised_amount: number | null;
  promised_date: string | null;
  created_at: string;
  created_by: string | null;
  by_name?: string | null;
}

export interface FollowupInput {
  kind: FollowupKind;
  note?: string;
  promised_amount?: number | null;
  promised_date?: string | null;
}

export function usePaymentFollowups() {
  const { hubId } = useAuth();
  const queryClient = useQueryClient();
  const { data = [], isLoading: loading, error } = useQuery({
    queryKey: ['payment-followups', hubId],
    queryFn: async () => {
      const { data, error } = await untypedRpc('get_payment_followup_state');
      if (error) throw error;
      return (data as FollowupState[]) || [];
    },
    enabled: Boolean(hubId),
  });

  const byEnrollment = new Map(data.map(s => [s.enrollment_id, s]));
  const refetch = () => queryClient.invalidateQueries({ queryKey: ['payment-followups'] });

  const log = async (enrollmentId: string, input: FollowupInput) => {
    const { error } = await untypedRpc('log_payment_followup', {
      p_enrollment_id: enrollmentId,
      p_kind: input.kind,
      p_note: input.note ?? null,
      p_promised_amount: input.promised_amount ?? null,
      p_promised_date: input.promised_date ?? null,
    });
    if (error) throw error;
    refetch();
    queryClient.invalidateQueries({ queryKey: ['payment-followup-history', enrollmentId] });
  };

  return { data: byEnrollment, loading, error, refetch, log };
}

export function usePaymentFollowupHistory(enrollmentId: string | null) {
  const { data = [], isLoading: loading } = useQuery({
    queryKey: ['payment-followup-history', enrollmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_followups' as never)
        .select('id, kind, note, promised_amount, promised_date, created_at, created_by')
        .eq('enrollment_id', enrollmentId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data as unknown as FollowupEntry[]) || [];
      const ids = [...new Set(rows.map(r => r.created_by).filter(Boolean))] as string[];
      if (ids.length === 0) return rows;
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name').in('user_id', ids);
      const names = new Map((profiles || []).map(p => [p.user_id, p.full_name]));
      return rows.map(r => ({ ...r, by_name: r.created_by ? names.get(r.created_by) ?? null : null }));
    },
    enabled: Boolean(enrollmentId),
  });
  return { data, loading };
}
