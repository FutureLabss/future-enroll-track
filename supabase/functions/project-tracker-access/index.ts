import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';
import { createHandler, type AccessIdentity } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const asCaller = (token: string) => createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
  global: { headers: { Authorization: `Bearer ${token}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});
const admin = () => createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(createHandler({
  allowedOrigins: (Deno.env.get('PROJECT_TRACKER_SSO_ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()),
  authorize: async (token) => {
    const client = asCaller(token);
    const { data: user, error } = await client.auth.getUser(token);
    if (error || !user.user) return 'unauthenticated';
    const { data: isSuperadmin } = await client.rpc('is_superadmin');
    return isSuperadmin === true ? 'ok' : 'forbidden';
  },
  change: async (token, action, userId, role) => {
    const { error } = action === 'grant'
      ? await asCaller(token).rpc('set_project_tracker_access', { p_user_id: userId, p_role: role })
      : await asCaller(token).rpc('revoke_project_tracker_access', { p_user_id: userId });
    return error?.message ?? null;
  },
  identity: async (userId) => {
    const { data, error } = await admin().rpc('project_tracker_identity', { p_user_id: userId }).maybeSingle();
    if (error) throw new Error('Identity lookup failed');
    return data as AccessIdentity | null;
  },
  push: async (body) => {
    const response = await fetch(Deno.env.get('PROJECT_TRACKER_SYNC_URL')!, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('PROJECT_TRACKER_SYNC_SECRET')}`,
      },
      body: JSON.stringify(body),
    });
    if (response.ok) return null;
    const reply = await response.json().catch(() => null);
    // 409 carries a Tracker business rule (e.g. last administrator), worth showing as-is.
    return response.status === 409 && typeof reply?.error === 'string'
      ? reply.error
      : `Project Tracker rejected the update (HTTP ${response.status})`;
  },
  recordSync: async (userId, version, error) => {
    await admin().rpc('record_project_tracker_sync', { p_user_id: userId, p_version: version, p_error: error });
  },
  log: event => console.info(JSON.stringify({ ...event, timestamp: new Date().toISOString() })),
}));
