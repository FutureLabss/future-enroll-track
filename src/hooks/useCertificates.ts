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
  can_issue: boolean;
}

// Certificate state for a list of enrollments, and whether the signed-in user may
// issue (CEO, training manager, or the class tutor).
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

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['certificates'] });

  const sendEmail = async (certificateId: string) => {
    const res = await supabase.functions.invoke('send-certificate-email', { body: { certificate_id: certificateId } });
    if (res.error) throw res.error;
    if (res.data?.error) throw new Error(res.data.error);
    refetch();
    return res.data as { sent_to: string };
  };

  const issue = async (enrollmentId: string, studentName: string, email: boolean) => {
    const { data, error } = await untypedRpc('issue_certificate', { p_enrollment_id: enrollmentId, p_student_name: studentName });
    if (error) throw error;
    refetch();
    return email ? sendEmail(data as string) : null;
  };

  const revoke = async (certificateId: string, reason: string) => {
    const { error } = await untypedRpc('revoke_certificate', { p_certificate_id: certificateId, p_reason: reason });
    if (error) throw error;
    refetch();
  };

  return { data: new Map(data.map(c => [c.enrollment_id, c])), loading, error, refetch, issue, revoke, sendEmail };
}
