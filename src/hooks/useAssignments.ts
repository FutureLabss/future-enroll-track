import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

type UseAssignmentsOptions = {
  enabled?: boolean;
};

export const ASSIGNMENT_COLUMNS = 'id, classroom_id, cohort_id, unit_id, lesson_id, curriculum_lesson_id, title, instructions, due_date, max_score, status, created_by, created_at, updated_at';

export type AssignmentSubmissionPayload = {
  text?: string;
  imageUrl?: string;
  linkUrl?: string;
  dueDate?: string | null;
};

export async function uploadAssignmentImage(file: File, assignmentId: string, userId: string) {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${userId}/${assignmentId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('assignment-submissions').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('assignment-submissions').getPublicUrl(path);
  return data.publicUrl;
}

export async function enrichStudentAssignments(rows: any[], studentId: string) {
  if (!rows.length) return [];

  const assignmentIds = rows.map((row) => row.id);
  const unitIds = Array.from(new Set(rows.map((row) => row.unit_id).filter(Boolean)));

  const [unitRes, submissionRes, resourceRes] = await Promise.all([
    unitIds.length
      ? supabase.from('units').select('id, title').in('id', unitIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('assignment_submissions')
      .select('id, assignment_id, status, submitted_at, file_url, image_url, link_url, submission_text, grade, score, feedback, graded_at')
      .eq('student_id', studentId)
      .in('assignment_id', assignmentIds),
    supabase
      .from('assignment_resources')
      .select('id, assignment_id, title, file_url, resource_type')
      .in('assignment_id', assignmentIds),
  ]);

  if (unitRes.error) toast.error(`Could not load assignment units: ${unitRes.error.message}`);
  if (submissionRes.error) toast.error(`Could not load your submissions: ${submissionRes.error.message}`);
  if (resourceRes.error) toast.error(`Could not load assignment resources: ${resourceRes.error.message}`);

  const unitsById = new Map(((unitRes.data || []) as any[]).map((unit) => [unit.id, unit]));
  const submissionsByAssignment = new Map<string, any[]>();
  ((submissionRes.data || []) as any[]).forEach((submission) => {
    const current = submissionsByAssignment.get(submission.assignment_id) || [];
    submissionsByAssignment.set(submission.assignment_id, [...current, submission]);
  });
  const resourcesByAssignment = new Map<string, any[]>();
  ((resourceRes.data || []) as any[]).forEach((resource) => {
    const current = resourcesByAssignment.get(resource.assignment_id) || [];
    resourcesByAssignment.set(resource.assignment_id, [...current, resource]);
  });

  return rows.map((row) => ({
    ...row,
    units: row.unit_id ? unitsById.get(row.unit_id) || null : null,
    assignment_submissions: submissionsByAssignment.get(row.id) || [],
    assignment_resources: resourcesByAssignment.get(row.id) || [],
  }));
}

export function useAssignments(classroomId: string, options: UseAssignmentsOptions = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const enabled = (options.enabled ?? Boolean(classroomId)) && Boolean(classroomId);

  const { data: assignments = [], isLoading: loading } = useQuery({
    queryKey: ['assignments', classroomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignments')
        .select(ASSIGNMENT_COLUMNS)
        .eq('classroom_id', classroomId)
        .order('created_at', { ascending: false });

      if (error) {
        toast.error(`Could not load assignments: ${error.message}`);
        return [];
      }

      const rows = data || [];
      const cohortIds = Array.from(new Set(rows.map((row: any) => row.cohort_id).filter(Boolean)));
      const unitIds = Array.from(new Set(rows.map((row: any) => row.unit_id).filter(Boolean)));

      const [cohortRes, unitRes] = await Promise.all([
        cohortIds.length
          ? supabase.from('cohorts').select('id, cohort_label').in('id', cohortIds)
          : Promise.resolve({ data: [], error: null }),
        unitIds.length
          ? supabase.from('units').select('id, title').in('id', unitIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (cohortRes.error) toast.error(`Could not load assignment cohorts: ${cohortRes.error.message}`);
      if (unitRes.error) toast.error(`Could not load assignment units: ${unitRes.error.message}`);

      const cohortsById = new Map(((cohortRes.data || []) as any[]).map((cohort) => [cohort.id, cohort]));
      const unitsById = new Map(((unitRes.data || []) as any[]).map((unit) => [unit.id, unit]));

      return rows.map((row: any) => ({
        ...row,
        cohorts: row.cohort_id ? cohortsById.get(row.cohort_id) || null : null,
        units: row.unit_id ? unitsById.get(row.unit_id) || null : null,
      }));
    },
    enabled,
    staleTime: 30_000,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['assignments', classroomId] });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await supabase
        .from('assignments')
        .insert({ ...payload, classroom_id: classroomId, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assignments', classroomId] }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const { error } = await supabase.from('assignments').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assignments', classroomId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('assignments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assignments', classroomId] }),
  });

  const createAssignment = (payload: any) => createMutation.mutateAsync(payload);
  const updateAssignment = (id: string, payload: any) => updateMutation.mutateAsync({ id, payload });
  const publishAssignment = (id: string) => updateAssignment(id, { status: 'published' });
  const deleteAssignment = (id: string) => deleteMutation.mutateAsync(id);

  return { assignments, loading, refetch, createAssignment, updateAssignment, publishAssignment, deleteAssignment };
}

export function useStudentAssignments(classroomId: string, cohortId?: string) {
  const { user } = useAuth();

  const { data: assignments = [], isLoading: loading } = useQuery({
    queryKey: ['student-assignments', classroomId, cohortId, user?.id],
    queryFn: async () => {
      let query = supabase
        .from('assignments')
        .select(ASSIGNMENT_COLUMNS)
        .eq('classroom_id', classroomId)
        .eq('status', 'published')
        .order('due_date', { ascending: true });

      query = cohortId
        ? query.or(`cohort_id.is.null,cohort_id.eq.${cohortId}`)
        : query.is('cohort_id', null);

      const { data, error } = await query;
      if (error) {
        toast.error(`Could not load assignments: ${error.message}`);
        return [];
      }
      return enrichStudentAssignments(data || [], user!.id);
    },
    enabled: Boolean(classroomId && user),
  });

  const queryClient = useQueryClient();
  const refetch = () => queryClient.invalidateQueries({ queryKey: ['student-assignments', classroomId, cohortId, user?.id] });

  return { assignments, loading, refetch };
}

export function useSubmissions(assignmentId: string) {
  const queryClient = useQueryClient();

  const { data: submissions = [], isLoading: loading } = useQuery({
    queryKey: ['submissions', assignmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('assignment_submissions')
        .select('*')
        .eq('assignment_id', assignmentId)
        .order('submitted_at', { ascending: false });
      const rows = data || [];
      const studentIds = [...new Set(rows.map((r: any) => r.student_id).filter(Boolean))];
      const { data: profileRows } = studentIds.length
        ? await supabase.from('profiles').select('user_id, full_name, email').in('user_id', studentIds)
        : { data: [] };
      const profilesById = new Map((profileRows || []).map((p: any) => [p.user_id, p]));
      return rows.map((r: any) => ({ ...r, profiles: profilesById.get(r.student_id) || null }));
    },
    enabled: Boolean(assignmentId),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['submissions', assignmentId] });

  const submitMutation = useMutation({
    mutationFn: async ({ text, imageUrl, linkUrl, dueDate }: AssignmentSubmissionPayload) => {
      const { data: { user } } = await supabase.auth.getUser();
      const isLate = Boolean(dueDate && new Date(dueDate) < new Date());
      const { error } = await supabase.from('assignment_submissions').upsert({
        assignment_id: assignmentId,
        student_id: user?.id,
        submission_text: text?.trim() || null,
        image_url: imageUrl || null,
        link_url: linkUrl?.trim() || null,
        file_url: linkUrl?.trim() || imageUrl || null,
        status: isLate ? 'late' : 'submitted',
        submitted_at: new Date().toISOString(),
      }, { onConflict: 'assignment_id,student_id' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['submissions', assignmentId] }),
  });

  const gradeMutation = useMutation({
    mutationFn: async ({ submissionId, grade, feedback, score }: { submissionId: string; grade: string; feedback: string; score?: number | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('assignment_submissions')
        .update({ grade, feedback, score: score ?? null, status: 'graded', graded_by: user?.id, graded_at: new Date().toISOString() })
        .eq('id', submissionId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['submissions', assignmentId] }),
  });

  const submitAssignment = (payload: AssignmentSubmissionPayload) => submitMutation.mutateAsync(payload);
  const gradeSubmission = (submissionId: string, grade: string, feedback: string, score?: number | null) =>
    gradeMutation.mutateAsync({ submissionId, grade, feedback, score });

  return { submissions, loading, refetch, submitAssignment, gradeSubmission };
}
