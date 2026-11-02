import { sha256Hex } from '../_shared/projectTrackerCrypto.ts';

interface Dependencies {
  allowedOrigins: string[];
  trackerUrl: string;
  authenticate: (token: string) => Promise<string | null>;
  hasAccess: (userId: string) => Promise<boolean>;
  save: (row: { code_hash: string; user_id: string; redirect_uri: string }) => Promise<{ expires_at: string }>;
  log: (event: Record<string, string | boolean>) => void;
}

export function createHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('Origin') ?? '';
    const allowed = deps.allowedOrigins.includes(origin) && origin !== '' && origin !== 'null';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', Vary: 'Origin',
      ...(allowed ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      } : {}),
    };
    const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers });
    if (!allowed) return json({ error: 'Origin not allowed' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    try {
      const tracker = new URL(deps.trackerUrl);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(tracker.hostname);
      if ((tracker.protocol !== 'https:' && !(local && tracker.protocol === 'http:')) ||
          tracker.username || tracker.password || tracker.search || tracker.hash || tracker.pathname !== '/') {
        throw new Error('Invalid configuration');
      }
      const token = req.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
      const userId = token ? await deps.authenticate(token) : null;
      if (!userId) {
        deps.log({ event: 'project_tracker_sso_rejected', success: false, timestamp: new Date().toISOString() });
        return json({ error: 'Unauthorized' }, 401);
      }
      if (!(await deps.hasAccess(userId))) {
        deps.log({ event: 'project_tracker_sso_no_access', user_id: userId, success: false, timestamp: new Date().toISOString() });
        return json({ error: 'no_access' }, 403);
      }
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const code = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      const code_hash = await sha256Hex(code);
      const row = await deps.save({ code_hash, user_id: userId, redirect_uri: new URL('/auth/callback', tracker).toString() });
      deps.log({ event: 'project_tracker_sso_created', user_id: userId, timestamp: new Date().toISOString(), success: true });
      return json({ code, expiresAt: row.expires_at }, 200);
    } catch {
      deps.log({ event: 'project_tracker_sso_failed', timestamp: new Date().toISOString(), success: false });
      return json({ error: 'Unable to create handoff' }, 500);
    }
  };
}
