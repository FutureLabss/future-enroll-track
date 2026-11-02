export const PROJECT_TRACKER_URL = import.meta.env.VITE_PROJECT_TRACKER_URL;

// Validate on launch so integration configuration cannot break LMS login.
export function projectTrackerCallback(value = PROJECT_TRACKER_URL): URL {
  if (!value?.trim()) throw new Error('Project Tracker is not configured.');
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(import.meta.env.DEV && local && url.protocol === 'http:')) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Invalid Project Tracker configuration.');
  }
  return new URL('/auth/callback', url);
}
