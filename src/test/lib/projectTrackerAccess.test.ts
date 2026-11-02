import { beforeEach, expect, it, vi } from 'vitest';
import { createHandler } from '../../../supabase/functions/project-tracker-access/handler';

const userId = '00000000-0000-4000-8000-000000000001';
const deps = {
  allowedOrigins: ['https://admin.futurelabs.ng'],
  authorize: vi.fn(),
  change: vi.fn(),
  identity: vi.fn(),
  push: vi.fn(),
  recordSync: vi.fn(),
  log: vi.fn(),
};
const request = (body: unknown, { origin = deps.allowedOrigins[0], token = 'Bearer superadmin', method = 'POST' } = {}) =>
  new Request('https://lms.supabase.co/functions/v1/project-tracker-access', {
    method,
    headers: { Origin: origin, Authorization: token, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
const granted = {
  user_id: userId, full_name: 'Ada Obi', email: 'ada@futurelabs.ng',
  tracker_role: 'manager', active: true, version: '2026-10-30T10:00:00Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  deps.authorize.mockResolvedValue('ok');
  deps.change.mockResolvedValue(null);
  deps.identity.mockResolvedValue(granted);
  deps.push.mockResolvedValue(null);
  deps.recordSync.mockResolvedValue(undefined);
});

it('grants in the LMS as the caller, then pushes the identity and role to the Tracker', async () => {
  const response = await createHandler(deps)(request({ action: 'grant', user_id: userId, role: 'manager' }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ synced: true });
  expect(deps.change).toHaveBeenCalledWith('superadmin', 'grant', userId, 'manager');
  expect(deps.push).toHaveBeenCalledWith({
    user: { id: userId, name: 'Ada Obi', email: 'ada@futurelabs.ng', role: 'manager' }, active: true,
  });
  expect(deps.recordSync).toHaveBeenCalledWith(userId, granted.version, null);
});

it('pushes a revocation as inactive with no profile details', async () => {
  deps.identity.mockResolvedValue({ ...granted, active: false });
  await createHandler(deps)(request({ action: 'revoke', user_id: userId }));
  expect(deps.change).toHaveBeenCalledWith('superadmin', 'revoke', userId, undefined);
  expect(deps.push).toHaveBeenCalledWith({ user: { id: userId }, active: false });
});

it('retries a sync without changing the LMS', async () => {
  await createHandler(deps)(request({ action: 'sync', user_id: userId }));
  expect(deps.change).not.toHaveBeenCalled();
  expect(deps.push).toHaveBeenCalledOnce();
});

it('keeps the LMS change and records the error when the Tracker refuses or is down', async () => {
  deps.push.mockResolvedValueOnce('Cannot remove the last active administrator');
  const refused = await createHandler(deps)(request({ action: 'revoke', user_id: userId }));
  expect(await refused.json()).toEqual({ synced: false, error: 'Cannot remove the last active administrator' });
  expect(deps.recordSync).toHaveBeenCalledWith(userId, granted.version, 'Cannot remove the last active administrator');

  deps.push.mockRejectedValueOnce(new Error('timeout'));
  const down = await createHandler(deps)(request({ action: 'sync', user_id: userId }));
  expect(down.status).toBe(200);
  expect(await down.json()).toEqual({ synced: false, error: 'Project Tracker could not be reached' });
});

it('stops at an LMS rule violation without pushing', async () => {
  deps.change.mockResolvedValue('Only admin, staff or marketing accounts can be given Project Tracker access');
  const response = await createHandler(deps)(request({ action: 'grant', user_id: userId, role: 'member' }));
  expect(response.status).toBe(400);
  expect(deps.push).not.toHaveBeenCalled();
});

it('allows only the superadmin', async () => {
  deps.authorize.mockResolvedValue('forbidden');
  expect((await createHandler(deps)(request({ action: 'sync', user_id: userId }))).status).toBe(403);
  deps.authorize.mockResolvedValue('unauthenticated');
  expect((await createHandler(deps)(request({ action: 'sync', user_id: userId }))).status).toBe(401);
  expect((await createHandler(deps)(request({ action: 'sync', user_id: userId }, { token: '' }))).status).toBe(401);
  expect(deps.change).not.toHaveBeenCalled();
  expect(deps.push).not.toHaveBeenCalled();
});

it.each([
  { action: 'delete', user_id: userId },
  { action: 'grant', user_id: userId },
  { action: 'sync', user_id: 'not-a-uuid' },
])('rejects malformed requests %#', async body => {
  expect((await createHandler(deps)(request(body))).status).toBe(400);
  expect(deps.push).not.toHaveBeenCalled();
});

it('enforces the origin allowlist and answers preflight', async () => {
  expect((await createHandler(deps)(request({}, { origin: 'https://evil.example' }))).status).toBe(403);
  expect(deps.authorize).not.toHaveBeenCalled();
  expect((await createHandler(deps)(request({}, { method: 'OPTIONS' }))).status).toBe(204);
});
