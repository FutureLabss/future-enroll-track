import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface LessonV2 {
  id: string;
  unit_id: string;
  title: string;
  content: string | null;
  objectives: string | null;
  resources: any;
  video_url: string | null;
  external_link: string | null;
  order_index: number;
  created_at: string;
}

export interface UnitV2 {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  order_index: number;
  lessons: LessonV2[];
}

export interface ModuleV2 {
  id: string;
  track_id: string;
  title: string;
  description: string | null;
  order_index: number;
  units: UnitV2[];
}

export interface TrackV2 {
  id: string;
  curriculum_id: string;
  title: string;
  description: string | null;
  order_index: number;
  modules: ModuleV2[];
}

export interface CurriculumV2 {
  id: string;
  classroom_id: string;
  title: string;
  description: string | null;
  created_at: string;
  tracks: TrackV2[];
}

export function useCurriculumV2(classroomId: string) {
  const [curricula, setCurricula] = useState<CurriculumV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!classroomId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('get_classroom_curricula', { p_classroom_id: classroomId });

      if (error) {
        console.error('useCurriculumV2 fetchAll error:', error);
        setFetchError(error.message);
        return;
      }
      setFetchError(null);
      setCurricula((data || []).map((c: any) => ({ ...c, tracks: [] })));
    } finally {
      setLoading(false);
    }
  }, [classroomId]);

  const fetchTree = useCallback(async (curriculumId: string) => {
    const { data, error } = await supabase
      .rpc('get_curriculum_tree', { p_curriculum_id: curriculumId });
    if (error) { setFetchError(error.message); return []; }

    const { tracks = [], modules = [], units = [] } = data as any;
    setFetchError(null);
    return (tracks as any[]).map((t: any) => ({
      ...t,
      modules: (modules as any[])
        .filter((m: any) => m.track_id === t.id)
        .map((m: any) => ({
          ...m,
          units: (units as any[])
            .filter((u: any) => u.module_id === m.id)
            .map((u: any) => ({ ...u, lessons: [] })),
        })),
    }));
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Curriculum CRUD ──────────────────────────────────────────────────────────
  const createCurriculum = async (title: string, description?: string): Promise<string> => {
    const { data, error } = await supabase
      .from('curricula')
      .insert({ classroom_id: classroomId, title, description: description || null })
      .select('id')
      .single();
    if (error) throw error;
    await fetchAll();
    return data.id;
  };

  const refreshCurriculum = useCallback(async (curriculumId: string) => {
    const tracks = await fetchTree(curriculumId);
    setCurricula(prev => prev.map(c => c.id === curriculumId ? { ...c, tracks } : c));
  }, [fetchTree]);

  const updateCurriculum = async (id: string, patch: { title?: string; description?: string }) => {
    const { error } = await supabase.from('curricula').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  const deleteCurriculum = async (id: string) => {
    const { error } = await supabase.from('curricula').delete().eq('id', id);
    if (error) throw error;
    await fetchAll();
  };

  const cloneCurriculum = async (sourceCurriculumId: string, targetClassroomId: string, title?: string): Promise<string> => {
    const { data, error } = await supabase.rpc('clone_curriculum_v2' as any, {
      p_source_curriculum_id: sourceCurriculumId,
      p_target_classroom_id: targetClassroomId,
      p_title: title?.trim() || null,
    });
    if (error) throw error;
    if (targetClassroomId === classroomId) await fetchAll();
    return data as string;
  };

  // ── Track CRUD ───────────────────────────────────────────────────────────────
  const addTrack = async (curriculumId: string, title: string, description?: string) => {
    const { error } = await supabase.rpc('curriculum_add_track', { p_curriculum_id: curriculumId, p_title: title, p_description: description ?? null });
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  const updateTrack = async (id: string, curriculumId: string, patch: { title?: string; description?: string; order_index?: number }) => {
    const { error } = await supabase.rpc('curriculum_update_track', { p_id: id, p_title: patch.title ?? null, p_description: patch.description ?? null, p_order_index: patch.order_index ?? null });
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  const deleteTrack = async (id: string, curriculumId: string) => {
    const { error } = await supabase.rpc('curriculum_delete_track', { p_id: id });
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  // ── Module CRUD ──────────────────────────────────────────────────────────────
  const addModule = async (trackId: string, curriculumId: string, title: string, description?: string) => {
    const { error } = await supabase.rpc('curriculum_add_module', { p_track_id: trackId, p_title: title, p_description: description ?? null });
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  const updateModule = async (id: string, curriculumId: string, patch: { title?: string; description?: string; order_index?: number }) => {
    const { error } = await supabase.rpc('curriculum_update_module', { p_id: id, p_title: patch.title ?? null, p_description: patch.description ?? null, p_order_index: patch.order_index ?? null });
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  const deleteModule = async (id: string, curriculumId: string) => {
    const { error } = await supabase.rpc('curriculum_delete_module', { p_id: id });
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  // ── Unit CRUD ────────────────────────────────────────────────────────────────
  const addUnit = async (moduleId: string, curriculumId: string, title: string, description?: string) => {
    const { error } = await supabase.rpc('curriculum_add_unit', { p_module_id: moduleId, p_title: title, p_description: description ?? null });
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  const updateUnit = async (id: string, curriculumId: string, patch: { title?: string; description?: string; order_index?: number }) => {
    const { error } = await supabase.rpc('curriculum_update_unit', { p_id: id, p_title: patch.title ?? null, p_description: patch.description ?? null, p_order_index: patch.order_index ?? null });
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  const deleteUnit = async (id: string, curriculumId: string) => {
    const { error } = await supabase.rpc('curriculum_delete_unit', { p_id: id });
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  // ── Lesson CRUD ──────────────────────────────────────────────────────────────
  const addLesson = async (unitId: string, title: string, opts?: { content?: string; objectives?: string; video_url?: string; external_link?: string }) => {
    const { error } = await supabase.rpc('curriculum_add_lesson', {
      p_unit_id: unitId, p_title: title,
      p_content: opts?.content ?? null,
      p_objectives: opts?.objectives ?? null,
      p_video_url: opts?.video_url ?? null,
      p_external_link: opts?.external_link ?? null,
    });
    if (error) throw error;
  };

  const updateLesson = async (id: string, patch: { title?: string; content?: string; objectives?: string; resources?: any; order_index?: number; video_url?: string; external_link?: string }) => {
    const { error } = await supabase.rpc('curriculum_update_lesson', {
      p_id: id,
      p_title: patch.title ?? null,
      p_content: patch.content ?? null,
      p_objectives: patch.objectives ?? null,
      p_order_index: patch.order_index ?? null,
      p_video_url: patch.video_url ?? null,
      p_external_link: patch.external_link ?? null,
    });
    if (error) throw error;
  };

  const deleteLesson = async (id: string) => {
    const { error } = await supabase.rpc('curriculum_delete_lesson', { p_id: id });
    if (error) throw error;
  };

  return {
    curricula,
    loading,
    fetchError,
    refetch: fetchAll,
    refreshCurriculum,
    createCurriculum,
    updateCurriculum,
    deleteCurriculum,
    cloneCurriculum,
    addTrack,
    updateTrack,
    deleteTrack,
    addModule,
    updateModule,
    deleteModule,
    addUnit,
    updateUnit,
    deleteUnit,
    addLesson,
    updateLesson,
    deleteLesson,
  };
}
