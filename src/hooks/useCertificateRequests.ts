import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { untypedRpc } from '@/lib/untypedRpc';

export type RequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

export interface CertificateRequest {
  id: string;
  enrollment_id: string;
  student_name: string;
  note: string | null;
  status: RequestStatus;
  requested_at: string;
  decided_at: string | null;
  decision_note: string | null;
  requested_by_name: string | null;
  decided_by_name: string | null;
  program_name: string;
  cohort_label: string | null;
  email: string | null;
  outstanding: number;
  can_approve: boolean;
  mine: boolean;
  code: string | null;
}

export function useCertificateRequests(status: RequestStatus | 'all') {
  const queryClient = useQueryClient();
  const { data = [], isLoading: loading, error } = useQuery({
    queryKey: ['certificate-requests', status],
    queryFn: async () => {
      const { data, error } = await untypedRpc('list_certificate_requests', { p_status: status });
      if (error) throw error;
      return (data as CertificateRequest[]) || [];
    },
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['certificate-requests'] });
    queryClient.invalidateQueries({ queryKey: ['certificates'] });
  };

  const approve = async (r: CertificateRequest, studentName: string, email: boolean, feeOverride: string) => {
    const { data, error } = await untypedRpc('decide_certificate_request', {
      p_request_id: r.id, p_approve: true, p_student_name: studentName, p_fee_override: feeOverride || null,
    });
    if (error) throw error;
    refetch();
    if (!email) return null;
    const res = await supabase.functions.invoke('send-certificate-email', { body: { certificate_id: data as string } });
    if (res.error) throw res.error;
    if (res.data?.error) throw new Error(res.data.error);
    return res.data as { sent_to: string };
  };

  const decline = async (id: string, reason: string) => {
    const { error } = await untypedRpc('decide_certificate_request', { p_request_id: id, p_approve: false, p_note: reason });
    if (error) throw error;
    refetch();
  };

  const cancel = async (id: string) => {
    const { error } = await untypedRpc('cancel_certificate_request', { p_request_id: id });
    if (error) throw error;
    refetch();
  };

  return { data, loading, error, refetch, approve, decline, cancel };
}
