import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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

async function fetchCurriculumTree(curriculumId: string): Promise<TrackV2[]> {
  const { data, error } = await supabase.rpc('get_curriculum_tree', { p_curriculum_id: curriculumId });
  if (error || !data || typeof data !== 'object') return [];
  const { tracks = [], modules = [], units = [] } = data as any;
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
}

export function useCurriculumV2(classroomId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['curricula', classroomId];

  const { data: curricula = [], isLoading: loading, error: fetchErr } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_classroom_curricula', { p_classroom_id: classroomId });
      if (error) {
        toast.error(`Could not load curriculum: ${error.message}`);
        throw new Error(error.message);
      }
      const list = data || [];
      const trees = await Promise.all(list.map((c: any) => fetchCurriculumTree(c.id)));
      return list.map((c: any, i: number) => ({ ...c, tracks: trees[i] || [] })) as CurriculumV2[];
    },
    enabled: Boolean(classroomId),
  });

  const fetchError = fetchErr ? (fetchErr as Error).message : null;

  const refetch = () => queryClient.invalidateQueries({ queryKey });

  const refreshCurriculum = async (curriculumId: string) => {
    const tracks = await fetchCurriculumTree(curriculumId);
    queryClient.setQueryData(queryKey, (prev: CurriculumV2[] | undefined) =>
      (prev || []).map(c => c.id === curriculumId ? { ...c, tracks } : c)
    );
  };

  // ── Curriculum CRUD ──────────────────────────────────────────────────────────
  const createCurriculumMutation = useMutation({
    mutationFn: async ({ title, description }: { title: string; description?: string }): Promise<string> => {
      const { data, error } = await supabase
        .from('curricula')
        .insert({ classroom_id: classroomId, title, description: description || null })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const updateCurriculumMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { title?: string; description?: string } }) => {
      const { error } = await supabase.from('curricula').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteCurriculumMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('curricula').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const cloneCurriculumMutation = useMutation({
    mutationFn: async ({ sourceCurriculumId, targetClassroomId, title }: { sourceCurriculumId: string; targetClassroomId: string; title?: string }): Promise<string> => {
      const { data, error } = await supabase.rpc('clone_curriculum_v2' as any, {
        p_source_curriculum_id: sourceCurriculumId,
        p_target_classroom_id: targetClassroomId,
        p_title: title?.trim() || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, vars) => {
      if (vars.targetClassroomId === classroomId) queryClient.invalidateQueries({ queryKey });
    },
  });

  const createCurriculum = (title: string, description?: string) => createCurriculumMutation.mutateAsync({ title, description });
  const updateCurriculum = (id: string, patch: { title?: string; description?: string }) => updateCurriculumMutation.mutateAsync({ id, patch });
  const deleteCurriculum = (id: string) => deleteCurriculumMutation.mutateAsync(id);
  const cloneCurriculum = (sourceCurriculumId: string, targetClassroomId: string, title?: string) =>
    cloneCurriculumMutation.mutateAsync({ sourceCurriculumId, targetClassroomId, title });

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
    refetch,
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
