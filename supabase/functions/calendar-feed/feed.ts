export interface FeedEvent {
  uid: string;
  kind: string;
  title: string;
  description: string | null;
  location: string | null;
  url: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  status: string;
  updated_at: string | null;
}

const TZ = 'Africa/Lagos';

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// RFC 5545 §3.1: lines longer than 75 octets are folded with CRLF + space.
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    if (size + len > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += len;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// All-day events are stored as local midnight; Lagos is UTC+1 with no DST.
function localDate(iso: string): string {
  const local = new Date(new Date(iso).getTime() + 60 * 60 * 1000);
  return local.toISOString().slice(0, 10).replace(/-/g, '');
}

export function buildCalendarFeed(events: FeedEvent[], calendarName: string, now: Date = new Date()): string {
  const stamp = utcStamp(now.toISOString());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FutureLabs LMS//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    `X-WR-TIMEZONE:${TZ}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`);
    if (e.all_day) {
      lines.push(`DTSTART;VALUE=DATE:${localDate(e.starts_at)}`, `DTEND;VALUE=DATE:${localDate(e.ends_at)}`);
    } else {
      lines.push(`DTSTART:${utcStamp(e.starts_at)}`, `DTEND:${utcStamp(e.ends_at)}`);
    }
    lines.push(`SUMMARY:${escapeText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push(`STATUS:${e.status === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED'}`);
    lines.push(`CATEGORIES:${escapeText(e.kind)}`);
    if (e.updated_at) lines.push(`LAST-MODIFIED:${utcStamp(e.updated_at)}`);
    if (e.kind === 'class' && e.status !== 'CANCELLED') {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(e.title)}`, 'TRIGGER:-PT30M', 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// Calendar apps subscribe to ".../calendar-feed/<token>.ics"; browsers and the
// download button use "?token=<token>".
export function tokenFromUrl(url: string): string | null {
  const parsed = new URL(url);
  const fromQuery = parsed.searchParams.get('token');
  if (fromQuery) return fromQuery;
  const last = parsed.pathname.split('/').filter(Boolean).pop() ?? '';
  const match = last.match(/^([a-f0-9]{48})(?:\.ics)?$/i);
  return match ? match[1] : null;
}
