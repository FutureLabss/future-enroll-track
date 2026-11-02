import { sameSecret, sha256Hex } from '../_shared/projectTrackerCrypto.ts';

export interface TrackerIdentity {
  user_id: string;
  full_name: string;
  email: string;
  tracker_role: 'member' | 'manager' | 'admin' | null;
  active: boolean;
}

interface Dependencies {
  secret: string;
  trackerUrl: string;
  consume: (codeHash: string, redirectUri: string) => Promise<string | null>;
  identity: (userId: string) => Promise<TrackerIdentity | null>;
  log: (event: Record<string, string | boolean>) => void;
}

// Server-to-server only: the Tracker backend redeems a single-use code here and learns
// who the person is and whether the superadmin has granted them access, and as what.
export function createHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
    const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    try {
      const bearer = req.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
      if (!bearer || !(await sameSecret(bearer, deps.secret))) {
        deps.log({ event: 'project_tracker_redeem_unauthorized', success: false });
        return json({ error: 'Unauthorized' }, 401);
      }
      const raw = await req.text();
      if (raw.length > 4096) return json({ error: 'Invalid code' }, 400);
      let code: unknown;
      try {
        code = JSON.parse(raw)?.code;
      } catch {
        return json({ error: 'Invalid code' }, 400);
      }
      if (typeof code !== 'string' || !/^[a-f0-9]{64}$/.test(code)) return json({ error: 'Invalid code' }, 400);
      const userId = await deps.consume(await sha256Hex(code), new URL('/auth/callback', deps.trackerUrl).toString());
      if (!userId) {
        deps.log({ event: 'project_tracker_redeem_invalid', success: false });
        return json({ error: 'Invalid code' }, 410);
      }
      const person = await deps.identity(userId);
      if (!person?.active || !person.tracker_role) {
        deps.log({ event: 'project_tracker_redeem_no_access', user_id: userId, success: false });
        return json({ error: 'no_access', user: { id: userId } }, 403);
      }
      deps.log({ event: 'project_tracker_redeemed', user_id: userId, success: true });
      return json({
        success: true,
        user: { id: userId, name: person.full_name, email: person.email, role: person.tracker_role },
      }, 200);
    } catch {
      deps.log({ event: 'project_tracker_redeem_failed', success: false });
      return json({ error: 'Unavailable' }, 503);
    }
  };
}
