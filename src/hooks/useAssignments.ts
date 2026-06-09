import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export function useAssignments(classroomId: string) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAssignments = async () => {
    const { data, error } = await supabase
      .from('assignments')
      .select('*, cohorts(cohort_label), units(title), assignment_resources(*)')
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false });
    if (error) toast.error(`Could not load assignments: ${error.message}`);
    setAssignments(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!classroomId) return;
    fetchAssignments();
  }, [classroomId]);

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
