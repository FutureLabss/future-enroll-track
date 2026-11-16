import { describe, it, expect } from 'vitest';
import { buildCohortIcs, describePattern, foldLine } from '../../../supabase/functions/_shared/cohortInvite';
import { describeClassPattern } from '@/lib/classPattern';

const base = {
  cohortId: 'c1', sequence: 3, method: 'REQUEST' as const, title: 'Data Analysis · Cohort 6',
  firstDate: '2026-11-16', endDate: '2026-12-18', days: ['monday', 'wednesday', 'friday'],
  startTime: '10:00:00', endTime: '11:00:00', exdates: ['2026-12-25'],
  location: 'Lab 2, FutureLabs', meetingLink: null, organizerEmail: 'notifications@futurelabs.ng',
  organizerName: 'FutureLabs', attendeeEmail: 'ada@example.com', attendeeName: 'Ada Obi', now: new Date('2026-11-16T09:00:00Z'),
};
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('buildCohortIcs', () => {
  it('is one weekly recurring event in Lagos time, ending on the cohort end date', () => {
    const ics = unfold(buildCohortIcs(base));
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('UID:cohort-c1@futurelabs.ng');
    expect(ics).toContain('SEQUENCE:3');
    expect(ics).toContain('DTSTART;TZID=Africa/Lagos:20261116T100000');
    expect(ics).toContain('DTEND;TZID=Africa/Lagos:20261116T110000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261218T225959Z');
    expect(ics).toContain('EXDATE;TZID=Africa/Lagos:20261225T100000');
    expect(ics).toContain('LOCATION:Lab 2\\, FutureLabs');
    expect(ics).toContain('ATTENDEE;CN=Ada Obi;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:ada@example.com');
    expect(ics).toContain('TRIGGER:-PT30M');
  });

  it('uses CRLF line endings and folds long lines at 75 octets', () => {
    const ics = buildCohortIcs({ ...base, meetingLink: `https://meet.google.com/${'x'.repeat(120)}` });
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('cancels the same event when someone leaves', () => {
    const ics = buildCohortIcs({ ...base, method: 'CANCEL', sequence: 4 });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('UID:cohort-c1@futurelabs.ng');
    expect(ics).not.toContain('VALARM');
  });

  it('leaves out EXDATE when no class is skipped', () => {
    expect(buildCohortIcs({ ...base, exdates: [] })).not.toContain('EXDATE');
  });
});

describe('foldLine', () => {
  it('keeps short lines and never splits a multi-byte character', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short');
    const folded = foldLine(`SUMMARY:${'₦'.repeat(40)}`);
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'₦'.repeat(40)}`);
  });
});

describe('pattern labels', () => {
  it('reads like a timetable, in weekday order', () => {
    expect(describePattern(['friday', 'monday', 'wednesday'], '10:00:00', '11:00:00')).toBe('Mon, Wed & Fri, 10am–11am');
    expect(describeClassPattern(['friday', 'monday', 'wednesday'], '10:00:00', '11:00:00')).toBe('Mon, Wed & Fri, 10am–11am');
    expect(describeClassPattern(['saturday'], '13:30:00', '15:00:00')).toBe('Sat, 1:30pm–3pm');
    expect(describeClassPattern([], '10:00', '11:00')).toBeNull();
  });
});
