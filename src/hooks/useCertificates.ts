import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { untypedRpc } from '@/lib/untypedRpc';

export interface CertificateState {
  enrollment_id: string;
  certificate_id: string | null;
  code: string | null;
  issued_at: string | null;
  issued_by_name: string | null;
  emailed_at: string | null;
  request_id: string | null;
  requested_at: string | null;
  requested_by_name: string | null;
  outstanding: number;
  can_request: boolean;
  can_approve: boolean;
  is_ceo: boolean;
}

// Certificate state for a list of enrollments. Tutors, training managers and hub
// admins request; the CEO or a training manager approves (and may issue directly).
export function useCertificates(enrollmentIds: string[]) {
  const queryClient = useQueryClient();
  const key = [...enrollmentIds].sort().join(',');
  const { data = [], isLoading: loading, error } = useQuery({
    queryKey: ['certificates', key],
    queryFn: async () => {
      const { data, error } = await untypedRpc('get_certificates_for', { p_enrollment_ids: enrollmentIds });
      if (error) throw error;
      return (data as CertificateState[]) || [];
    },
    enabled: enrollmentIds.length > 0,
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['certificates'] });
    queryClient.invalidateQueries({ queryKey: ['certificate-requests'] });
  };

  const sendEmail = async (certificateId: string) => {
    const res = await supabase.functions.invoke('send-certificate-email', { body: { certificate_id: certificateId } });
    if (res.error) throw res.error;
    if (res.data?.error) throw new Error(res.data.error);
    refetch();
    return res.data as { sent_to: string };
  };

  const issue = async (enrollmentId: string, studentName: string, email: boolean, feeOverride?: string) => {
    const { data, error } = await untypedRpc('issue_certificate', {
      p_enrollment_id: enrollmentId, p_student_name: studentName, p_fee_override: feeOverride || null,
    });
    if (error) throw error;
    refetch();
    return email ? sendEmail(data as string) : null;
  };

  const request = async (enrollmentId: string, studentName: string, note: string) => {
    const { error } = await untypedRpc('request_certificate', { p_enrollment_id: enrollmentId, p_student_name: studentName, p_note: note || null });
    if (error) throw error;
    refetch();
  };

  const cancelRequest = async (requestId: string) => {
    const { error } = await untypedRpc('cancel_certificate_request', { p_request_id: requestId });
    if (error) throw error;
    refetch();
  };

  const revoke = async (certificateId: string, reason: string) => {
    const { error } = await untypedRpc('revoke_certificate', { p_certificate_id: certificateId, p_reason: reason });
    if (error) throw error;
    refetch();
  };

  return {
    data: new Map(data.map(c => [c.enrollment_id, c])),
    loading, error, refetch, issue, request, cancelRequest, revoke, sendEmail,
  };
}
