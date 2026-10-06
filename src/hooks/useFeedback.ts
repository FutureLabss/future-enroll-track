// @ts-nocheck -- feedback schema is introduced by the matching migration.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type FeedbackQuestionType = 'rating' | 'nps' | 'boolean' | 'choice' | 'text';
export type FeedbackCampaignStatus = 'draft' | 'open' | 'closed' | 'cancelled';

export interface FeedbackQuestion {
  id: string;
  prompt: string;
  description?: string | null;
  question_type: FeedbackQuestionType;
  dimension: 'instructor' | 'curriculum' | 'operations' | 'platform' | 'support' | 'outcomes' | 'safeguarding';
  options: string[];
  required: boolean;
  sort_order: number;
}

export interface FeedbackCampaign {
  id: string;
  title: string;
  campaign_type: 'session' | 'course';
  status: FeedbackCampaignStatus;
  classroom_id: string;
  cohort_id?: string | null;
  schedule_id?: string | null;
  instructor_id?: string | null;
  opens_at: string;
  closes_at: string;
  questions_snapshot: FeedbackQuestion[];
  classrooms?: { name: string } | null;
  cohorts?: { cohort_label: string } | null;
}

export interface FeedbackInvitation {
  id: string;
  campaign_id: string;
  completed_at?: string | null;
  dismissed_at?: string | null;
  campaigns: FeedbackCampaign;
}

export function useStudentFeedback() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['student-feedback'],
    queryFn: async () => {
      const { data, error } = await supabase.from('feedback_invitations').select('id,campaign_id,completed_at,dismissed_at,feedback_campaigns!inner(id,title,campaign_type,status,classroom_id,cohort_id,schedule_id,instructor_id,opens_at,closes_at,questions_snapshot,classrooms(name),cohorts(cohort_label))').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((row: any) => ({ ...row, campaigns: row.feedback_campaigns })) as FeedbackInvitation[];
    },
  });
  const submit = useMutation({
    mutationFn: async ({ invitationId, answers }: { invitationId: string; answers: Array<{ question_id: string; value: unknown }> }) => {
      const { data, error } = await supabase.rpc('submit_feedback', { p_invitation_id: invitationId, p_answers: answers });
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['student-feedback'] }),
  });
  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('feedback_invitations').update({ dismissed_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['student-feedback'] }),
  });
  return { invitations: query.data || [], loading: query.isLoading, error: query.error, submitFeedback: submit.mutateAsync, submitting: submit.isPending, dismiss: dismiss.mutateAsync };
}

export function useFeedbackCampaigns(filters?: { classroomId?: string; cohortId?: string }) {
  return useQuery({
    queryKey: ['feedback-campaigns', filters],
    queryFn: async () => {
      let request = supabase.from('feedback_campaigns').select('*,classrooms(name),cohorts(cohort_label)').order('created_at', { ascending: false });
      if (filters?.classroomId) request = request.eq('classroom_id', filters.classroomId);
      if (filters?.cohortId) request = request.eq('cohort_id', filters.cohortId);
      const { data, error } = await request;
      if (error) throw error;
      return data as FeedbackCampaign[];
    },
  });
}

export function useFeedbackSummary(campaignId?: string) {
  return useQuery({
    queryKey: ['feedback-summary', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_feedback_summary', { p_campaign_id: campaignId! });
      if (error) throw error;
      return data as any;
    },
    enabled: Boolean(campaignId),
  });
}
