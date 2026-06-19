import { describe, it, expect } from 'vitest';
import { buildICSContent } from '@/lib/ics';

const BASE_EVENT = {
  title: 'Intro to Variables',
  date: '2026-09-15',
  startTime: '09:00',
  endTime: '11:00',
};

function parseLines(content: string) {
  return content.split('\r\n');
}

describe('buildICSContent', () => {
  it('uses CRLF line endings throughout', () => {
    const content = buildICSContent(BASE_EVENT);
    expect(content).toContain('\r\n');
    expect(content.split('\r\n').length).toBeGreaterThan(5);
  });

  it('wraps in VCALENDAR and VEVENT', () => {
    const lines = parseLines(buildICSContent(BASE_EVENT));
    expect(lines).toContain('BEGIN:VCALENDAR');
    expect(lines).toContain('END:VCALENDAR');
    expect(lines).toContain('BEGIN:VEVENT');
    expect(lines).toContain('END:VEVENT');
  });

  it('sets the correct DTSTART', () => {
    const lines = parseLines(buildICSContent(BASE_EVENT));
    expect(lines).toContain('DTSTART:20260915T090000');
  });

  it('sets the correct DTEND', () => {
    const lines = parseLines(buildICSContent(BASE_EVENT));
    expect(lines).toContain('DTEND:20260915T110000');
  });

  it('sets SUMMARY to the event title', () => {
    const lines = parseLines(buildICSContent(BASE_EVENT));
    expect(lines).toContain('SUMMARY:Intro to Variables');
  });

  it('includes a UID line', () => {
    const lines = parseLines(buildICSContent(BASE_EVENT));
    const uidLine = lines.find(l => l.startsWith('UID:'));
    expect(uidLine).toBeDefined();
    expect(uidLine).toContain('@futurelabs-lms');
  });

  it('includes a DTSTAMP line', () => {
    const lines = parseLines(buildICSContent(BASE_EVENT));
    const stampLine = lines.find(l => l.startsWith('DTSTAMP:'));
    expect(stampLine).toBeDefined();
    expect(stampLine).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });

  it('includes LOCATION when provided', () => {
    const lines = parseLines(buildICSContent({ ...BASE_EVENT, location: '14 Victoria Street' }));
    expect(lines).toContain('LOCATION:14 Victoria Street');
  });

  it('omits LOCATION line when null', () => {
    const lines = parseLines(buildICSContent({ ...BASE_EVENT, location: null }));
    expect(lines.some(l => l.startsWith('LOCATION:'))).toBe(false);
  });

  it('omits LOCATION line when undefined', () => {
    const lines = parseLines(buildICSContent(BASE_EVENT));
    expect(lines.some(l => l.startsWith('LOCATION:'))).toBe(false);
  });

  it('includes DESCRIPTION when provided', () => {
    const lines = parseLines(buildICSContent({ ...BASE_EVENT, description: 'Join online: https://meet.google.com/abc' }));
    expect(lines.some(l => l.startsWith('DESCRIPTION:'))).toBe(true);
  });

  it('omits DESCRIPTION line when null', () => {
    const lines = parseLines(buildICSContent({ ...BASE_EVENT, description: null }));
    expect(lines.some(l => l.startsWith('DESCRIPTION:'))).toBe(false);
  });

  it('generates a unique UID on every call', () => {
    const uid1 = parseLines(buildICSContent(BASE_EVENT)).find(l => l.startsWith('UID:'));
    const uid2 = parseLines(buildICSContent(BASE_EVENT)).find(l => l.startsWith('UID:'));
    expect(uid1).not.toBe(uid2);
  });

  it('handles midnight times correctly', () => {
    const lines = parseLines(buildICSContent({ ...BASE_EVENT, startTime: '00:00', endTime: '01:30' }));
    expect(lines).toContain('DTSTART:20260915T000000');
    expect(lines).toContain('DTEND:20260915T013000');
  });

  it('handles single-digit months and days', () => {
    const lines = parseLines(buildICSContent({ ...BASE_EVENT, date: '2026-01-05' }));
    expect(lines).toContain('DTSTART:20260105T090000');
  });
});
