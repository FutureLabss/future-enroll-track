import { beforeEach, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { createHandler } from '../../../supabase/functions/redeem-project-tracker-sso/handler';

const code = 'c'.repeat(64);
const userId = '00000000-0000-4000-8000-000000000001';
const deps = {
  secret: 'tracker-redeem-secret',
  trackerUrl: 'https://tracker.example.com',
  consume: vi.fn(),
  identity: vi.fn(),
  log: vi.fn(),
};
const request = (body: unknown = { code }, secret = deps.secret, method = 'POST') =>
  new Request('https://lms.supabase.co/functions/v1/redeem-project-tracker-sso', {
    method,
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  deps.consume.mockResolvedValue(userId);
  deps.identity.mockResolvedValue({
    user_id: userId, full_name: 'Ada Obi', email: 'ada@futurelabs.ng', tracker_role: 'manager', active: true,
  });
});

it('redeems a hashed code bound to the Tracker callback and returns the granted identity', async () => {
  const response = await createHandler(deps)(request());
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({
    success: true,
    user: { id: userId, name: 'Ada Obi', email: 'ada@futurelabs.ng', role: 'manager' },
  });
  expect(deps.consume).toHaveBeenCalledWith(
    createHash('sha256').update(code).digest('hex'),
    'https://tracker.example.com/auth/callback',
  );
  expect(JSON.stringify(deps.log.mock.calls)).not.toContain(code);
});

it.each([['revoked', { active: false, tracker_role: 'member' }], ['never granted', { active: false, tracker_role: null }]])(
  'answers no_access with the user id when %s',
  async (_case, access) => {
    deps.identity.mockResolvedValue({ user_id: userId, full_name: 'Ada', email: 'a@x.ng', ...access });
    const response = await createHandler(deps)(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'no_access', user: { id: userId } });
  },
);

it('rejects callers without the server secret before touching codes', async () => {
  expect((await createHandler(deps)(request({ code }, 'wrong'))).status).toBe(401);
  expect((await createHandler({ ...deps, secret: '' })(request({ code }, ''))).status).toBe(401);
  expect(deps.consume).not.toHaveBeenCalled();
});

it.each([{}, { code: 'short' }, { code: 'G'.repeat(64) }, '{', 'x'.repeat(5000)])('rejects malformed codes %#', async body => {
  expect((await createHandler(deps)(request(body))).status).toBe(400);
  expect(deps.consume).not.toHaveBeenCalled();
});

it('gives one generic answer for unknown, expired, replayed or wrong-callback codes', async () => {
  deps.consume.mockResolvedValue(null);
  const response = await createHandler(deps)(request());
  expect(response.status).toBe(410);
  expect(deps.identity).not.toHaveBeenCalled();
});

it('rejects other methods and hides storage failures', async () => {
  expect((await createHandler(deps)(request(undefined, deps.secret, 'GET'))).status).toBe(405);
  deps.consume.mockRejectedValue(new Error('private detail'));
  const response = await createHandler(deps)(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private detail');
});
