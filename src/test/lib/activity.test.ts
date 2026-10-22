import { describe, it, expect } from 'vitest';
import { activityByClassroom, countOf, filterActivity, groupActivityByDay, type ActivityEvent } from '@/lib/activity';

const base: ActivityEvent = {
  id: '1', created_at: '2026-10-22T09:00:00Z', event_type: 'session_completed', category: 'schedule',
  entity_type: 'schedule', entity_id: null, summary: 'Class held for Nov 2026', details: null,
  actor_id: null, actor_name: 'Tutor T', classroom_id: 'c1', classroom_name: 'Web Dev Room',
  cohort_id: null, cohort_label: 'Nov 2026', hub_id: 'h1', hub_name: 'FutureLabs',
};
const ev = (over: Partial<ActivityEvent>): ActivityEvent => ({ ...base, ...over });

describe('filterActivity', () => {
  const events = [ev({ id: '1' }), ev({ id: '2', summary: 'Payment', actor_name: 'Ada', classroom_name: null, cohort_label: null })];

  it('returns everything for a blank search', () => {
    expect(filterActivity(events, '  ')).toHaveLength(2);
  });

  it('matches summary, actor, classroom and cohort case-insensitively', () => {
    expect(filterActivity(events, 'ada').map(e => e.id)).toEqual(['2']);
    expect(filterActivity(events, 'web dev').map(e => e.id)).toEqual(['1']);
    expect(filterActivity(events, 'NOV 2026').map(e => e.id)).toEqual(['1']);
  });
});

describe('groupActivityByDay', () => {
  it('groups by the Lagos calendar day, keeping order', () => {
    const groups = groupActivityByDay([
      ev({ id: 'a', created_at: '2026-10-22T23:30:00Z' }), // 00:30 WAT on the 23rd
      ev({ id: 'b', created_at: '2026-10-22T10:00:00Z' }),
      ev({ id: 'c', created_at: '2026-10-21T10:00:00Z' }),
    ]);
    expect(groups.map(g => [g.day, g.events.map(e => e.id)])).toEqual([
      ['2026-10-23', ['a']],
      ['2026-10-22', ['b']],
      ['2026-10-21', ['c']],
    ]);
  });
});

describe('activityByClassroom', () => {
  it('tallies per classroom and skips events without one', () => {
    const rows = activityByClassroom([
      ev({ id: '1', event_type: 'session_completed', created_at: '2026-10-20T09:00:00Z' }),
      ev({ id: '2', event_type: 'session_cancelled', created_at: '2026-10-22T09:00:00Z' }),
      ev({ id: '3', event_type: 'assignment_submitted' }),
      ev({ id: '4', event_type: 'attendance_closed' }),
      ev({ id: '5', classroom_id: 'c2', classroom_name: 'Design' }),
      ev({ id: '6', classroom_id: null, event_type: 'payment_recorded' }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ classroom_id: 'c1', total: 4, held: 1, cancelled: 1, submissions: 1, attendance: 1, last_at: '2026-10-22T09:00:00Z' });
    expect(rows[1]).toMatchObject({ classroom_id: 'c2', total: 1 });
  });
});

describe('countOf', () => {
  it('sums the requested event types', () => {
    const counts = [
      { event_type: 'sessions_scheduled', total: 2 },
      { event_type: 'session_rescheduled', total: 3 },
      { event_type: 'payment_recorded', total: 9 },
    ];
    expect(countOf(counts, 'sessions_scheduled', 'session_rescheduled')).toBe(5);
    expect(countOf(counts, 'missing')).toBe(0);
  });
});
