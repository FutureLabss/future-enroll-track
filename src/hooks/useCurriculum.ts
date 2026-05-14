import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useCurriculum(cohortId: string) {
  const [curriculum, setCurriculum] = useState<any>(null);
  const [weeks, setWeeks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCurriculum = async () => {
    if (!cohortId) { setLoading(false); return; }

    const { data: cur } = await supabase
      .from('curriculums')
      .select('*')
      .eq('cohort_id', cohortId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cur) {
      setCurriculum(cur);
      const { data: wks } = await supabase
        .from('curriculum_weeks')
        .select('*, curriculum_lessons(*, lesson_materials(*))')
        .eq('curriculum_id', cur.id)
        .order('week_number', { ascending: true });

      setWeeks(
        (wks || []).map(w => ({
          ...w,
          curriculum_lessons: (w.curriculum_lessons || []).sort(
            (a: any, b: any) => a.lesson_order - b.lesson_order
          ),
        }))
      );
    } else {
      setCurriculum(null);
      setWeeks([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!cohortId) { setLoading(false); return; }
    setLoading(true);
    fetchCurriculum();
  }, [cohortId]);

  const createCurriculum = async (title: string) => {
    const { data: cohort } = await supabase
      .from('cohorts')
      .select('classroom_id')
      .eq('id', cohortId)
      .single();
    const payload: Record<string, unknown> = { cohort_id: cohortId, title };
    if (cohort?.classroom_id) payload.classroom_id = cohort.classroom_id;
    const { error } = await supabase.from('curriculums').insert(payload);
    if (error) throw error;
    await fetchCurriculum();
  };

  const addWeek = async (weekNumber: number, title: string, objectives: string) => {
    if (!curriculum) throw new Error('No curriculum found');
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

  const updateLesson = async (
    lessonId: string,
    payload: { title?: string; objectives?: string; lesson_order?: number }
  ) => {
    const { error } = await supabase
      .from('curriculum_lessons')
      .update(payload)
      .eq('id', lessonId);
    if (error) throw error;
    await fetchCurriculum();
  };

  const deleteLesson = async (lessonId: string) => {
    const { error } = await supabase
      .from('curriculum_lessons')
      .delete()
      .eq('id', lessonId);
    if (error) throw error;
    await fetchCurriculum();
  };

  const addMaterial = async (
    lessonId: string,
    opts: { type: string; title: string; url?: string; file?: File }
  ) => {
    let fileUrl = opts.url;
    if (opts.file) {
      const ext = opts.file.name.split('.').pop();
      const path = `${cohortId}/${lessonId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('lesson-materials')
        .upload(path, opts.file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage
        .from('lesson-materials')
        .getPublicUrl(path);
      fileUrl = urlData.publicUrl;
    }
    const { error } = await supabase.from('lesson_materials').insert({
      curriculum_lesson_id: lessonId,
      title: opts.title,
      material_type: opts.type,
      file_url: fileUrl || null,
    });
    if (error) throw error;
    await fetchCurriculum();
  };

  const deleteMaterial = async (materialId: string) => {
    const { error } = await supabase
      .from('lesson_materials')
      .delete()
      .eq('id', materialId);
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
    addLesson,
    updateLesson,
    deleteLesson,
    addMaterial,
    deleteMaterial,
  };
}
