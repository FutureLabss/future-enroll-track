import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import { createHandler } from './handler.ts';

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(createHandler({
  allowedOrigins: (Deno.env.get('PROJECT_TRACKER_SSO_ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()),
  trackerUrl: Deno.env.get('PROJECT_TRACKER_URL') ?? '',
  authenticate: async (token) => {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  hasAccess: async (userId) => {
    const { data, error } = await admin().rpc('project_tracker_identity', { p_user_id: userId }).maybeSingle();
    if (error) throw new Error('Access lookup failed');
    return (data as { active?: boolean } | null)?.active === true;
  },
  save: async (row) => {
    const { data, error } = await admin().from('project_tracker_sso_codes').insert(row).select('expires_at').single();
    if (error || !data) throw new Error('Handoff persistence failed');
    return data;
  },
  log: event => console.info(JSON.stringify(event)),
}));
