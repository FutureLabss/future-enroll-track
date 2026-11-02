import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import { createHandler, type TrackerIdentity } from './handler.ts';

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(createHandler({
  secret: Deno.env.get('PROJECT_TRACKER_REDEEM_SECRET') ?? '',
  trackerUrl: Deno.env.get('PROJECT_TRACKER_URL') ?? '',
  consume: async (codeHash, redirectUri) => {
    const { data, error } = await admin().rpc('consume_project_tracker_sso_code', {
      p_code_hash: codeHash, p_redirect_uri: redirectUri,
    });
    if (error) throw new Error('Consume failed');
    return (data as { user_id: string }[] | null)?.[0]?.user_id ?? null;
  },
  identity: async (userId) => {
    const { data, error } = await admin().rpc('project_tracker_identity', { p_user_id: userId }).maybeSingle();
    if (error) throw new Error('Identity lookup failed');
    return data as TrackerIdentity | null;
  },
  log: event => console.info(JSON.stringify({ ...event, timestamp: new Date().toISOString() })),
}));
