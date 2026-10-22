import { describe, it, expect } from 'vitest';
import { buildCalendarFeed, tokenFromUrl, type FeedEvent } from '../../../supabase/functions/calendar-feed/feed';

const CLASS: FeedEvent = {
  uid: 'schedule-1@futurelabs',
  kind: 'class',
  title: 'HTML, CSS; and you · Nov 2026',
  description: 'Web Dev Room — Nov 2026\nJoin online: https://meet.example/abc',
  location: 'Uyo HQ',
  url: 'https://meet.example/abc',
  starts_at: '2026-11-05T09:00:00+00:00',
  ends_at: '2026-11-05T11:00:00+00:00',
  all_day: false,
  status: 'CONFIRMED',
  updated_at: '2026-10-22T08:00:00+00:00',
};

const lines = (ics: string) => ics.split('\r\n');

describe('buildCalendarFeed', () => {
  const now = new Date('2026-10-22T12:00:00Z');

  it('wraps events in a named, refreshing calendar', () => {
    const out = lines(buildCalendarFeed([CLASS], 'FutureLabs Classes', now));
    expect(out[0]).toBe('BEGIN:VCALENDAR');
    expect(out).toContain('X-WR-CALNAME:FutureLabs Classes');
    expect(out).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H');
    expect(out.filter(l => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(out.at(-2)).toBe('END:VCALENDAR');
  });

  it('keeps a stable UID so calendar apps update events instead of duplicating them', () => {
    expect(lines(buildCalendarFeed([CLASS], 'x', now))).toContain('UID:schedule-1@futurelabs');
  });

  it('writes timed events in UTC', () => {
    const out = lines(buildCalendarFeed([CLASS], 'x', now));
    expect(out).toContain('DTSTART:20261105T090000Z');
    expect(out).toContain('DTEND:20261105T110000Z');
    expect(out).toContain('DTSTAMP:20261022T120000Z');
  });

  it('escapes commas, semicolons and newlines in text', () => {
    const out = lines(buildCalendarFeed([CLASS], 'x', now));
    expect(out).toContain('SUMMARY:HTML\\, CSS\\; and you · Nov 2026');
    expect(out.find(l => l.startsWith('DESCRIPTION:Web'))).toContain('\\n');
  });

  it('writes all-day events as Lagos-local dates', () => {
    const allDay: FeedEvent = { ...CLASS, kind: 'cohort', all_day: true, starts_at: '2026-10-18T23:00:00+00:00', ends_at: '2026-10-19T23:00:00+00:00' };
    const out = lines(buildCalendarFeed([allDay], 'x', now));
    expect(out).toContain('DTSTART;VALUE=DATE:20261019');
    expect(out).toContain('DTEND;VALUE=DATE:20261020');
  });

  it('marks cancelled classes cancelled and drops their reminder', () => {
    const out = lines(buildCalendarFeed([{ ...CLASS, status: 'CANCELLED' }], 'x', now));
    expect(out).toContain('STATUS:CANCELLED');
    expect(out).not.toContain('BEGIN:VALARM');
  });

  it('adds a 30-minute reminder to live classes', () => {
    const out = lines(buildCalendarFeed([CLASS], 'x', now));
    expect(out).toContain('TRIGGER:-PT30M');
  });

  it('folds lines longer than 75 octets', () => {
    const long: FeedEvent = { ...CLASS, description: 'x'.repeat(200) };
    const out = lines(buildCalendarFeed([long], 'x', now));
    expect(out.every(l => new TextEncoder().encode(l).length <= 75)).toBe(true);
    const start = out.findIndex(l => l.startsWith('DESCRIPTION:'));
    expect(out[start + 1].startsWith(' ')).toBe(true);
  });
});

describe('tokenFromUrl', () => {
  const token = 'a'.repeat(48);

  it('reads ?token=', () => {
    expect(tokenFromUrl(`https://x.supabase.co/functions/v1/calendar-feed?token=${token}`)).toBe(token);
  });

  it('reads a /<token>.ics path', () => {
    expect(tokenFromUrl(`https://x.supabase.co/functions/v1/calendar-feed/${token}.ics`)).toBe(token);
  });

  it('rejects anything else', () => {
    expect(tokenFromUrl('https://x.supabase.co/functions/v1/calendar-feed')).toBeNull();
    expect(tokenFromUrl('https://x.supabase.co/functions/v1/calendar-feed/../../etc.ics')).toBeNull();
  });
});
