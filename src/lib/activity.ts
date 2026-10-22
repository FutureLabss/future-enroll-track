export interface ActivityEvent {
  id: string;
  created_at: string;
  event_type: string;
  category: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  actor_id: string | null;
  actor_name: string | null;
  classroom_id: string | null;
  classroom_name: string | null;
  cohort_id: string | null;
  cohort_label: string | null;
  hub_id: string | null;
  hub_name: string | null;
}

export interface ClassroomActivity {
  classroom_id: string;
  classroom_name: string;
  total: number;
  held: number;
  cancelled: number;
  submissions: number;
  attendance: number;
  last_at: string;
}

export function filterActivity(events: ActivityEvent[], search: string): ActivityEvent[] {
  const q = search.trim().toLowerCase();
  if (!q) return events;
  return events.filter(e =>
    [e.summary, e.actor_name, e.classroom_name, e.cohort_label, e.hub_name]
      .some(v => v?.toLowerCase().includes(q)));
}

// Events arrive newest-first; groups keep that order. Keyed by the Lagos calendar
// day so a 23:30 WAT class doesn't land on the next UTC day.
export function groupActivityByDay(events: ActivityEvent[]): { day: string; events: ActivityEvent[] }[] {
  const groups = new Map<string, ActivityEvent[]>();
  for (const e of events) {
    const day = new Date(e.created_at).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(e);
  }
  return Array.from(groups, ([day, evs]) => ({ day, events: evs }));
}

export function activityByClassroom(events: ActivityEvent[]): ClassroomActivity[] {
  const rows = new Map<string, ClassroomActivity>();
  for (const e of events) {
    if (!e.classroom_id) continue;
    const row = rows.get(e.classroom_id) ?? {
      classroom_id: e.classroom_id,
      classroom_name: e.classroom_name || 'Classroom',
      total: 0, held: 0, cancelled: 0, submissions: 0, attendance: 0,
      last_at: e.created_at,
    };
    row.total += 1;
    if (e.event_type === 'session_completed') row.held += 1;
    if (e.event_type === 'session_cancelled') row.cancelled += 1;
    if (e.event_type === 'assignment_submitted') row.submissions += 1;
    if (e.event_type === 'attendance_closed') row.attendance += 1;
    if (e.created_at > row.last_at) row.last_at = e.created_at;
    rows.set(e.classroom_id, row);
  }
  return Array.from(rows.values()).sort((a, b) => b.total - a.total);
}

export function countOf(counts: { event_type: string; total: number }[], ...types: string[]): number {
  return counts.filter(c => types.includes(c.event_type)).reduce((sum, c) => sum + Number(c.total), 0);
}
