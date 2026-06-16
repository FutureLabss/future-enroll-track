import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { enrichSchedules, SCHEDULE_COLUMNS } from '@/hooks/useSchedules';

const ATTENDANCE_SESSION_COLUMNS = 'id, classroom_id, cohort_id, lesson_id, schedule_id, code, status, created_at, closed_at, duration_mins, code_expires_at, generated_by';

async function enrichAttendanceSessions(rows: any[]) {
  if (!rows.length) return [];

  const scheduleIds = Array.from(new Set(rows.map((row) => row.schedule_id).filter(Boolean)));
  const cohortIds = Array.from(new Set(rows.map((row) => row.cohort_id).filter(Boolean)));
  const lessonIds = Array.from(new Set(rows.map((row) => row.lesson_id).filter(Boolean)));

  const [scheduleRes, cohortRes, lessonRes] = await Promise.all([
    scheduleIds.length
      ? supabase.from('schedules').select(SCHEDULE_COLUMNS).in('id', scheduleIds)
      : Promise.resolve({ data: [], error: null }),
    cohortIds.length
      ? supabase.from('cohorts').select('id, cohort_label').in('id', cohortIds)
      : Promise.resolve({ data: [], error: null }),
    lessonIds.length
      ? supabase.from('old_lessons').select('id, title, lesson_date').in('id', lessonIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const schedulesById = new Map((await enrichSchedules(scheduleRes.data || [])).map((schedule) => [schedule.id, schedule]));
  const cohortsById = new Map(((cohortRes.data || []) as any[]).map((cohort) => [cohort.id, cohort]));
  const lessonsById = new Map(((lessonRes.data || []) as any[]).map((lesson) => [lesson.id, lesson]));

  return rows.map((row) => ({
    ...row,
    schedules: row.schedule_id ? schedulesById.get(row.schedule_id) || null : null,
    cohorts: row.cohort_id ? cohortsById.get(row.cohort_id) || null : null,
    old_lessons: row.lesson_id ? lessonsById.get(row.lesson_id) || null : null,
  }));
}

export function useAttendance(classroomId: string) {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    const { data, error } = await supabase
      .from('attendance_sessions')
      .select(ATTENDANCE_SESSION_COLUMNS)
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false });
    if (error) {
      setSessions([]);
      setLoading(false);
      return;
    }
    setSessions(await enrichAttendanceSessions(data || []));
    setLoading(false);
  };

  useEffect(() => {
    if (!classroomId) return;
    fetchSessions();
  }, [classroomId]);

  const generateSession = async (
    lessonId: string | null,
    cohortId: string | null,
    durationMins: number,
    scheduleId?: string | null
  ) => {
    const { data, error } = await supabase.rpc('generate_attendance_session', {
      p_classroom_id: classroomId,
      p_lesson_id: lessonId,
      p_cohort_id: cohortId,
      p_duration_mins: durationMins,
      p_schedule_id: scheduleId ?? null,
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
          .select('*')
          .eq('session_id', sessionId)
          .order('marked_at'),
        supabase
          .from('attendance_sessions')
          .select('cohort_id, classroom_id')
          .eq('id', sessionId)
          .single(),
      ]);
      const rows = recordsRes.data || [];
      const recordStudentIds = [...new Set(rows.map((r: any) => r.student_id).filter(Boolean))];
      const { data: recordProfiles } = recordStudentIds.length
        ? await supabase.from('profiles').select('user_id, full_name, email').in('user_id', recordStudentIds)
        : { data: [] };
      const recordProfilesById = new Map((recordProfiles || []).map((p: any) => [p.user_id, p]));
      const attended = rows.map((r: any) => ({ ...r, profiles: recordProfilesById.get(r.student_id) || null }));
      setRecords(attended);

      const session = sessionRes.data;
      if (session) {
        const attendedIds = new Set(attended.map((r: any) => r.student_id));
        const enrolledQuery = session.cohort_id
          ? supabase.from('cohort_students').select('student_id').eq('cohort_id', session.cohort_id)
          : supabase.from('classroom_students').select('student_id').eq('classroom_id', session.classroom_id);
        const { data: enrolled } = await enrolledQuery;
        const enrolledRows = enrolled || [];
        const enrolledIds = [...new Set(enrolledRows.map((s: any) => s.student_id).filter(Boolean))];
        const { data: enrolledProfiles } = enrolledIds.length
          ? await supabase.from('profiles').select('user_id, full_name, email').in('user_id', enrolledIds)
          : { data: [] };
        const enrolledProfilesById = new Map((enrolledProfiles || []).map((p: any) => [p.user_id, p]));
        setAbsentStudents(
          enrolledRows
            .filter((s: any) => !attendedIds.has(s.student_id))
            .map((s: any) => ({ ...s, profiles: enrolledProfilesById.get(s.student_id) || null }))
        );
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
    const load = async () => {
      const { data } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('session_id', sessionId);
      const rows = data || [];
      const studentIds = [...new Set(rows.map((r: any) => r.student_id).filter(Boolean))];
      const { data: profileRows } = studentIds.length
        ? await supabase.from('profiles').select('user_id, full_name, email').in('user_id', studentIds)
        : { data: [] };
      const profilesById = new Map((profileRows || []).map((p: any) => [p.user_id, p]));
      setRecords(rows.map((r: any) => ({ ...r, profiles: profilesById.get(r.student_id) || null })));
      setLoading(false);
    };
    load();
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
