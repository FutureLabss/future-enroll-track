import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { notifySchedule } from '@/hooks/useSchedules';
import { toast } from 'sonner';

export const PRESENTATION_COLUMNS = 'id, classroom_id, cohort_id, schedule_id, title, instructions, max_score, pass_score, status, created_by, created_at, updated_at';
const PRESENTATION_SELECT = `${PRESENTATION_COLUMNS}, cohorts(cohort_label), schedules(scheduled_date, start_time, end_time, location, meeting_link)`;

export type CreatePresentationPayload = {
  classroomId: string;
  cohortId: string;
  title: string;
  instructions?: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  location?: string;
  meeting_link?: string;
  max_score?: number;
  pass_score?: number;
};

/**
 * Lists presentations for a classroom, optionally scoped to one cohort
 * (pass cohortId when rendering the Presentations tab under a specific
 * cohort; omit it to list every presentation across the classroom's cohorts).
 */
export function usePresentations(classroomId: string, cohortId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['presentations', classroomId, cohortId || null];

  const { data: presentations = [], isLoading: loading } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from('presentations')
        .select(PRESENTATION_SELECT)
        .eq('classroom_id', classroomId)
        .order('created_at', { ascending: false });
      if (cohortId) query = query.eq('cohort_id', cohortId);

      const { data, error } = await query;
      if (error) {
        toast.error(`Could not load presentations: ${error.message}`);
        return [];
      }
      return data || [];
    },
    enabled: Boolean(classroomId),
    staleTime: 30_000,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: async (payload: CreatePresentationPayload) => {
      const { data: schedule, error: scheduleError } = await supabase
        .from('schedules')
        .insert({
          classroom_id: payload.classroomId,
          cohort_id: payload.cohortId,
          title: payload.title,
          scheduled_date: payload.scheduled_date,
          start_time: payload.start_time,
          end_time: payload.end_time,
          location: payload.location || null,
          meeting_link: payload.meeting_link || null,
          status: 'scheduled',
        })
        .select()
        .single();
      if (scheduleError) throw scheduleError;

      const { data: presentation, error: presentationError } = await supabase
        .from('presentations')
        .insert({
          classroom_id: payload.classroomId,
          cohort_id: payload.cohortId,
          schedule_id: schedule.id,
          title: payload.title,
          instructions: payload.instructions?.trim() || null,
          max_score: payload.max_score ?? 100,
          pass_score: payload.pass_score ?? 50,
          status: 'published',
          created_by: user?.id,
        })
        .select()
        .single();
      if (presentationError) throw presentationError;

      try {
        await notifySchedule(schedule, payload.classroomId);
      } catch {
        // Notification failure shouldn't block scheduling — students can still see it in their schedule.
      }

      return presentation;
    },
    onSuccess: refetch,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const { error } = await supabase.from('presentations').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: refetch,
  });

  const deleteMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      // Deleting the schedule cascades to the presentation row and its grades.
      const { error } = await supabase.from('schedules').delete().eq('id', scheduleId);
      if (error) throw error;
    },
    onSuccess: refetch,
  });

  const createPresentation = (payload: CreatePresentationPayload) => createMutation.mutateAsync(payload);
  const updatePresentation = (id: string, payload: Record<string, unknown>) => updateMutation.mutateAsync({ id, payload });
  const publishPresentation = (id: string) => updatePresentation(id, { status: 'published' });
  const deletePresentation = (scheduleId: string) => deleteMutation.mutateAsync(scheduleId);

  return { presentations, loading, refetch, createPresentation, updatePresentation, publishPresentation, deletePresentation };
}

export function useStudentPresentations(classroomId: string, cohortId?: string) {
  const { user } = useAuth();

  const { data: presentations = [], isLoading: loading } = useQuery({
    queryKey: ['student-presentations', classroomId, cohortId, user?.id],
    queryFn: async () => {
      if (!cohortId) return [];
      const { data, error } = await supabase
        .from('presentations')
        .select(PRESENTATION_SELECT)
        .eq('cohort_id', cohortId)
        .in('status', ['published', 'completed'])
        .order('created_at', { ascending: false });
      if (error) {
        toast.error(`Could not load presentations: ${error.message}`);
        return [];
      }

      const rows = data || [];
      const presentationIds = rows.map((row: any) => row.id);
      const { data: gradeRows } = presentationIds.length
        ? await supabase.from('presentation_grades').select('*').eq('student_id', user!.id).in('presentation_id', presentationIds)
        : { data: [] as any[] };
      const gradesByPresentation = new Map((gradeRows || []).map((g: any) => [g.presentation_id, g]));

      return rows.map((row: any) => ({ ...row, presentation_grades: gradesByPresentation.has(row.id) ? [gradesByPresentation.get(row.id)] : [] }));
    },
    enabled: Boolean(classroomId && cohortId && user),
  });

  const queryClient = useQueryClient();
  const refetch = () => queryClient.invalidateQueries({ queryKey: ['student-presentations', classroomId, cohortId, user?.id] });

  return { presentations, loading, refetch };
}

export function usePresentationRoster(presentationId: string, cohortId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['presentation-roster', presentationId, cohortId];

  const { data: roster = [], isLoading: loading } = useQuery({
    queryKey,
    queryFn: async () => {
      const [{ data: members }, { data: grades }] = await Promise.all([
        supabase.from('cohort_students').select('student_id').eq('cohort_id', cohortId),
        supabase.from('presentation_grades').select('*').eq('presentation_id', presentationId),
      ]);

      const memberRows = members || [];
      const studentIds = memberRows.map((m: any) => m.student_id);
      const { data: profileRows } = studentIds.length
        ? await supabase.from('profiles').select('user_id, full_name, email').in('user_id', studentIds)
        : { data: [] as any[] };

      const profilesById = new Map((profileRows || []).map((p: any) => [p.user_id, p]));
      const gradesByStudent = new Map((grades || []).map((g: any) => [g.student_id, g]));

      return memberRows.map((m: any) => {
        const grade = gradesByStudent.get(m.student_id);
        return {
          student_id: m.student_id,
          profiles: profilesById.get(m.student_id) || null,
          score: grade?.score ?? null,
          feedback: grade?.feedback ?? '',
          status: grade?.status ?? 'pending',
          graded_at: grade?.graded_at ?? null,
        };
      });
    },
    enabled: Boolean(presentationId && cohortId),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey });

  const gradeMutation = useMutation({
    mutationFn: async ({ studentId, score, feedback }: { studentId: string; score: number | null; feedback: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('presentation_grades').upsert({
        presentation_id: presentationId,
        student_id: studentId,
        score,
        feedback: feedback.trim() || null,
        status: 'graded',
        graded_by: user?.id,
        graded_at: new Date().toISOString(),
      }, { onConflict: 'presentation_id,student_id' });
      if (error) throw error;
    },
    onSuccess: refetch,
  });

  const gradePresentation = (studentId: string, score: number | null, feedback: string) =>
    gradeMutation.mutateAsync({ studentId, score, feedback });

  return { roster, loading, refetch, gradePresentation };
}
