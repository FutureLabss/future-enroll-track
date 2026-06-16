import { useEffect, useState } from 'react';
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
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const enabled = options.enabled ?? Boolean(classroomId);

  const fetchAssignments = async () => {
    if (!classroomId || !enabled) {
      setAssignments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('assignments')
      .select(ASSIGNMENT_COLUMNS)
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error(`Could not load assignments: ${error.message}`);
      setAssignments([]);
      setLoading(false);
      return;
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

    setAssignments(rows.map((row: any) => ({
      ...row,
      cohorts: row.cohort_id ? cohortsById.get(row.cohort_id) || null : null,
      units: row.unit_id ? unitsById.get(row.unit_id) || null : null,
    })));
    setLoading(false);
  };

  useEffect(() => {
    fetchAssignments();
  }, [classroomId, enabled]);

  const createAssignment = async (payload: any) => {
    const { data, error } = await supabase
      .from('assignments')
      .insert({ ...payload, classroom_id: classroomId, created_by: user?.id })
      .select()
      .single();
    if (error) throw error;
    await fetchAssignments();
    return data;
  };

  const updateAssignment = async (id: string, payload: any) => {
    const { error } = await supabase.from('assignments').update(payload).eq('id', id);
    if (error) throw error;
    await fetchAssignments();
  };

  const publishAssignment = async (id: string) => {
    await updateAssignment(id, { status: 'published' });
  };

  const deleteAssignment = async (id: string) => {
    const { error } = await supabase.from('assignments').delete().eq('id', id);
    if (error) throw error;
    await fetchAssignments();
  };

  return { assignments, loading, refetch: fetchAssignments, createAssignment, updateAssignment, publishAssignment, deleteAssignment };
}

export function useStudentAssignments(classroomId: string, cohortId?: string) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAssignments = async () => {
    if (!classroomId || !user) {
      setAssignments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
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
      setAssignments([]);
      setLoading(false);
      return;
    }

    setAssignments(await enrichStudentAssignments(data || [], user.id));
    setLoading(false);
  };

  useEffect(() => {
    fetchAssignments();
  }, [classroomId, cohortId, user]);

  return { assignments, loading, refetch: fetchAssignments };
}

export function useSubmissions(assignmentId: string) {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSubmissions = async () => {
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
    setSubmissions(rows.map((r: any) => ({ ...r, profiles: profilesById.get(r.student_id) || null })));
    setLoading(false);
  };

  useEffect(() => {
    if (!assignmentId) return;
    fetchSubmissions();
  }, [assignmentId]);

  const submitAssignment = async ({ text, imageUrl, linkUrl, dueDate }: AssignmentSubmissionPayload) => {
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
    await fetchSubmissions();
  };

  const gradeSubmission = async (submissionId: string, grade: string, feedback: string, score?: number | null) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('assignment_submissions')
      .update({ grade, feedback, score: score ?? null, status: 'graded', graded_by: user?.id, graded_at: new Date().toISOString() })
      .eq('id', submissionId);
    if (error) throw error;
    await fetchSubmissions();
  };

  return { submissions, loading, refetch: fetchSubmissions, submitAssignment, gradeSubmission };
}
