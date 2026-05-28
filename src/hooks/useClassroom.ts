import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export interface Classroom {
  id: string;
  program_id: string | null;
  name: string;
  description: string | null;
  location: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  attendance_radius_metres: number;
  geofencing_enabled: boolean;
  status: 'active' | 'archived';
  created_at: string;
  programs?: { program_name: string } | null;
  cohorts?: { id: string; cohort_label: string; status: string }[];
}

export function useClassrooms() {
  const { isAdmin } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    const query = supabase
      .from('classrooms')
      .select('*, programs(program_name), cohorts(id, cohort_label, status)')
      .order('created_at', { ascending: false });
    const { data } = await query;
    setClassrooms((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const createClassroom = async (payload: Partial<Classroom>) => {
    const { data, error } = await supabase.from('classrooms').insert(payload as any).select().single();
    if (error) throw error;
    await fetch();
    return data;
  };

  const updateClassroom = async (id: string, payload: Partial<Classroom>) => {
    const { error } = await supabase.from('classrooms').update(payload as any).eq('id', id);
    if (error) throw error;
    await fetch();
  };

  const archiveClassroom = async (id: string) => {
    await updateClassroom(id, { status: 'archived' });
  };

  return { classrooms, loading, refetch: fetch, createClassroom, updateClassroom, archiveClassroom };
}

export function useClassroom(id: string) {
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchClassroom = async () => {
    if (!id) return;
    setLoading(true);
    const { data } = await supabase
      .from('classrooms')
      .select('*, programs(program_name), cohorts(id, cohort_label, status, start_date, end_date)')
      .eq('id', id)
      .single();
    setClassroom(data as any);
    setLoading(false);
  };

  useEffect(() => { fetchClassroom(); }, [id]);

  const updateClassroom = async (payload: Partial<Classroom>) => {
    const { error } = await supabase.from('classrooms').update(payload as any).eq('id', id);
    if (error) throw error;
    await fetchClassroom();
  };

  return { classroom, loading, refetch: fetchClassroom, updateClassroom };
}

export function useStaffClassrooms() {
  const { user } = useAuth();
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('classroom_staff')
      .select(`
        id, staff_type, status,
        classrooms(*, programs(program_name), cohorts(id, cohort_label, status)),
        classroom_permissions(*)
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => {
        setClassrooms((data as any[]) || []);
        setLoading(false);
      });
  }, [user]);

  return { classrooms, loading };
}

export function useClassroomCohorts(classroomId: string) {
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    const { data } = await supabase
      .from('cohorts')
      .select('*, cohort_students(count)')
      .eq('classroom_id', classroomId)
      .order('start_date', { ascending: false });
    setCohorts(data || []);
    setLoading(false);
  };

  useEffect(() => { if (classroomId) fetch(); }, [classroomId]);

  const createCohort = async (payload: { cohort_label: string; program_id?: string; start_date?: string; end_date?: string; status?: string; scope_type?: string | null; scope_id?: string | null; capacity?: number | null }): Promise<string> => {
    const { data, error } = await supabase.from('cohorts').insert({ ...payload, classroom_id: classroomId }).select('id').single();
    if (error) throw error;
    await fetch();
    return data.id;
  };

  const updateCohort = async (id: string, payload: Partial<{ cohort_label: string; start_date: string; end_date: string; status: string; scope_type: string | null; scope_id: string | null; capacity: number | null }>) => {
    const { error } = await supabase.from('cohorts').update(payload).eq('id', id);
    if (error) throw error;
    await fetch();
  };

  return { cohorts, loading, refetch: fetch, createCohort, updateCohort };
}

export function useStudentClassrooms() {
  const { user } = useAuth();
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('classroom_students')
      .select('*, classrooms(*, programs(program_name))')
      .eq('student_id', user.id)
      .then(({ data }) => {
        setClassrooms((data as any[]) || []);
        setLoading(false);
      });
  }, [user]);

  return { classrooms, loading };
}
