import { beforeEach, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { createHandler } from '../../../supabase/functions/create-project-tracker-sso/handler';
const deps = {
  allowedOrigins: ['https://lms.example.com'],
  trackerUrl: 'https://tracker.example.com',
  authenticate: vi.fn(),
  hasAccess: vi.fn(),
  save: vi.fn(),
  log: vi.fn(),
};
const request = (origin = deps.allowedOrigins[0], token = 'Bearer valid', method = 'POST') =>
  new Request('https://lms.supabase.co/functions/v1/create-project-tracker-sso', {
    method, headers: { Origin: origin, Authorization: token },
    ...(method === 'POST' ? { body: JSON.stringify({ user_id: 'forged', redirect_uri: 'https://evil.example' }) } : {}),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('crypto', webcrypto);
  deps.authenticate.mockResolvedValue('verified-user');
  deps.hasAccess.mockResolvedValue(true);
  deps.save.mockResolvedValue({ expires_at: new Date(Date.now() + 90000).toISOString() });
});
it('creates random opaque codes, hashes storage, derives identity and binds callback', async () => {
  const handler = createHandler(deps);
  const response = await handler(request());
  const first = await response.json();
  const second = await (await handler(request())).json();
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(first.code).toMatch(/^[a-f0-9]{64}$/);
  expect(first.code).not.toBe(second.code);
  expect(Date.parse(first.expiresAt) - Date.now()).toBeLessThanOrEqual(90000);
  expect(deps.save).toHaveBeenNthCalledWith(1, {
    code_hash: createHash('sha256').update(first.code).digest('hex'),
    user_id: 'verified-user', redirect_uri: 'https://tracker.example.com/auth/callback',
  });
  expect(JSON.stringify(deps.log.mock.calls)).not.toContain(first.code);
  expect(JSON.stringify(deps.save.mock.calls)).not.toContain('Bearer valid');
});
it.each(['https://evil.example', '', 'null'])('denies disallowed origins %s', async origin => {
  const response = await createHandler(deps)(request(origin));
  expect(response.status).toBe(403);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  expect(deps.authenticate).not.toHaveBeenCalled();
});
it('rejects invalid auth without storing a code', async () => {
  deps.authenticate.mockResolvedValue(null);
  expect((await createHandler(deps)(request())).status).toBe(401);
  expect(deps.save).not.toHaveBeenCalled();
});
it('handles preflight and rejects non-POST', async () => {
  expect((await createHandler(deps)(request(undefined, '', 'OPTIONS'))).status).toBe(204);
  expect((await createHandler(deps)(request(undefined, '', 'GET'))).status).toBe(405);
  expect(deps.save).not.toHaveBeenCalled();
});
it('returns a generic error on storage failure', async () => {
  deps.save.mockRejectedValue(new Error('private detail'));
  const response = await createHandler(deps)(request());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('private detail');
});
it('fails closed with missing server configuration', async () => {
  expect((await createHandler({ ...deps, trackerUrl: '' })(request())).status).toBe(500);
  expect(deps.save).not.toHaveBeenCalled();
});
it('refuses people the superadmin has not granted access, without storing a code', async () => {
  deps.hasAccess.mockResolvedValue(false);
  const response = await createHandler(deps)(request());
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: 'no_access' });
  expect(deps.hasAccess).toHaveBeenCalledWith('verified-user');
  expect(deps.save).not.toHaveBeenCalled();
});
