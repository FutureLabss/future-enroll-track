import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export function useAttendance(classroomId: string) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    const { data } = await supabase
      .from('attendance_sessions')
      .select('*, lessons(title, lesson_date), cohorts(cohort_label)')
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false });
    setSessions(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!classroomId) return;
    fetchSessions();
  }, [classroomId]);

  const generateSession = async (
    lessonId: string | null,
    cohortId: string | null,
    durationMins: number
  ) => {
    const { data, error } = await supabase.rpc('generate_attendance_session', {
      p_classroom_id: classroomId,
      p_lesson_id: lessonId,
      p_cohort_id: cohortId,
      p_duration_mins: durationMins,
    });
    if (error) throw error;
    await fetchSessions();
    return data;
  };

  const closeSession = async (sessionId: string) => {
    const { error } = await supabase
      .from('attendance_sessions')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', sessionId);
    if (error) throw error;
    await fetchSessions();
  };

  return { sessions, loading, generateSession, closeSession, refetch: fetchSessions };
}

export function useMarkAttendance() {
  const markAttendance = async (
    code: string,
    lat?: number,
    lng?: number
  ) => {
    const { data, error } = await supabase.rpc('mark_attendance', {
      p_code: code.toUpperCase(),
      p_student_lat: lat ?? null,
      p_student_lng: lng ?? null,
    });
    if (error) throw error;
    return data;
  };

  return { markAttendance };
}

export function useAttendanceReport(sessionId: string) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    supabase
      .from('attendance_records')
      .select('*, profiles:student_id(full_name, email)')
      .eq('session_id', sessionId)
      .then(({ data }) => {
        setRecords(data || []);
        setLoading(false);
      });
  }, [sessionId]);

  return { records, loading };
}

export function useStudentProgress(studentId: string, cohortId: string) {
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId || !cohortId) return;
    supabase
      .rpc('get_student_progress', {
        p_student_id: studentId,
        p_cohort_id: cohortId,
      })
      .then(({ data }) => {
        setProgress(data);
        setLoading(false);
      });
  }, [studentId, cohortId]);

  return { progress, loading };
}
