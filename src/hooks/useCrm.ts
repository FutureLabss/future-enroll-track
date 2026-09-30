import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type Lead = { id: string; full_name: string; email: string | null; phone: string | null; lifecycle_status: string; qualification: 'cold' | 'warm' | 'hot'; score: number; marketing_consent: boolean; next_follow_up_at: string | null; owner_id: string | null; source_id: string | null; lead_sources?: { name: string } | null; created_at: string };

export function useCrmLeads() {
  const [data, setData] = useState<Lead[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const refetch = useCallback(async () => { setLoading(true); const result = await (supabase.from('crm_leads' as any) as any).select('*,lead_sources(name)').order('created_at', { ascending: false }); setData(result.data || []); setError(result.error?.message || null); setLoading(false); }, []);
  useEffect(() => { refetch(); }, [refetch]);
  return { data, loading, error, refetch };
}

export async function createLead(input: { full_name: string; email?: string; phone?: string; source?: string; marketing_consent?: boolean; qualification?: 'cold' | 'warm' | 'hot' | 'automatic' }) {
  return (supabase.rpc as any)('upsert_crm_lead', { p_full_name: input.full_name, p_email: input.email || null, p_phone: input.phone || null, p_source_slug: input.source || 'manual', p_marketing_consent: !!input.marketing_consent, p_metadata: {}, p_qualification: input.qualification && input.qualification !== 'automatic' ? input.qualification : null });
}
export async function seedCrmDefaults() { return (supabase.rpc as any)('seed_crm_defaults'); }
