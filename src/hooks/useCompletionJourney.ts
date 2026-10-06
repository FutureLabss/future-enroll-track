// @ts-nocheck -- tables are added by the completion-flow migration.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface CompletionJourney {
  graduation_status: 'pending' | 'graduated' | 'not_graduated';
  feedback_completed: boolean;
  testimonial: null | { id: string; decision: 'submitted' | 'declined'; moderation_status: string; publication_consent: boolean };
  certificate: null | { id: string; certificate_number: string; status: 'pending_generation' | 'issued' | 'generation_failed' | 'revoked'; issued_at?: string | null; verification_token: string; generation_error?: string | null };
}

export function useCompletionJourney(cohortId?: string) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['completion-journey', cohortId],
    queryFn: async () => { const { data, error } = await supabase.rpc('get_completion_journey', { p_cohort_id: cohortId! }); if (error) throw error; return data as CompletionJourney; },
    enabled: Boolean(cohortId),
    refetchInterval: data => data.state.data?.certificate?.status === 'pending_generation' ? 5000 : false,
  });
  const decide = useMutation({
    mutationFn: async (input: { decision: 'submitted'|'declined'; text?: string; publicationConsent?: boolean; fullName?: boolean; firstName?: boolean; photo?: boolean; program?: boolean; cohort?: boolean; organization?: boolean }) => {
      const { error } = await supabase.rpc('submit_testimonial_decision', { p_cohort_id: cohortId!, p_decision: input.decision, p_text: input.text || null, p_publication_consent: !!input.publicationConsent, p_allow_full_name: !!input.fullName, p_allow_first_name: !!input.firstName, p_allow_profile_photo: !!input.photo, p_allow_program: !!input.program, p_allow_cohort: !!input.cohort, p_allow_organization: !!input.organization });
      if (error) throw error;
      await supabase.functions.invoke('generate-certificates', { body: {} });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['completion-journey', cohortId] }),
  });
  const generate = async () => { const { error } = await supabase.functions.invoke('generate-certificates', { body: {} }); if (error) throw error; await client.invalidateQueries({ queryKey: ['completion-journey', cohortId] }); };
  const download = async (certificateId: string) => {
    const { data: row, error } = await supabase.from('certificates').select('pdf_storage_path,certificate_number').eq('id', certificateId).single();
    if (error) throw error;
    const { data, error: signedError } = await supabase.storage.from('certificates').createSignedUrl(row.pdf_storage_path, 300, { download: `${row.certificate_number}.pdf` });
    if (signedError) throw signedError;
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };
  return { journey: query.data, loading: query.isLoading, error: query.error, submitDecision: decide.mutateAsync, submitting: decide.isPending, generate, download, refetch: query.refetch };
}
