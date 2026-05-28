import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export function useAssignments(classroomId: string) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAssignments = async () => {
    const { data } = await supabase
      .from('assignments')
      .select('*, cohorts(cohort_label), old_lessons(title, lesson_date), units(title), assignment_resources(*)')
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false });
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

export function useStudentAssignments(classroomId: string) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!classroomId || !user) return;
    supabase
      .from('assignments')
      .select(`
        *,
        units(title),
        assignment_resources(*),
        assignment_submissions!left(id, status, submitted_at, file_url, submission_text)
      `)
      .eq('classroom_id', classroomId)
      .eq('status', 'published')
      .order('due_date', { ascending: true })
      .then(({ data }) => {
        setAssignments(data || []);
        setLoading(false);
      });
  }, [classroomId, user]);

  return { assignments, loading };
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

  const submitAssignment = async (text: string, fileUrl?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const isLate = false; // caller handles due date check
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
