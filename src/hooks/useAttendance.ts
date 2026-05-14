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

  const regenerateCode = async (sessionId: string, durationMins: number) => {
    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newExpiry = new Date(Date.now() + durationMins * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('attendance_sessions')
      .update({ code: newCode, code_expires_at: newExpiry })
      .eq('id', sessionId);
    if (error) throw error;
    await fetchSessions();
    return newCode;
  };

  return { sessions, loading, generateSession, closeSession, regenerateCode, refetch: fetchSessions };
}

export function useAttendanceSession(sessionId: string) {
  const [records, setRecords] = useState<any[]>([]);
  const [absentStudents, setAbsentStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    const load = async () => {
      const [recordsRes, sessionRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('*, profiles:student_id(full_name, email)')
          .eq('session_id', sessionId)
          .order('marked_at'),
        supabase
          .from('attendance_sessions')
          .select('cohort_id, classroom_id')
          .eq('id', sessionId)
          .single(),
      ]);
      const attended = recordsRes.data || [];
      setRecords(attended);

      const session = sessionRes.data;
      if (session) {
        const attendedIds = new Set(attended.map((r: any) => r.student_id));
        let enrolledQuery = session.cohort_id
          ? supabase.from('cohort_students').select('student_id, profiles:student_id(full_name, email)').eq('cohort_id', session.cohort_id)
          : supabase.from('classroom_students').select('student_id, profiles:student_id(full_name, email)').eq('classroom_id', session.classroom_id);
        const { data: enrolled } = await enrolledQuery;
        setAbsentStudents((enrolled || []).filter((s: any) => !attendedIds.has(s.student_id)));
      }
      setLoading(false);
    };
    load();
  }, [sessionId]);

  return { records, absentStudents, loading };
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
