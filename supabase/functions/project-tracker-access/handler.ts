export type AccessAction = 'grant' | 'revoke' | 'sync';

export interface AccessIdentity {
  user_id: string;
  full_name: string;
  email: string;
  tracker_role: 'member' | 'manager' | 'admin' | null;
  active: boolean;
  version: string | null;
}

export type TrackerPush =
  | { user: { id: string; name: string; email: string; role: string }; active: true }
  | { user: { id: string }; active: false };

interface Dependencies {
  allowedOrigins: string[];
  authorize: (token: string) => Promise<'ok' | 'unauthenticated' | 'forbidden'>;
  // Runs as the caller, so the database re-checks the superadmin and writes the audit log.
  change: (token: string, action: 'grant' | 'revoke', userId: string, role?: string) => Promise<string | null>;
  identity: (userId: string) => Promise<AccessIdentity | null>;
  push: (body: TrackerPush) => Promise<string | null>;
  recordSync: (userId: string, version: string, error: string | null) => Promise<void>;
  log: (event: Record<string, string | boolean>) => void;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('Origin') ?? '';
    const allowed = deps.allowedOrigins.includes(origin) && origin !== '' && origin !== 'null';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
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
      const token = req.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
      const caller = token ? await deps.authorize(token) : 'unauthenticated';
      if (caller === 'unauthenticated') return json({ error: 'Unauthorized' }, 401);
      if (caller === 'forbidden') return json({ error: 'Only the superadmin can manage Project Tracker access' }, 403);

      const body = await req.json().catch(() => null) as { action?: unknown; user_id?: unknown; role?: unknown } | null;
      const action = body?.action;
      const userId = body?.user_id;
      if (!['grant', 'revoke', 'sync'].includes(action as string) || typeof userId !== 'string' || !uuid.test(userId) ||
          (action === 'grant' && typeof body?.role !== 'string')) {
        return json({ error: 'Invalid request' }, 400);
      }
      if (action !== 'sync') {
        const failure = await deps.change(token!, action as 'grant' | 'revoke', userId, body?.role as string | undefined);
        if (failure) return json({ error: failure }, 400);
      }

      const person = await deps.identity(userId);
      if (!person) return json({ error: 'User not found' }, 404);
      const pushed: TrackerPush = person.active && person.tracker_role
        ? { user: { id: userId, name: person.full_name, email: person.email, role: person.tracker_role }, active: true }
        : { user: { id: userId }, active: false };
      // The LMS change stands even if the Tracker is unreachable; the page offers a retry.
      const error = await deps.push(pushed).catch(() => 'Project Tracker could not be reached');
      if (person.version) await deps.recordSync(userId, person.version, error);
      deps.log({ event: 'project_tracker_access_pushed', user_id: userId, active: pushed.active, success: !error });
      return json(error ? { synced: false, error } : { synced: true }, 200);
    } catch {
      deps.log({ event: 'project_tracker_access_failed', success: false });
      return json({ error: 'Unable to update Project Tracker access' }, 500);
    }
  };
}
