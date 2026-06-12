import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

type UseAssignmentsOptions = {
  enabled?: boolean;
};

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
      .select('id, classroom_id, cohort_id, unit_id, lesson_id, curriculum_lesson_id, title, instructions, due_date, status, created_by, created_at, updated_at')
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

  return { assignments, loading, refetch: fetchAssignments, createAssignment, updateAssignment, publishAssignment };
}

export function useStudentAssignments(classroomId: string, cohortId?: string) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAssignments = async () => {
    if (!classroomId || !user) return;
    setLoading(true);
    let query = supabase
      .from('assignments')
      .select(`
        *,
        units(title),
        assignment_submissions!left(id, status, submitted_at, file_url, submission_text, grade, feedback, graded_at)
      `)
      .eq('classroom_id', classroomId)
      .eq('status', 'published')
      .eq('assignment_submissions.student_id', user.id)
      .order('due_date', { ascending: true });

    query = cohortId
      ? query.or(`cohort_id.is.null,cohort_id.eq.${cohortId}`)
      : query.is('cohort_id', null);

    const { data, error } = await query;
    if (error) toast.error(`Could not load assignments: ${error.message}`);
    setAssignments(data || []);
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
      .select('*, profiles:student_id(full_name, email)')
      .eq('assignment_id', assignmentId)
      .order('submitted_at', { ascending: false });
    setSubmissions(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!assignmentId) return;
    fetchSubmissions();
  }, [assignmentId]);

  const submitAssignment = async (text: string, fileUrl?: string, dueDate?: string | null) => {
    const { data: { user } } = await supabase.auth.getUser();
    const isLate = Boolean(dueDate && new Date(dueDate) < new Date());
    const { error } = await supabase.from('assignment_submissions').upsert({
      assignment_id: assignmentId,
      student_id: user?.id,
      submission_text: text || null,
      file_url: fileUrl || null,
      status: isLate ? 'late' : 'submitted',
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'assignment_id,student_id' });
    if (error) throw error;
    await fetchSubmissions();
  };

  const gradeSubmission = async (submissionId: string, grade: string, feedback: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('assignment_submissions')
      .update({ grade, feedback, status: 'graded', graded_by: user?.id, graded_at: new Date().toISOString() })
      .eq('id', submissionId);
    if (error) throw error;
    await fetchSubmissions();
  };

  return { submissions, loading, refetch: fetchSubmissions, submitAssignment, gradeSubmission };
}
