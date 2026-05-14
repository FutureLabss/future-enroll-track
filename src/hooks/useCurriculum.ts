import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useCurriculum(classroomId: string) {
  const [curriculum, setCurriculum] = useState<any>(null);
  const [weeks, setWeeks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCurriculum = async () => {
    // For MVP, we assume 1 curriculum per classroom (or default first one)
    const { data: cur } = await supabase
      .from('curriculums')
      .select('*')
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (cur) {
      setCurriculum(cur);
      const { data: wks } = await supabase
        .from('curriculum_weeks')
        .select('*, curriculum_lessons(*)')
        .eq('curriculum_id', cur.id)
        .order('week_number', { ascending: true });
        
      // Order lessons within weeks
      const sortedWeeks = (wks || []).map(w => ({
        ...w,
        curriculum_lessons: (w.curriculum_lessons || []).sort((a: any, b: any) => a.lesson_order - b.lesson_order)
      }));
      setWeeks(sortedWeeks);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!classroomId) return;
    fetchCurriculum();
  }, [classroomId]);

  const createCurriculum = async (title: string, cohortId: string | null) => {
    const payload: Record<string, unknown> = { classroom_id: classroomId, title };
    if (cohortId) payload.cohort_id = cohortId;
    const { error } = await supabase.from('curriculums').insert(payload);
    if (error) throw error;
    await fetchCurriculum();
  };

  const addWeek = async (weekNumber: number, title: string, objectives: string) => {
    if (!curriculum) throw new Error("No curriculum found");
    const { error } = await supabase.from('curriculum_weeks').insert({
      curriculum_id: curriculum.id,
      week_number: weekNumber,
      title,
      objectives: objectives || null,
    });
    if (error) throw error;
    await fetchCurriculum();
  };

  const addLesson = async (weekId: string, title: string, objectives: string, order: number) => {
    const { error } = await supabase.from('curriculum_lessons').insert({
      curriculum_week_id: weekId,
      title,
      objectives: objectives || null,
      lesson_order: order,
    });
    if (error) throw error;
    await fetchCurriculum();
  };

  return { 
    curriculum, 
    weeks, 
    loading, 
    refetch: fetchCurriculum, 
    createCurriculum, 
    addWeek, 
    addLesson 
  };
}
