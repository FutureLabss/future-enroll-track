import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface Schedule {
  id: string;
  classroom_id: string;
  cohort_id: string | null;
  lesson_id: string | null;
  module_id: string | null;
  unit_id: string | null;
  instructor_id: string | null;
  title: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  meeting_link: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  created_at: string;
  lessons?: { title: string; units?: { title: string } | null } | null;
  modules?: { title: string } | null;
  cohorts?: { cohort_label: string } | null;
  staff?: { full_name: string } | null;
}

export const SCHEDULE_COLUMNS = 'id, classroom_id, cohort_id, lesson_id, module_id, instructor_id, title, scheduled_date, start_time, end_time, location, meeting_link, status, created_at';

export async function enrichSchedules(rows: any[]): Promise<Schedule[]> {
  if (!rows.length) return [];

  const lessonIds = Array.from(new Set(rows.map((row) => row.lesson_id).filter(Boolean)));
  const moduleIds = Array.from(new Set(rows.map((row) => row.module_id).filter(Boolean)));
  const cohortIds = Array.from(new Set(rows.map((row) => row.cohort_id).filter(Boolean)));
  const instructorIds = Array.from(new Set(rows.map((row) => row.instructor_id).filter(Boolean)));

  const [lessonRes, moduleRes, cohortRes, staffRes] = await Promise.all([
    lessonIds.length
      ? supabase.from('lessons').select('id, title, unit_id').in('id', lessonIds)
      : Promise.resolve({ data: [], error: null }),
    moduleIds.length
      ? supabase.from('modules').select('id, title').in('id', moduleIds)
      : Promise.resolve({ data: [], error: null }),
    cohortIds.length
      ? supabase.from('cohorts').select('id, cohort_label').in('id', cohortIds)
      : Promise.resolve({ data: [], error: null }),
    instructorIds.length
      ? supabase.from('staff').select('id, full_name').in('id', instructorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const unitIds = Array.from(new Set(((lessonRes.data || []) as any[]).map((lesson) => lesson.unit_id).filter(Boolean)));
  const unitRes = unitIds.length
    ? await supabase.from('units').select('id, title').in('id', unitIds)
    : { data: [], error: null };

  const lessonsById = new Map(((lessonRes.data || []) as any[]).map((lesson) => [lesson.id, lesson]));
  const unitsById = new Map(((unitRes.data || []) as any[]).map((unit) => [unit.id, unit]));
  const modulesById = new Map(((moduleRes.data || []) as any[]).map((module) => [module.id, module]));
  const cohortsById = new Map(((cohortRes.data || []) as any[]).map((cohort) => [cohort.id, cohort]));
  const staffById = new Map(((staffRes.data || []) as any[]).map((staff) => [staff.id, staff]));

  return rows.map((row) => {
    const lesson = row.lesson_id ? lessonsById.get(row.lesson_id) : null;
    return {
      ...row,
      lessons: lesson
        ? { title: lesson.title, units: lesson.unit_id ? unitsById.get(lesson.unit_id) || null : null }
        : null,
      modules: row.module_id ? modulesById.get(row.module_id) || null : null,
      cohorts: row.cohort_id ? cohortsById.get(row.cohort_id) || null : null,
      staff: row.instructor_id ? staffById.get(row.instructor_id) || null : null,
    };
  });
}

export function useSchedules(classroomId: string) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!classroomId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('schedules')
      .select(SCHEDULE_COLUMNS)
      .eq('classroom_id', classroomId)
      .order('scheduled_date', { ascending: true })
      .order('start_time', { ascending: true });
    if (error) {
      toast.error(`Could not load schedule: ${error.message}`);
      setSchedules([]);
      setLoading(false);
      return;
    }
    setSchedules(await enrichSchedules(data || []));
    setLoading(false);
  }, [classroomId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createSchedule = async (payload: {
    title?: string | null;
    lesson_id?: string | null;
    module_id?: string | null;
    cohort_id?: string | null;
    instructor_id?: string | null;
    scheduled_date: string;
    start_time: string;
    end_time: string;
    location?: string;
    meeting_link?: string;
  }) => {
    const { error } = await supabase.from('schedules').insert({ ...payload, classroom_id: classroomId, status: 'scheduled' });
    if (error) throw error;
    await fetchAll();
  };

  const updateSchedule = async (id: string, patch: Partial<Omit<Schedule, 'id' | 'classroom_id' | 'created_at'>>) => {
    const { error } = await supabase.from('schedules').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  const deleteSchedule = async (id: string) => {
    const { error } = await supabase.from('schedules').delete().eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  return { schedules, loading, refetch: fetchAll, createSchedule, updateSchedule, deleteSchedule };
}
