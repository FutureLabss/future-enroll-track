import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { untypedRpc } from '@/lib/untypedRpc';
import { useAuth } from '@/hooks/useAuth';

export interface OnboardingStep {
  id: string;
  delay_days: number;
  subject: string;
  body: string;
  active: boolean;
  from_name: string | null;
  reply_to: string | null;
}

export interface StepStats {
  sent: number;
  failed: number;
  skipped: number;
  queued: number;
}

export interface OnboardingJourney {
  id: string;
  email: string;
  full_name: string | null;
  status: 'active' | 'stopped';
  stop_reason: string | null;
  started_at: string;
  program_name: string | null;
  sent: number;
  last_sent_at: string | null;
}

interface Overview {
  step_stats: Record<string, StepStats>;
  journeys: OnboardingJourney[];
}

export type StepDraft = Omit<OnboardingStep, 'id'> & { id?: string };

// The onboarding tables are newer than the generated types.
const table = (name: string) => supabase.from(name as never);

export function useOnboarding() {
  const { hubId } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['onboarding', hubId],
    queryFn: async () => {
      const [settings, steps, overview] = await Promise.all([
        table('onboarding_settings').select('enabled').eq('hub_id', hubId!).maybeSingle(),
        table('onboarding_steps').select('id, delay_days, subject, body, active, from_name, reply_to').eq('hub_id', hubId!)
          .order('delay_days').order('created_at'),
        untypedRpc('get_onboarding_overview'),
      ]);
      if (settings.error) throw settings.error;
      if (steps.error) throw steps.error;
      if (overview.error) throw overview.error;
      return {
        enabled: Boolean((settings.data as unknown as { enabled: boolean } | null)?.enabled),
        steps: (steps.data as unknown as OnboardingStep[]) || [],
        overview: (overview.data as Overview | null) ?? { step_stats: {}, journeys: [] },
      };
    },
    enabled: Boolean(hubId),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['onboarding'] });

  const setEnabled = async (enabled: boolean) => {
    const { error } = await table('onboarding_settings')
      .upsert({ hub_id: hubId, enabled, updated_at: new Date().toISOString() } as never, { onConflict: 'hub_id' });
    if (error) throw error;
    refetch();
  };

  const saveStep = async ({ id, ...fields }: StepDraft) => {
    const { error } = id
      ? await table('onboarding_steps').update(fields as never).eq('id', id)
      : await table('onboarding_steps').insert({ hub_id: hubId, ...fields } as never);
    if (error) throw error;
    refetch();
  };

  const removeStep = async (id: string) => {
    const { error } = await table('onboarding_steps').delete().eq('id', id);
    if (error) throw error;
    refetch();
  };

  const stopJourney = async (id: string) => {
    const { error } = await table('onboarding_journeys')
      .update({ status: 'stopped', stop_reason: 'stopped by an admin' } as never).eq('id', id);
    if (error) throw error;
    refetch();
  };

  const sendTest = async (step: Pick<OnboardingStep, 'subject' | 'body' | 'from_name' | 'reply_to'>) => {
    const res = await supabase.functions.invoke('send-onboarding-emails', { body: { action: 'test', ...step } });
    if (res.error) throw res.error;
    if (res.data?.error) throw new Error(res.data.error);
    return res.data as { sent_to: string };
  };

  return {
    data: {
      enabled: data?.enabled ?? false,
      steps: data?.steps ?? [],
      stepStats: data?.overview.step_stats ?? {},
      journeys: data?.overview.journeys ?? [],
    },
    loading, error, refetch, setEnabled, saveStep, removeStep, stopJourney, sendTest,
  };
}
