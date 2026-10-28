import { describe, it, expect } from 'vitest';
import { describeRisk, whatsappLink } from '@/lib/risk';

describe('describeRisk', () => {
  it('names the two missed classes oldest first', () => {
    const text = describeRisk({ reason: 'missed_classes', detail: { sessions: [
      { id: 'b', at: '2026-10-22T12:00:00Z' }, { id: 'a', at: '2026-10-20T12:00:00Z' },
    ] } });
    expect(text).toMatch(/^Missed the last two classes \(20 Oct, 22 Oct\)$/);
  });

  it('names a single overdue assignment, counts several', () => {
    expect(describeRisk({ reason: 'missing_assignment', detail: { assignments: [{ id: '1', title: 'Loops', due: '2026-10-25T23:00:00Z' }] } }))
      .toBe("Hasn't submitted “Loops” (due 26 Oct)");
    expect(describeRisk({ reason: 'missing_assignment', detail: { assignments: [
      { id: '1', title: 'A', due: '2026-10-25T10:00:00Z' }, { id: '2', title: 'B', due: '2026-10-20T10:00:00Z' },
    ] } })).toBe("Hasn't submitted 2 overdue assignments");
  });
});

describe('whatsappLink', () => {
  it('turns Nigerian formats into wa.me international numbers', () => {
    expect(whatsappLink('0803 123 4567')).toBe('https://wa.me/2348031234567');
    expect(whatsappLink('+234 803 123 4567')).toBe('https://wa.me/2348031234567');
    expect(whatsappLink('8031234567')).toBe('https://wa.me/2348031234567');
    expect(whatsappLink('\t08031234567 ')).toBe('https://wa.me/2348031234567');
  });

  it('gives up on missing or short numbers', () => {
    expect(whatsappLink(null)).toBeNull();
    expect(whatsappLink('12345')).toBeNull();
  });
});
