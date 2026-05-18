import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface Schedule {
  id: string;
  classroom_id: string;
  cohort_id: string | null;
  lesson_id: string | null;
  module_id: string | null;
  instructor_id: string | null;
  title: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  meeting_link: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  created_at: string;
  lessons?: { title: string; units?: { title: string } } | null;
  modules?: { title: string } | null;
  cohorts?: { cohort_label: string } | null;
  staff?: { full_name: string } | null;
}

export function useSchedules(classroomId: string) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!classroomId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('schedules')
      .select('*, lessons(title, units(title)), modules(title), cohorts(cohort_label), staff:instructor_id(full_name)')
      .eq('classroom_id', classroomId)
      .order('scheduled_date', { ascending: true })
      .order('start_time', { ascending: true });
    setSchedules((data as any[]) || []);
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
