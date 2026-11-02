import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), invoke: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: mocks, functions: { invoke: mocks.invoke } } }));
vi.stubEnv('VITE_PROJECT_TRACKER_URL', 'https://tracker.example.com');
const { launchProjectTracker, TrackerAccessError, TrackerAuthenticationError } = await import('@/services/projectTracker');

const session = { user: { id: 'user-1' }, access_token: 'private-access', refresh_token: 'private-refresh', expires_at: Date.now() / 1000 + 3600 };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('VITE_PROJECT_TRACKER_URL', 'https://tracker.example.com');
  mocks.getSession.mockResolvedValue({ data: { session }, error: null });
  mocks.invoke.mockResolvedValue({ data: { code: 'a'.repeat(64), expiresAt: new Date(Date.now() + 90000).toISOString() }, error: null });
});
describe('tracker launch', () => {
  it('redirects with only an opaque code and sends authorization to the function', async () => {
    const redirect = vi.fn();
    await launchProjectTracker(redirect);
    expect(redirect).toHaveBeenCalledWith('https://tracker.example.com/auth/callback?code=' + 'a'.repeat(64));
    expect(mocks.invoke).toHaveBeenCalledWith('create-project-tracker-sso', { body: {}, headers: { Authorization: 'Bearer private-access' } });
  });
  it('does not create a handoff without a session', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(launchProjectTracker(vi.fn())).rejects.toBeInstanceOf(TrackerAuthenticationError);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('refreshes an expired session', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: { ...session, expires_at: 1 } }, error: null });
    mocks.refreshSession.mockResolvedValue({ data: { session }, error: null });
    await launchProjectTracker(vi.fn());
    expect(mocks.refreshSession).toHaveBeenCalledOnce();
  });
  it('rejects a failed refresh', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { ...session, expires_at: 1 } }, error: null });
    mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: new Error() });
    await expect(launchProjectTracker(vi.fn())).rejects.toBeInstanceOf(TrackerAuthenticationError);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it.each([new Error('network'), { context: { status: 401 } }])('does not redirect on endpoint failure', async error => {
    mocks.invoke.mockResolvedValue({ data: null, error });
    const redirect = vi.fn();
    await expect(launchProjectTracker(redirect)).rejects.toThrow();
    expect(redirect).not.toHaveBeenCalled();
  });
  it('reports missing Project Tracker access separately', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: { status: 403 } } });
    const redirect = vi.fn();
    await expect(launchProjectTracker(redirect)).rejects.toBeInstanceOf(TrackerAccessError);
    expect(redirect).not.toHaveBeenCalled();
  });
  it('rejects malformed handoffs', async () => {
    mocks.invoke.mockResolvedValue({ data: { code: session.access_token, expiresAt: 'invalid' }, error: null });
    const redirect = vi.fn();
    await expect(launchProjectTracker(redirect)).rejects.toThrow();
    expect(redirect).not.toHaveBeenCalled();
  });
  it('cancels navigation after logout', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session }, error: null }).mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(launchProjectTracker(vi.fn())).rejects.toBeInstanceOf(TrackerAuthenticationError);
  });
});
