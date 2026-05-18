import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface LessonV2 {
  id: string;
  unit_id: string;
  title: string;
  content: string | null;
  objectives: string | null;
  resources: any;
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
        .from('curricula')
        .select('*')
        .eq('classroom_id', classroomId)
        .order('created_at', { ascending: true });

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
      .from('tracks')
      .select('*, modules(*, units(*))')
      .eq('curriculum_id', curriculumId)
      .order('order_index');
    if (error) { console.error('fetchTree error:', error); return []; }
    return (data || []).sort((a: any, b: any) => a.order_index - b.order_index).map((t: any) => ({
      ...t,
      modules: (t.modules || []).sort((a: any, b: any) => a.order_index - b.order_index).map((m: any) => ({
        ...m,
        units: (m.units || []).sort((a: any, b: any) => a.order_index - b.order_index).map((u: any) => ({ ...u, lessons: [] })),
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

  // ── Track CRUD ───────────────────────────────────────────────────────────────
  const addTrack = async (curriculumId: string, title: string, description?: string) => {
    const { data: existing } = await supabase.from('tracks').select('order_index').eq('curriculum_id', curriculumId).order('order_index', { ascending: false }).limit(1);
    const order_index = ((existing?.[0]?.order_index ?? -1) + 1);
    const { error } = await supabase.from('tracks').insert({ curriculum_id: curriculumId, title, description: description || null, order_index });
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  const updateTrack = async (id: string, curriculumId: string, patch: { title?: string; description?: string; order_index?: number }) => {
    const { error } = await supabase.from('tracks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  const deleteTrack = async (id: string, curriculumId: string) => {
    const { error } = await supabase.from('tracks').delete().eq('id', id);
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  // ── Module CRUD ──────────────────────────────────────────────────────────────
  const addModule = async (trackId: string, curriculumId: string, title: string, description?: string) => {
    const { data: existing } = await supabase.from('modules').select('order_index').eq('track_id', trackId).order('order_index', { ascending: false }).limit(1);
    const order_index = ((existing?.[0]?.order_index ?? -1) + 1);
    const { error } = await supabase.from('modules').insert({ track_id: trackId, title, description: description || null, order_index });
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  const updateModule = async (id: string, curriculumId: string, patch: { title?: string; description?: string; order_index?: number }) => {
    const { error } = await supabase.from('modules').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  const deleteModule = async (id: string, curriculumId: string) => {
    const { error } = await supabase.from('modules').delete().eq('id', id);
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  // ── Unit CRUD ────────────────────────────────────────────────────────────────
  const addUnit = async (moduleId: string, curriculumId: string, title: string, description?: string) => {
    const { data: existing } = await supabase.from('units').select('order_index').eq('module_id', moduleId).order('order_index', { ascending: false }).limit(1);
    const order_index = ((existing?.[0]?.order_index ?? -1) + 1);
    const { error } = await supabase.from('units').insert({ module_id: moduleId, title, description: description || null, order_index });
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  const updateUnit = async (id: string, curriculumId: string, patch: { title?: string; description?: string; order_index?: number }) => {
    const { error } = await supabase.from('units').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  const deleteUnit = async (id: string, curriculumId: string) => {
    const { error } = await supabase.from('units').delete().eq('id', id);
    if (error) throw error;
    await refreshCurriculum(curriculumId);
  };

  // ── Lesson CRUD ──────────────────────────────────────────────────────────────
  const addLesson = async (unitId: string, title: string, opts?: { content?: string; objectives?: string }) => {
    const { data: existing } = await supabase.from('lessons').select('order_index').eq('unit_id', unitId).order('order_index', { ascending: false }).limit(1);
    const order_index = ((existing?.[0]?.order_index ?? -1) + 1);
    const { error } = await supabase.from('lessons').insert({
      unit_id: unitId, title, order_index,
      content: opts?.content || null,
      objectives: opts?.objectives || null,
    });
    if (error) throw error;
  };

  const updateLesson = async (id: string, patch: { title?: string; content?: string; objectives?: string; resources?: any; order_index?: number }) => {
    const { error } = await supabase.from('lessons').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  };

  const deleteLesson = async (id: string) => {
    const { error } = await supabase.from('lessons').delete().eq('id', id);
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
