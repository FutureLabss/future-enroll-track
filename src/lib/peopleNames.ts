import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// The classroom tables and get_classroom_students predate the generated types.
const db = supabase as unknown as SupabaseClient;

type NameFields = { full_name?: string | null; email?: string | null };

export interface PersonName {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

// profiles RLS lets only hub admins read other users' rows, so a tutor reading
// names straight from profiles gets nothing back and every row renders "—".
// Resolve from sources a classroom's staff can read instead: the classroom's
// students (get_classroom_students, SECURITY DEFINER), then its staff, then
// profiles for whoever is still missing (which still works for admins).
export async function fetchPeopleNames(
  userIds: string[],
  scope: { classroomId?: string | null; cohortId?: string | null },
): Promise<Map<string, PersonName>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const names = new Map<string, PersonName>();
  if (!ids.length) return names;

  const missing = () => ids.filter(id => !names.get(id)?.full_name);
  const add = (userId: string | null | undefined, fullName: string | null | undefined, email: string | null | undefined) => {
    if (!userId || !ids.includes(userId) || names.get(userId)?.full_name) return;
    names.set(userId, { user_id: userId, full_name: fullName || null, email: email || null });
  };

  let classroomId = scope.classroomId ?? null;
  if (!classroomId && scope.cohortId) {
    const { data: cohort } = await db.from('cohorts').select('classroom_id').eq('id', scope.cohortId).maybeSingle();
    classroomId = (cohort as { classroom_id: string | null } | null)?.classroom_id ?? null;
  }

  if (classroomId) {
    const { data: students } = await db.rpc('get_classroom_students', { p_classroom_id: classroomId });
    ((students || []) as (NameFields & { user_id: string | null; profiles?: NameFields | null })[]).forEach(s =>
      add(s.user_id, s.profiles?.full_name || s.full_name, s.profiles?.email || s.email));

    if (missing().length) {
      const { data: staffRows } = await db
        .from('classroom_staff')
        .select('user_id, staff(full_name, email)')
        .eq('classroom_id', classroomId)
        .in('user_id', missing());
      ((staffRows || []) as { user_id: string | null; staff: NameFields | null }[]).forEach(r => add(r.user_id, r.staff?.full_name, r.staff?.email));
    }
  }

  if (missing().length) {
    const { data: profiles } = await db.from('profiles').select('user_id, full_name, email').in('user_id', missing());
    ((profiles || []) as (NameFields & { user_id: string })[]).forEach(p => add(p.user_id, p.full_name, p.email));
  }

  return names;
}
