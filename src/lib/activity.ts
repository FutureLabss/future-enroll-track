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

// Computed from the source tables for the selected range (get_activity_stats),
// not from activity_events, which only exist from go-live onwards.
export interface ActivityStats {
  classes_held: number;
  classes_cancelled: number;
  attendance_sessions: number;
  check_ins: number;
  sessions_scheduled: number;
  submissions: number;
  assignments_published: number;
  enrollments: number;
  payments_count: number;
  payments_amount: number;
}

export interface ClassroomActivity {
  classroom_id: string;
  classroom_name: string;
  hub_name: string | null;
  classes_held: number;
  classes_cancelled: number;
  check_ins: number;
  submissions: number;
  last_activity_at: string | null;
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
