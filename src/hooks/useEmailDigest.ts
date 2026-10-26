import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { untypedRpc } from '@/lib/untypedRpc';
import { useAuth } from '@/hooks/useAuth';
import { nextDigestSlot } from '@/lib/digest';

export interface DigestSettings {
  enabled: boolean;
  include_contacts: boolean;
  contact_lists: string[];
  include_leads: boolean;
  excluded_lead_statuses: string[];
  staff_ids: string[];
}

export interface Digest {
  id: string;
  subject: string;
  body: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'skipped' | 'cancelled';
  scheduled_for: string | null;
  send_immediately: boolean;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  sent_at: string | null;
}

export interface DigestAudience {
  total: number;
  staff: number;
  contacts: number;
  leads: number;
  suppressed: number;
}

export const DEFAULT_DIGEST_SETTINGS: DigestSettings = {
  enabled: true,
  include_contacts: true,
  contact_lists: [],
  include_leads: true,
  excluded_lead_statuses: ['not_interested'],
  staff_ids: [],
};

// The digest tables are newer than the generated types.
const table = (name: string) => supabase.from(name as never);

export function useEmailDigest() {
  const { hubId } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['email-digest', hubId],
    queryFn: async () => {
      const [settings, digests] = await Promise.all([
        table('email_digest_settings').select('enabled, include_contacts, contact_lists, include_leads, excluded_lead_statuses, staff_ids').eq('hub_id', hubId!).maybeSingle(),
        table('email_digests').select('*').eq('hub_id', hubId!).order('created_at', { ascending: false }).limit(52),
      ]);
      if (settings.error) throw settings.error;
      if (digests.error) throw digests.error;
      return {
        settings: (settings.data as unknown as DigestSettings | null) ?? DEFAULT_DIGEST_SETTINGS,
        digests: (digests.data as unknown as Digest[]) || [],
      };
    },
    enabled: Boolean(hubId),
    refetchInterval: (query) =>
      (query.state.data as { digests: Digest[] } | undefined)?.digests.some(d => d.status === 'sending') ? 10_000 : false,
  });

  const { data: audience = null } = useQuery({
    queryKey: ['digest-audience', hubId, data?.settings],
    queryFn: async () => {
      const { data, error } = await untypedRpc('preview_digest_audience');
      if (error) throw error;
      return data as DigestAudience;
    },
    enabled: Boolean(hubId && data),
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['email-digest'] });
    queryClient.invalidateQueries({ queryKey: ['digest-audience'] });
  };

  const saveSettings = async (patch: Partial<DigestSettings>) => {
    const next = { ...(data?.settings ?? DEFAULT_DIGEST_SETTINGS), ...patch };
    const { error } = await table('email_digest_settings')
      .upsert({ hub_id: hubId, ...next, updated_at: new Date().toISOString() } as never, { onConflict: 'hub_id' });
    if (error) throw error;
    refetch();
  };

  // The issue being written: the newest one that hasn't gone out yet.
  const current = data?.digests.find(d => d.status === 'draft' || d.status === 'scheduled') ?? null;

  const saveDraft = async (subject: string, body: string): Promise<string> => {
    if (current) {
      const { error } = await table('email_digests').update({ subject, body } as never).eq('id', current.id);
      if (error) throw error;
      refetch();
      return current.id;
    }
    const { data: created, error } = await table('email_digests').insert({ subject, body } as never).select('id').single();
    if (error) throw error;
    refetch();
    return (created as unknown as { id: string }).id;
  };

  const schedule = async (id: string) => {
    const { error } = await table('email_digests')
      .update({ status: 'scheduled', scheduled_for: nextDigestSlot().toISOString(), send_immediately: false } as never)
      .eq('id', id);
    if (error) throw error;
    refetch();
  };

  const unschedule = async (id: string) => {
    const { error } = await table('email_digests')
      .update({ status: 'draft', scheduled_for: null, send_immediately: false } as never)
      .eq('id', id);
    if (error) throw error;
    refetch();
  };

  const sendNow = async (id: string) => {
    const { error } = await table('email_digests')
      .update({ status: 'scheduled', scheduled_for: new Date().toISOString(), send_immediately: true } as never)
      .eq('id', id);
    if (error) throw error;
    const run = await supabase.functions.invoke('send-weekly-digest', { body: { action: 'run' } });
    refetch();
    if (run.error) throw run.error;
    return run.data as { sent: number; failed: number };
  };

  const sendTest = async (subject: string, body: string) => {
    const res = await supabase.functions.invoke('send-weekly-digest', { body: { action: 'test', subject, body } });
    if (res.error) throw res.error;
    if (res.data?.error) throw new Error(res.data.error);
    return res.data as { sent_to: string };
  };

  const remove = async (id: string) => {
    const { error } = await table('email_digests').delete().eq('id', id);
    if (error) throw error;
    refetch();
  };

  return {
    data: { settings: data?.settings ?? DEFAULT_DIGEST_SETTINGS, digests: data?.digests ?? [], current, audience },
    loading, error, refetch, saveSettings, saveDraft, schedule, unschedule, sendNow, sendTest, remove,
  };
}
