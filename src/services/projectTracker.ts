import { supabase } from '@/lib/supabase';
import { projectTrackerCallback } from '@/config/projectTracker';

export class TrackerAuthenticationError extends Error {}
export class TrackerAccessError extends Error {}

export async function launchProjectTracker(redirect = (url: string) => window.location.assign(url)) {
  const callback = projectTrackerCallback();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new TrackerAuthenticationError();
  let session = data.session;
  if (!session.expires_at || session.expires_at * 1000 <= Date.now() + 30_000) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) throw new TrackerAuthenticationError();
    session = refreshed.data.session;
  }
  const result = await supabase.functions.invoke('create-project-tracker-sso', {
    body: {},
    headers: { Authorization: 'Bearer ' + session.access_token },
  });
  if (result.error) {
    if (result.error.context?.status === 401) throw new TrackerAuthenticationError();
    if (result.error.context?.status === 403) throw new TrackerAccessError();
    throw new Error('Unable to open Project Tracker. Please try again.');
  }
  const handoff: unknown = result.data;
  if (!handoff || typeof handoff !== 'object' || !('code' in handoff) ||
      typeof handoff.code !== 'string' || !/^[a-f0-9]{64}$/.test(handoff.code) ||
      !('expiresAt' in handoff) || typeof handoff.expiresAt !== 'string' ||
      !(Date.parse(handoff.expiresAt) > Date.now())) {
    throw new Error('Invalid handoff response.');
  }
  const current = await supabase.auth.getSession();
  if (current.error || current.data.session?.user.id !== session.user.id) throw new TrackerAuthenticationError();
  callback.searchParams.set('code', handoff.code);
  redirect(callback.toString());
}
