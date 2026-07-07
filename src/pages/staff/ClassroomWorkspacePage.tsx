import { useCallback, useMemo, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAttendance, useAttendanceSession } from '@/hooks/useAttendance';
import { useAssignments, useSubmissions } from '@/hooks/useAssignments';
import { useClassroomCohorts } from '@/hooks/useClassroom';
import { useSchedules } from '@/hooks/useSchedules';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DataTable } from '@/components/shared/DataTable';
import { CurriculumTreeV2 } from '@/components/classroom/CurriculumTreeV2';
import { toast } from 'sonner';
import {
  Calendar, CalendarPlus, ClipboardList, Users, BookOpen, Plus, Radio, Clock, Loader2,
  LayoutList, Layers, PlayCircle, CheckCircle, XCircle, Pencil, Eye, RefreshCw,
  UserPlus, UserMinus, UserCheck, Trash2, Bell,
} from 'lucide-react';
import { downloadICS } from '@/lib/ics';

const STATUS_COLOURS: Record<string, string> = {
  upcoming: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  active: 'bg-success/15 text-success border-success/30',
  completed: 'bg-muted text-muted-foreground border-muted',
  archived: 'bg-muted/50 text-muted-foreground/60 border-muted',
  scheduled: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  in_progress: 'bg-warning/15 text-warning border-warning/30',
  cancelled: 'bg-destructive/15 text-destructive border-destructive/30',
};

const COHORT_STATUSES = ['upcoming', 'active', 'completed', 'archived'] as const;
const emptyAssignmentForm = { title: '', instructions: '', due_date: '', cohort_id: '', unit_id: '', status: 'draft', max_score: '' };

const toDateTimeLocal = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

function AttendanceDrillDown({ session, canMark }: { session: any; canMark?: boolean }) {
  const { records, absentStudents, loading, refetch } = useAttendanceSession(session.id);
  const [marking, setMarking] = useState<string | null>(null);

  const handleManualMark = async (studentId: string, status: string) => {
    setMarking(`${studentId}-${status}`);
    try {
      const { error } = await supabase.rpc('staff_mark_attendance_manual', {
        p_session_id: session.id,
        p_student_id: studentId,
        p_status: status,
      });
      if (error) throw error;
      toast.success(`Marked ${status}`);
      await refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setMarking(null);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl border border-border p-3">
          <div className="text-2xl font-bold text-success">{records.filter(r => r.attendance_status === 'present').length}</div>
          <div className="text-xs text-muted-foreground">Present</div>
        </div>
        <div className="rounded-xl border border-border p-3">
          <div className="text-2xl font-bold text-warning">{records.filter(r => r.attendance_status === 'late').length}</div>
          <div className="text-xs text-muted-foreground">Late</div>
        </div>
        <div className="rounded-xl border border-border p-3">
          <div className="text-2xl font-bold text-destructive">{absentStudents.length}</div>
          <div className="text-xs text-muted-foreground">Absent</div>
        </div>
      </div>

      {records.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Attended</p>
          <div className="space-y-1.5">
            {records.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{r.profiles?.full_name || '—'}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{r.profiles?.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  {r.lat && <span className="text-xs text-muted-foreground">GPS</span>}
                  <Badge variant="outline" className={`${STATUS_COLOURS[r.attendance_status] || ''} capitalize`}>{r.attendance_status}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(r.marked_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {absentStudents.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2 text-destructive">Absent</p>
          <div className="space-y-1.5">
            {absentStudents.map((s: any) => (
              <div key={s.student_id} className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{s.profiles?.full_name || '—'}</span>
                  <span className="text-xs text-muted-foreground">{s.profiles?.email}</span>
                </div>
                {canMark && (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm" variant="outline"
                      className="h-7 text-xs text-success border-success/40 hover:bg-success/10"
                      disabled={!!marking}
                      onClick={() => handleManualMark(s.student_id, 'present')}
                    >
                      {marking === `${s.student_id}-present` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Mark Present'}
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className="h-7 text-xs text-warning border-warning/40 hover:bg-warning/10"
                      disabled={!!marking}
                      onClick={() => handleManualMark(s.student_id, 'excused')}
                    >
                      {marking === `${s.student_id}-excused` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Excused'}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {records.length === 0 && absentStudents.length === 0 && (
        <p className="text-center text-muted-foreground py-4">No records yet</p>
      )}
    </div>
  );
}

function SubmissionsModal({ assignment }: { assignment: any }) {
  const { submissions, loading, gradeSubmission } = useSubmissions(assignment.id);
  const [grading, setGrading] = useState<{ id: string; grade: string; feedback: string; score: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleGrade = async () => {
    if (!grading) return;
    setSaving(true);
    try {
      const scoreNum = grading.score.trim() ? Number(grading.score) : null;
      await gradeSubmission(grading.id, grading.grade, grading.feedback, scoreNum);
      toast.success('Graded');
      setGrading(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{submissions.length} submission{submissions.length !== 1 ? 's' : ''}</p>
      {submissions.map((sub: any) => (
        <div key={sub.id} className="rounded-xl border border-border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{sub.profiles?.full_name || '—'}</p>
              <p className="text-xs text-muted-foreground">{new Date(sub.submitted_at).toLocaleString()}</p>
            </div>
            <Badge variant={sub.status === 'graded' ? 'default' : 'secondary'} className="capitalize">{sub.status}</Badge>
          </div>
          {sub.submission_text && <p className="text-sm bg-muted/50 rounded-lg p-3">{sub.submission_text}</p>}
          {sub.grade && <p className="text-sm font-medium">Grade: {sub.grade}{sub.feedback && ` — ${sub.feedback}`}</p>}
          {sub.status !== 'graded' && (
            grading?.id === sub.id ? (
              <div className="space-y-2 pt-1">
                <Input placeholder="Grade (e.g. A, 85/100)" value={grading.grade} onChange={e => setGrading({ ...grading, grade: e.target.value })} />
                <Input placeholder="Score (numeric, optional)" type="number" value={grading.score} onChange={e => setGrading({ ...grading, score: e.target.value })} />
                <Textarea placeholder="Feedback (optional)" value={grading.feedback} onChange={e => setGrading({ ...grading, feedback: e.target.value })} rows={2} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleGrade} disabled={saving}>{saving ? 'Saving...' : 'Submit Grade'}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setGrading(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setGrading({ id: sub.id, grade: '', feedback: '', score: '' })}>Grade</Button>
            )
          )}
        </div>
      ))}
      {submissions.length === 0 && <p className="text-center text-muted-foreground py-6">No submissions yet</p>}
    </div>
  );
}

export default function ClassroomWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: pageData, isLoading: dataLoading } = useQuery({
    queryKey: ['workspace-local', id, user?.id],
    queryFn: async () => {
      const [csRes, staffRes, studentsRes] = await Promise.all([
        supabase.from('classroom_staff')
          .select('*, classrooms(*, programs(program_name)), classroom_permissions(*)')
          .eq('classroom_id', id!).eq('user_id', user!.id).maybeSingle(),
        supabase.from('staff').select('id, full_name'),
        supabase.rpc('get_classroom_students', { p_classroom_id: id }),
      ]);
      if (csRes.error) throw csRes.error;
      return {
        classroomData: csRes.data ?? null,
        staffList: (staffRes.data || []) as any[],
        students: (studentsRes.data || []) as any[],
      };
    },
    enabled: !!id && !!user,
    staleTime: 30_000,
  });
  const classroomData = pageData?.classroomData ?? null;
  const permissions = classroomData?.classroom_permissions ?? null;
  const staffList = pageData?.staffList ?? [];
  const students = pageData?.students ?? [];

  const { data: optionsData } = useQuery({
    queryKey: ['workspace-options', id],
    queryFn: async () => {
      const [scopeRes, lessonRes] = await Promise.all([
        supabase.rpc('get_classroom_scope_options', { p_classroom_id: id }),
        supabase.rpc('get_classroom_lesson_options' as any, { p_classroom_id: id }),
      ]);
      return {
        scopeOptions: (scopeRes.data as any) ?? { curricula: [], tracks: [], modules: [] },
        lessonOptions: (lessonRes.data as any[]) ?? [],
      };
    },
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
  const scopeOptions = optionsData?.scopeOptions ?? { curricula: [], tracks: [], modules: [] };
  const lessonOptions = optionsData?.lessonOptions ?? [];

  const { sessions, generateSession, closeSession, regenerateCode } = useAttendance(id!);
  const { assignments, createAssignment, updateAssignment, publishAssignment, deleteAssignment } = useAssignments(id!);
  const { cohorts, refetch: refetchCohorts, createCohort, updateCohort } = useClassroomCohorts(id!);
  const { schedules, createSchedule, updateSchedule, deleteSchedule, notifySchedule } = useSchedules(id!);

  // Attendance state
  const [sessionForm, setSessionForm] = useState({ schedule_id: '', cohort_id: '', duration: '30' });
  const [activeSession, setActiveSession] = useState<any>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [generatingSession, setGeneratingSession] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [drillSession, setDrillSession] = useState<any>(null);
  const [regenerating, setRegenerating] = useState(false);

  // Schedule state
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleEditModal, setScheduleEditModal] = useState<{ open: boolean; schedule?: any }>({ open: false });
  const [scheduleForm, setScheduleForm] = useState({ title: '', lesson_id: '', module_id: '', cohort_id: '', instructor_id: '', scheduled_date: '', start_time: '09:00', end_time: '11:00', location: '', meeting_link: '' });
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Assignment state
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignEditing, setAssignEditing] = useState<any>(null);
  const [assignForm, setAssignForm] = useState(emptyAssignmentForm);
  const [savingAssign, setSavingAssign] = useState(false);
  const [submissionsAssignment, setSubmissionsAssignment] = useState<any>(null);
  const [pendingDeleteAssignment, setPendingDeleteAssignment] = useState<any>(null);

  // Cohort state
  const [cohortOpen, setCohortOpen] = useState(false);
  const [cohortEditModal, setCohortEditModal] = useState<{ open: boolean; cohort?: any }>({ open: false });
  const [cohortForm, setCohortForm] = useState({ cohort_label: '', start_date: '', end_date: '', status: 'upcoming', scope_type: '' as '' | 'curriculum' | 'track' | 'module', scope_id: '' });
  const [scheduleOpts, setScheduleOpts] = useState({ enabled: false, days: [] as string[], start_time: '09:00', end_time: '11:00', instructor_id: '' });
  const [savingCohort, setSavingCohort] = useState(false);

  // Cohort student management
  const [cohortStudentsModal, setCohortStudentsModal] = useState<{ open: boolean; cohort?: any }>({ open: false });
  const [cohortMembers, setCohortMembers] = useState<any[]>([]);
  const [cohortStudentsLoading, setCohortStudentsLoading] = useState(false);
  const [cohortStudentSearch, setCohortStudentSearch] = useState('');


  useEffect(() => {
    const open = sessions.find((s: any) => s.status === 'open');
    setActiveSession(open || null);
    if (open) {
      const expiry = new Date(open.code_expires_at).getTime();
      const timer = setInterval(() => {
        const remaining = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
        setCountdown(remaining);
        if (remaining === 0) clearInterval(timer);
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setCountdown(null);
    }
  }, [sessions]);

  const handleStartAttendance = async () => {
    setGeneratingSession(true);
    try {
      await generateSession(null, sessionForm.cohort_id || null, parseInt(sessionForm.duration), sessionForm.schedule_id || null);
      setSessionOpen(false);
      toast.success('Attendance session started');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGeneratingSession(false);
    }
  };

  const handleCloseSession = async () => {
    if (!activeSession) return;
    await closeSession(activeSession.id);
    toast.success('Session closed');
  };

  const handleRegenerateCode = async () => {
    if (!activeSession) return;
    setRegenerating(true);
    try {
      const code = await regenerateCode(activeSession.id, parseInt(sessionForm.duration || '30'));
      toast.success(`New code: ${code}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRegenerating(false);
    }
  };

  const formatCountdown = (secs: number) => `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`;

  const handleCreateSchedule = async () => {
    if (!scheduleForm.scheduled_date) { toast.error('Date required'); return; }
    setSavingSchedule(true);
    try {
      await createSchedule({
        title: scheduleForm.title || null,
        lesson_id: scheduleForm.lesson_id || null,
        module_id: scheduleForm.module_id || null,
        cohort_id: scheduleForm.cohort_id || null,
        instructor_id: scheduleForm.instructor_id || null,
        scheduled_date: scheduleForm.scheduled_date,
        start_time: scheduleForm.start_time,
        end_time: scheduleForm.end_time,
        location: scheduleForm.location || undefined,
        meeting_link: scheduleForm.meeting_link || undefined,
      });
      toast.success('Schedule added');
      setScheduleOpen(false);
      setScheduleForm({ title: '', lesson_id: '', module_id: '', cohort_id: '', instructor_id: '', scheduled_date: '', start_time: '09:00', end_time: '11:00', location: '', meeting_link: '' });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleOpenScheduleEdit = useCallback((r: any) => {
    setScheduleForm({
      title: r.title || '',
      lesson_id: r.lesson_id || '',
      module_id: r.module_id || '',
      cohort_id: r.cohort_id || '',
      instructor_id: r.instructor_id || '',
      scheduled_date: r.scheduled_date || '',
      start_time: r.start_time || '09:00',
      end_time: r.end_time || '11:00',
      location: r.location || '',
      meeting_link: r.meeting_link || '',
    });
    setScheduleEditModal({ open: true, schedule: r });
  }, []);

  const handleUpdateSchedule = async () => {
    if (!scheduleForm.scheduled_date) { toast.error('Date required'); return; }
    setSavingSchedule(true);
    try {
      await updateSchedule(scheduleEditModal.schedule.id, {
        title: scheduleForm.title || null,
        lesson_id: scheduleForm.lesson_id || null,
        module_id: scheduleForm.module_id || null,
        cohort_id: scheduleForm.cohort_id || null,
        instructor_id: scheduleForm.instructor_id || null,
        scheduled_date: scheduleForm.scheduled_date,
        start_time: scheduleForm.start_time,
        end_time: scheduleForm.end_time,
        location: scheduleForm.location || undefined,
        meeting_link: scheduleForm.meeting_link || undefined,
      });
      toast.success('Schedule updated');
      setScheduleEditModal({ open: false });
      setScheduleForm({ title: '', lesson_id: '', module_id: '', cohort_id: '', instructor_id: '', scheduled_date: '', start_time: '09:00', end_time: '11:00', location: '', meeting_link: '' });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleScheduleStatus = useCallback(async (scheduleId: string, status: 'scheduled' | 'completed' | 'cancelled') => {
    try {
      await updateSchedule(scheduleId, { status });
      toast.success(`Schedule ${status}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }, []);

  const openCreateAssignment = () => {
    setAssignEditing(null);
    setAssignForm(emptyAssignmentForm);
    setAssignOpen(true);
  };

  const openEditAssignment = (assignment: any) => {
    setAssignEditing(assignment);
    setAssignForm({
      title: assignment.title || '',
      instructions: assignment.instructions || '',
      due_date: toDateTimeLocal(assignment.due_date),
      cohort_id: assignment.cohort_id || '',
      unit_id: assignment.unit_id || '',
      status: assignment.status || 'draft',
      max_score: assignment.max_score != null ? String(assignment.max_score) : '',
    });
    setAssignOpen(true);
  };

  const resetAssignmentModal = () => {
    setAssignOpen(false);
    setAssignEditing(null);
    setAssignForm(emptyAssignmentForm);
  };

  const handleSaveAssignment = async () => {
    if (!assignForm.title.trim()) { toast.error('Title required'); return; }
    setSavingAssign(true);
    const payload = {
      title: assignForm.title.trim(),
      instructions: assignForm.instructions.trim() || null,
      due_date: assignForm.due_date || null,
      cohort_id: assignForm.cohort_id || null,
      unit_id: assignForm.unit_id || null,
      status: assignForm.status,
      max_score: assignForm.max_score ? Number(assignForm.max_score) : null,
    };

    try {
      if (assignEditing) {
        await updateAssignment(assignEditing.id, payload);
        toast.success('Assignment updated');
      } else {
        await createAssignment(payload);
        toast.success('Assignment created');
      }
      resetAssignmentModal();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingAssign(false);
    }
  };

  const handleDeleteAssignment = (assignment: any) => {
    setPendingDeleteAssignment(assignment);
  };

  const doDeleteAssignment = async () => {
    if (!pendingDeleteAssignment) return;
    try {
      await deleteAssignment(pendingDeleteAssignment.id);
      toast.success('Assignment deleted');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPendingDeleteAssignment(null);
    }
  };

  const handleCreateCohort = async () => {
    if (!cohortForm.cohort_label.trim()) { toast.error('Cohort label required'); return; }
    if (scheduleOpts.enabled && scheduleOpts.days.length === 0) { toast.error('Select at least one day for scheduling'); return; }
    setSavingCohort(true);
    try {
      const cls = classroomData?.classrooms;
      const newId = await createCohort({
        ...cohortForm,
        program_id: cls?.program_id,
        scope_type: cohortForm.scope_type || null,
        scope_id: cohortForm.scope_id || null,
      });
      if (scheduleOpts.enabled && scheduleOpts.days.length > 0) {
        const { data: count } = await supabase.rpc('generate_cohort_schedule', {
          p_cohort_id: newId,
          p_days: scheduleOpts.days,
          p_start_time: scheduleOpts.start_time,
          p_end_time: scheduleOpts.end_time,
          p_instructor_id: scheduleOpts.instructor_id || null,
        });
        toast.success(`Cohort created · ${count} session${count !== 1 ? 's' : ''} scheduled`);
      } else {
        toast.success('Cohort created');
      }
      setCohortOpen(false);
      setCohortForm({ cohort_label: '', start_date: '', end_date: '', status: 'upcoming', scope_type: '', scope_id: '' });
      setScheduleOpts({ enabled: false, days: [], start_time: '09:00', end_time: '11:00', instructor_id: '' });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingCohort(false);
    }
  };

  const handleUpdateCohort = async () => {
    const c = cohortEditModal.cohort;
    setSavingCohort(true);
    try {
      await updateCohort(c.id, cohortForm);
      toast.success('Cohort updated');
      setCohortEditModal({ open: false });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingCohort(false);
    }
  };

  const openCohortStudents = async (cohort: any) => {
    setCohortStudentsModal({ open: true, cohort });
    setCohortStudentSearch('');
    setCohortStudentsLoading(true);
    const { data: rows } = await supabase
      .from('cohort_students')
      .select('id, student_id')
      .eq('cohort_id', cohort.id);
    const members = rows || [];
    const ids = members.map((r: any) => r.student_id).filter(Boolean);
    const profilesById = new Map<string, any>();
    if (ids.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', ids);
      (profiles || []).forEach((p: any) => profilesById.set(p.user_id, p));
    }
    setCohortMembers(members.map((r: any) => ({
      id: r.id,
      student_id: r.student_id,
      full_name: profilesById.get(r.student_id)?.full_name ?? null,
      email: profilesById.get(r.student_id)?.email ?? null,
    })));
    setCohortStudentsLoading(false);
  };

  const handleAddToCohort = async (student: any) => {
    const cohort = cohortStudentsModal.cohort;
    const { error } = await supabase.rpc('add_student_to_cohort', {
      p_cohort_id: cohort.id,
      p_student_id: student.user_id,
      p_enrollment_id: student.id || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`${(student.profiles as any)?.full_name || student.full_name || 'Student'} added to cohort`);
    openCohortStudents(cohort);
  };

  const handleRemoveFromCohort = async (memberId: string, name: string) => {
    const cohort = cohortStudentsModal.cohort;
    const { error } = await supabase.rpc('remove_student_from_cohort', { p_id: memberId });
    if (error) { toast.error(error.message); return; }
    toast.success(`${name} removed from cohort`);
    openCohortStudents(cohort);
  };

  const cls = classroomData?.classrooms;
  const can = permissions || {};
  const canCreateAssignments = Boolean(can.can_create_assignments);
  const canViewAssignments = canCreateAssignments || classroomData?.staff_type === 'teaching';
  const today = new Date().toISOString().split('T')[0];
  const todaySchedules = schedules.filter(s => s.scheduled_date === today && s.status === 'scheduled');
  const unitOptions = Array.from(
    new Map(lessonOptions.map((lesson: any) => [lesson.unit_id, lesson])).values()
  );

  const scheduleColumns = useMemo(() => [
    { key: 'date', header: 'Date', render: (r: any) => new Date(r.scheduled_date + 'T00:00:00').toLocaleDateString() },
    { key: 'title', header: 'Session', render: (r: any) => r.title || r.lessons?.title || r.modules?.title || <span className="text-muted-foreground text-xs italic">Untitled</span> },
    { key: 'time', header: 'Time', render: (r: any) => `${r.start_time} – ${r.end_time}` },
    { key: 'instructor', header: 'Instructor', render: (r: any) => r.staff?.full_name || '—' },
    { key: 'cohort', header: 'Cohort', render: (r: any) => r.cohorts?.cohort_label || 'All' },
    { key: 'status', header: 'Status', render: (r: any) => (
      <Badge variant="outline" className={`capitalize ${STATUS_COLOURS[r.status] || ''}`}>{r.status}</Badge>
    )},
    { key: 'actions', header: '', render: (r: any) => (
      <div className="flex gap-1">
        <Button
          size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground"
          title="Add to Calendar"
          onClick={() => downloadICS({
            title: r.title || r.lessons?.title || r.modules?.title || 'Session',
            date: r.scheduled_date,
            startTime: r.start_time,
            endTime: r.end_time,
            location: r.location,
            description: r.meeting_link ? `Join online: ${r.meeting_link}` : null,
          })}
        >
          <CalendarPlus className="h-4 w-4" />
        </Button>
        <Button
          size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground"
          title="Notify class"
          onClick={async () => {
            try {
              const count = await notifySchedule(r);
              toast.success(`Notified ${count} student${count !== 1 ? 's' : ''}`);
            } catch (e: any) {
              toast.error(e.message);
            }
          }}
        >
          <Bell className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleOpenScheduleEdit(r)} title="Edit">
          <Pencil className="h-4 w-4" />
        </Button>
        {r.status === 'scheduled' && (
          <Button size="sm" variant="ghost" className="text-success h-7 px-2" onClick={() => handleScheduleStatus(r.id, 'completed')} title="Mark completed">
            <CheckCircle className="h-4 w-4" />
          </Button>
        )}
        {r.status === 'scheduled' && (
          <Button size="sm" variant="ghost" className="text-destructive h-7 px-2" onClick={() => handleScheduleStatus(r.id, 'cancelled')} title="Cancel">
            <XCircle className="h-4 w-4" />
          </Button>
        )}
      </div>
    )},
  ], [handleOpenScheduleEdit, handleScheduleStatus]);

  // Early returns must stay below every hook — returning during loading with
  // scheduleColumns memoized above changes the hook count between renders
  if (dataLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  if (!classroomData) return <div className="text-center py-20 text-muted-foreground">Classroom not found or access denied.</div>;

  return (
    <div>
      <PageHeader
        title={cls.name}
        description={`${cls.programs?.program_name || ''} · ${classroomData.staff_type === 'teaching' ? 'Teaching Staff' : 'Non-Teaching Staff'}`}
      />

      {/* Active attendance session banner */}
      {activeSession && (
        <div className="mb-6 rounded-2xl bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/30 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs text-primary font-semibold mb-1 flex items-center gap-1"><Radio className="h-3 w-3" />LIVE SESSION</div>
              <div className="font-mono text-5xl font-black tracking-[0.2em] text-primary">{activeSession.code}</div>
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {countdown !== null ? (countdown > 0 ? `Expires in ${formatCountdown(countdown)}` : 'Expired') : '—'}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" onClick={handleRegenerateCode} disabled={regenerating}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${regenerating ? 'animate-spin' : ''}`} />
                New Code
              </Button>
              <Button variant="destructive" size="sm" onClick={handleCloseSession}>Close Session</Button>
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="curriculum">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="curriculum"><LayoutList className="h-4 w-4 mr-1.5" />Curriculum</TabsTrigger>
          {can.can_edit_cohorts && <TabsTrigger value="cohorts"><Layers className="h-4 w-4 mr-1.5" />Cohorts</TabsTrigger>}
          <TabsTrigger value="schedule"><Calendar className="h-4 w-4 mr-1.5" />Schedule</TabsTrigger>
          <TabsTrigger value="attendance"><ClipboardList className="h-4 w-4 mr-1.5" />Attendance</TabsTrigger>
          {can.can_view_students && <TabsTrigger value="students"><Users className="h-4 w-4 mr-1.5" />Students ({students.length})</TabsTrigger>}
          {canViewAssignments && <TabsTrigger value="assignments"><BookOpen className="h-4 w-4 mr-1.5" />Assignments</TabsTrigger>}
        </TabsList>

        {/* CURRICULUM */}
        <TabsContent value="curriculum">
          <CurriculumTreeV2 classroomId={id!} />
        </TabsContent>

        {/* COHORTS */}
        {can.can_edit_cohorts && (
          <TabsContent value="cohorts">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-semibold">Cohorts</h3>
              <Dialog open={cohortOpen} onOpenChange={setCohortOpen}>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New Cohort</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Create Cohort</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-2">
                    <div><Label>Label *</Label><Input value={cohortForm.cohort_label} onChange={e => setCohortForm({ ...cohortForm, cohort_label: e.target.value })} className="mt-1.5" placeholder="e.g. May 2026 Intake" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Start Date</Label><Input type="date" value={cohortForm.start_date} onChange={e => setCohortForm({ ...cohortForm, start_date: e.target.value })} className="mt-1.5" /></div>
                      <div><Label>End Date</Label><Input type="date" value={cohortForm.end_date} onChange={e => setCohortForm({ ...cohortForm, end_date: e.target.value })} className="mt-1.5" /></div>
                    </div>
                    <div>
                      <Label>Status</Label>
                      <Select value={cohortForm.status} onValueChange={v => setCohortForm({ ...cohortForm, status: v })}>
                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(['upcoming', 'active', 'completed', 'archived'] as const).map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Scope Type</Label>
                      <Select value={cohortForm.scope_type} onValueChange={v => setCohortForm({ ...cohortForm, scope_type: v as any, scope_id: '' })}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Entire classroom (no scope)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="curriculum">Curriculum</SelectItem>
                          <SelectItem value="track">Track</SelectItem>
                          <SelectItem value="module">Module</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {cohortForm.scope_type === 'curriculum' && scopeOptions.curricula.length > 0 && (
                      <div>
                        <Label>Curriculum</Label>
                        <Select value={cohortForm.scope_id} onValueChange={v => setCohortForm({ ...cohortForm, scope_id: v })}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select curriculum" /></SelectTrigger>
                          <SelectContent>{scopeOptions.curricula.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    {cohortForm.scope_type === 'track' && scopeOptions.tracks.length > 0 && (
                      <div>
                        <Label>Track</Label>
                        <Select value={cohortForm.scope_id} onValueChange={v => setCohortForm({ ...cohortForm, scope_id: v })}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select track" /></SelectTrigger>
                          <SelectContent>{scopeOptions.tracks.map(t => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    {cohortForm.scope_type === 'module' && scopeOptions.modules.length > 0 && (
                      <div>
                        <Label>Module</Label>
                        <Select value={cohortForm.scope_id} onValueChange={v => setCohortForm({ ...cohortForm, scope_id: v })}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select module" /></SelectTrigger>
                          <SelectContent>{scopeOptions.modules.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    {/* Auto-schedule */}
                    <div className="border border-border rounded-xl p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Auto-generate schedule</Label>
                        <Switch checked={scheduleOpts.enabled} onCheckedChange={v => setScheduleOpts(o => ({ ...o, enabled: v }))} />
                      </div>
                      {scheduleOpts.enabled && (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground mb-2">Class days</p>
                            <div className="flex gap-1.5 flex-wrap">
                              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => {
                                const val = { Mon:'monday',Tue:'tuesday',Wed:'wednesday',Thu:'thursday',Fri:'friday',Sat:'saturday',Sun:'sunday' }[d]!;
                                const active = scheduleOpts.days.includes(val);
                                return (
                                  <button key={d} type="button"
                                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                                    onClick={() => setScheduleOpts(o => ({ ...o, days: active ? o.days.filter(x => x !== val) : [...o.days, val] }))}
                                  >{d}</button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div><Label className="text-xs">Start time</Label><Input type="time" value={scheduleOpts.start_time} onChange={e => setScheduleOpts(o => ({ ...o, start_time: e.target.value }))} className="mt-1" /></div>
                            <div><Label className="text-xs">End time</Label><Input type="time" value={scheduleOpts.end_time} onChange={e => setScheduleOpts(o => ({ ...o, end_time: e.target.value }))} className="mt-1" /></div>
                          </div>
                          <div>
                            <Label className="text-xs">Instructor (optional)</Label>
                            <Select value={scheduleOpts.instructor_id} onValueChange={v => setScheduleOpts(o => ({ ...o, instructor_id: v }))}>
                              <SelectTrigger className="mt-1"><SelectValue placeholder="Assign instructor" /></SelectTrigger>
                              <SelectContent>{staffList.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
                    </div>
                    <Button onClick={handleCreateCohort} disabled={savingCohort} className="w-full">{savingCohort ? 'Creating...' : 'Create Cohort'}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {COHORT_STATUSES.map(status => {
              const group = cohorts.filter(c => c.status === status);
              if (group.length === 0) return null;
              return (
                <div key={status} className="mb-5">
                  <Badge variant="outline" className={`mb-3 capitalize ${STATUS_COLOURS[status]}`}>{status}</Badge>
                  <div className="space-y-2">
                    {group.map(c => (
                      <div key={c.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                        <div>
                          <p className="font-medium">{c.cohort_label}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.start_date ? new Date(c.start_date).toLocaleDateString() : '—'} – {c.end_date ? new Date(c.end_date).toLocaleDateString() : '—'}
                          </p>
                          {c.scope_type && (
                            <p className="text-xs text-primary/70 mt-0.5 capitalize">
                              Scope: {c.scope_type}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => openCohortStudents(c)}>
                            <UserCheck className="h-3.5 w-3.5 mr-1" />Students
                          </Button>
                          <Dialog
                            open={cohortEditModal.open && cohortEditModal.cohort?.id === c.id}
                            onOpenChange={o => {
                              if (o) { setCohortForm({ cohort_label: c.cohort_label, start_date: c.start_date || '', end_date: c.end_date || '', status: c.status, scope_type: c.scope_type || '', scope_id: c.scope_id || '' }); }
                              setCohortEditModal(o ? { open: true, cohort: c } : { open: false });
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline"><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader><DialogTitle>Edit Cohort</DialogTitle></DialogHeader>
                              <div className="space-y-4 mt-2">
                                <div><Label>Label *</Label><Input value={cohortForm.cohort_label} onChange={e => setCohortForm({ ...cohortForm, cohort_label: e.target.value })} className="mt-1.5" /></div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div><Label>Start Date</Label><Input type="date" value={cohortForm.start_date} onChange={e => setCohortForm({ ...cohortForm, start_date: e.target.value })} className="mt-1.5" /></div>
                                  <div><Label>End Date</Label><Input type="date" value={cohortForm.end_date} onChange={e => setCohortForm({ ...cohortForm, end_date: e.target.value })} className="mt-1.5" /></div>
                                </div>
                                <div>
                                  <Label>Status</Label>
                                  <Select value={cohortForm.status} onValueChange={v => setCohortForm({ ...cohortForm, status: v })}>
                                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {(['upcoming', 'active', 'completed', 'archived'] as const).map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label>Scope Type</Label>
                                  <Select value={cohortForm.scope_type} onValueChange={v => setCohortForm({ ...cohortForm, scope_type: v as any, scope_id: '' })}>
                                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Entire classroom (no scope)" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="curriculum">Curriculum</SelectItem>
                                      <SelectItem value="track">Track</SelectItem>
                                      <SelectItem value="module">Module</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {cohortForm.scope_type === 'curriculum' && scopeOptions.curricula.length > 0 && (
                                  <div>
                                    <Label>Curriculum</Label>
                                    <Select value={cohortForm.scope_id} onValueChange={v => setCohortForm({ ...cohortForm, scope_id: v })}>
                                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select curriculum" /></SelectTrigger>
                                      <SelectContent>{scopeOptions.curricula.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
                                    </Select>
                                  </div>
                                )}
                                {cohortForm.scope_type === 'track' && scopeOptions.tracks.length > 0 && (
                                  <div>
                                    <Label>Track</Label>
                                    <Select value={cohortForm.scope_id} onValueChange={v => setCohortForm({ ...cohortForm, scope_id: v })}>
                                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select track" /></SelectTrigger>
                                      <SelectContent>{scopeOptions.tracks.map(t => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent>
                                    </Select>
                                  </div>
                                )}
                                {cohortForm.scope_type === 'module' && scopeOptions.modules.length > 0 && (
                                  <div>
                                    <Label>Module</Label>
                                    <Select value={cohortForm.scope_id} onValueChange={v => setCohortForm({ ...cohortForm, scope_id: v })}>
                                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select module" /></SelectTrigger>
                                      <SelectContent>{scopeOptions.modules.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}</SelectContent>
                                    </Select>
                                  </div>
                                )}
                                <Button onClick={handleUpdateCohort} disabled={savingCohort} className="w-full">{savingCohort ? 'Saving...' : 'Update Cohort'}</Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {cohorts.length === 0 && (
              <div className="text-center py-12 border-2 border-dashed border-border rounded-2xl text-muted-foreground">
                <Layers className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="font-medium">No cohorts yet</p>
                <p className="text-sm">Create the first cohort for this classroom</p>
              </div>
            )}
          </TabsContent>
        )}

        {/* SCHEDULE */}
        <TabsContent value="schedule">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold">Schedule</h3>
            <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Session</Button></DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Schedule a Session</DialogTitle></DialogHeader>
                <div className="space-y-3 mt-2">
                  <div><Label>Session Title</Label><Input value={scheduleForm.title} onChange={e => setScheduleForm({ ...scheduleForm, title: e.target.value })} className="mt-1.5" placeholder="e.g. Intro to Variables" /></div>
                  {lessonOptions.length > 0 && (
                    <div>
                      <Label>Curriculum Lesson</Label>
                      <Select
                        value={scheduleForm.lesson_id}
                        onValueChange={(v) => {
                          const lesson = lessonOptions.find((item: any) => item.lesson_id === v);
                          setScheduleForm({
                            ...scheduleForm,
                            lesson_id: v,
                            module_id: lesson?.module_id || scheduleForm.module_id,
                            title: scheduleForm.title || lesson?.lesson_title || '',
                          });
                        }}
                      >
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Link to a v2 lesson" /></SelectTrigger>
                        <SelectContent>
                          {lessonOptions.map((lesson: any) => (
                            <SelectItem key={lesson.lesson_id} value={lesson.lesson_id}>
                              {lesson.lesson_title} - {lesson.unit_title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {scopeOptions.modules.length > 0 && (
                    <div>
                      <Label>Module (optional)</Label>
                      <Select value={scheduleForm.module_id} onValueChange={v => setScheduleForm({ ...scheduleForm, module_id: v })}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Link to a module" /></SelectTrigger>
                        <SelectContent>{scopeOptions.modules.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Cohort</Label>
                      <Select value={scheduleForm.cohort_id} onValueChange={v => setScheduleForm({ ...scheduleForm, cohort_id: v })}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="All cohorts" /></SelectTrigger>
                        <SelectContent>{cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Instructor</Label>
                      <Select value={scheduleForm.instructor_id} onValueChange={v => setScheduleForm({ ...scheduleForm, instructor_id: v })}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select instructor" /></SelectTrigger>
                        <SelectContent>{staffList.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div><Label>Date *</Label><Input type="date" value={scheduleForm.scheduled_date} onChange={e => setScheduleForm({ ...scheduleForm, scheduled_date: e.target.value })} className="mt-1.5" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Start</Label><Input type="time" value={scheduleForm.start_time} onChange={e => setScheduleForm({ ...scheduleForm, start_time: e.target.value })} className="mt-1.5" /></div>
                    <div><Label>End</Label><Input type="time" value={scheduleForm.end_time} onChange={e => setScheduleForm({ ...scheduleForm, end_time: e.target.value })} className="mt-1.5" /></div>
                  </div>
                  <div><Label>Location</Label><Input value={scheduleForm.location} onChange={e => setScheduleForm({ ...scheduleForm, location: e.target.value })} className="mt-1.5" placeholder="Physical location" /></div>
                  <div><Label>Meeting Link</Label><Input value={scheduleForm.meeting_link} onChange={e => setScheduleForm({ ...scheduleForm, meeting_link: e.target.value })} className="mt-1.5" placeholder="https://..." /></div>
                  <Button onClick={handleCreateSchedule} disabled={savingSchedule} className="w-full">{savingSchedule ? 'Saving...' : 'Add to Schedule'}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <Dialog open={scheduleEditModal.open} onOpenChange={(open) => setScheduleEditModal(open ? scheduleEditModal : { open: false })}>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Edit Session</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-2">
                <div><Label>Session Title</Label><Input value={scheduleForm.title} onChange={e => setScheduleForm({ ...scheduleForm, title: e.target.value })} className="mt-1.5" placeholder="e.g. Intro to Variables" /></div>
                {lessonOptions.length > 0 && (
                  <div>
                    <Label>Curriculum Lesson</Label>
                    <Select
                      value={scheduleForm.lesson_id}
                      onValueChange={(v) => {
                        const lesson = lessonOptions.find((item: any) => item.lesson_id === v);
                        setScheduleForm({
                          ...scheduleForm,
                          lesson_id: v,
                          module_id: lesson?.module_id || scheduleForm.module_id,
                        });
                      }}
                    >
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Link to a v2 lesson" /></SelectTrigger>
                      <SelectContent>
                        {lessonOptions.map((lesson: any) => (
                          <SelectItem key={lesson.lesson_id} value={lesson.lesson_id}>
                            {lesson.lesson_title} - {lesson.unit_title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {scopeOptions.modules.length > 0 && (
                  <div>
                    <Label>Module (optional)</Label>
                    <Select value={scheduleForm.module_id} onValueChange={v => setScheduleForm({ ...scheduleForm, module_id: v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Link to a module" /></SelectTrigger>
                      <SelectContent>{scopeOptions.modules.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cohort</Label>
                    <Select value={scheduleForm.cohort_id} onValueChange={v => setScheduleForm({ ...scheduleForm, cohort_id: v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="All cohorts" /></SelectTrigger>
                      <SelectContent>{cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Instructor</Label>
                    <Select value={scheduleForm.instructor_id} onValueChange={v => setScheduleForm({ ...scheduleForm, instructor_id: v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select instructor" /></SelectTrigger>
                      <SelectContent>{staffList.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Date *</Label><Input type="date" value={scheduleForm.scheduled_date} onChange={e => setScheduleForm({ ...scheduleForm, scheduled_date: e.target.value })} className="mt-1.5" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Start</Label><Input type="time" value={scheduleForm.start_time} onChange={e => setScheduleForm({ ...scheduleForm, start_time: e.target.value })} className="mt-1.5" /></div>
                  <div><Label>End</Label><Input type="time" value={scheduleForm.end_time} onChange={e => setScheduleForm({ ...scheduleForm, end_time: e.target.value })} className="mt-1.5" /></div>
                </div>
                <div><Label>Location</Label><Input value={scheduleForm.location} onChange={e => setScheduleForm({ ...scheduleForm, location: e.target.value })} className="mt-1.5" placeholder="Physical location" /></div>
                <div><Label>Meeting Link</Label><Input value={scheduleForm.meeting_link} onChange={e => setScheduleForm({ ...scheduleForm, meeting_link: e.target.value })} className="mt-1.5" placeholder="https://..." /></div>
                <Button onClick={handleUpdateSchedule} disabled={savingSchedule} className="w-full">{savingSchedule ? 'Saving...' : 'Save Changes'}</Button>
              </div>
            </DialogContent>
          </Dialog>
          <DataTable columns={scheduleColumns} data={schedules} emptyMessage="No sessions scheduled" />
        </TabsContent>

        {/* ATTENDANCE */}
        <TabsContent value="attendance">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold">Attendance Sessions</h3>
            {(can.can_start_attendance || classroomData.staff_type === 'teaching') && !activeSession && (
              <Dialog open={sessionOpen} onOpenChange={setSessionOpen}>
                <DialogTrigger asChild><Button size="sm"><Radio className="h-4 w-4 mr-1" />Start Session</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Start Attendance Session</DialogTitle></DialogHeader>
                  <div className="space-y-3 mt-2">
                    {todaySchedules.length > 0 && (
                      <div>
                        <Label>Today's session (optional)</Label>
                        <Select value={sessionForm.schedule_id} onValueChange={v => setSessionForm({ ...sessionForm, schedule_id: v })}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Link to a scheduled session" /></SelectTrigger>
                          <SelectContent>{todaySchedules.map(s => <SelectItem key={s.id} value={s.id}>{s.start_time} – {s.end_time}{s.lessons ? ` (${s.lessons.title})` : s.title ? ` (${s.title})` : ''}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label>Cohort <span className="text-destructive">*</span></Label>
                      <Select value={sessionForm.cohort_id} onValueChange={v => setSessionForm({ ...sessionForm, cohort_id: v })}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select cohort" /></SelectTrigger>
                        <SelectContent>{cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Duration (minutes)</Label>
                      <Select value={sessionForm.duration} onValueChange={v => setSessionForm({ ...sessionForm, duration: v })}>
                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>{['10', '15', '20', '30', '45', '60'].map(d => <SelectItem key={d} value={d}>{d} minutes</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleStartAttendance} disabled={generatingSession || !sessionForm.cohort_id} className="w-full">
                      {generatingSession ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Radio className="h-4 w-4 mr-2" />}
                      {generatingSession ? 'Generating...' : 'Generate Code & Start'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <div className="space-y-2">
            {sessions.map((s: any) => (
              <div key={s.id} className="rounded-xl border border-border px-4 py-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-lg tracking-widest">{s.code}</span>
                    <Badge variant={s.status === 'open' ? 'default' : 'secondary'}>{s.status}</Badge>
                    <span className="text-sm text-muted-foreground">{s.schedules?.lessons?.title || s.schedules?.title || s.old_lessons?.title || s.cohorts?.cohort_label || '—'}</span>
                    <span className="text-xs text-muted-foreground">{s.duration_mins} min</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</span>
                    <Button size="sm" variant="outline" onClick={() => setDrillSession(s)}>
                      <Eye className="h-3.5 w-3.5 mr-1" />Records
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {sessions.length === 0 && <p className="text-center text-muted-foreground py-10">No sessions yet</p>}
          </div>
        </TabsContent>

        {/* STUDENTS */}
        {can.can_view_students && (
          <TabsContent value="students">
            <DataTable
              columns={[
                { key: 'name', header: 'Student', render: (r: any) => (r.profiles as any)?.full_name || r.full_name || '—' },
                { key: 'email', header: 'Email', render: (r: any) => (r.profiles as any)?.email || r.email || '—' },
                { key: 'status', header: 'Status', render: (r: any) => (
                  <Badge variant="outline" className={`capitalize ${STATUS_COLOURS[r.enrollment_status] || ''}`}>{r.enrollment_status}</Badge>
                )},
                { key: 'account', header: 'Account', render: (r: any) => r.user_id
                  ? <Badge variant="outline" className="bg-success/10 text-success border-success/30">Active</Badge>
                  : <Badge variant="outline" className="bg-muted text-muted-foreground">No account</Badge>
                },
              ]}
              data={students}
              searchable
              searchPlaceholder="Search students..."
              emptyMessage="No students enrolled"
            />
          </TabsContent>
        )}

        {/* ASSIGNMENTS */}
        {canViewAssignments && (
          <TabsContent value="assignments">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Assignments</h3>
              {canCreateAssignments && (
                <Dialog open={assignOpen} onOpenChange={o => { if (!o) resetAssignmentModal(); }}>
                  <DialogTrigger asChild><Button size="sm" onClick={openCreateAssignment}><Plus className="h-4 w-4 mr-1" />New Assignment</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{assignEditing ? 'Edit Assignment' : 'Create Assignment'}</DialogTitle></DialogHeader>
                    <div className="space-y-3 mt-2">
                      <div><Label>Title *</Label><Input value={assignForm.title} onChange={e => setAssignForm({ ...assignForm, title: e.target.value })} className="mt-1.5" /></div>
                      <div><Label>Instructions</Label><Textarea value={assignForm.instructions} onChange={e => setAssignForm({ ...assignForm, instructions: e.target.value })} className="mt-1.5" rows={4} /></div>
                      {unitOptions.length > 0 && (
                        <div>
                          <Label>Curriculum Unit</Label>
                          <Select value={assignForm.unit_id || '__none__'} onValueChange={v => setAssignForm({ ...assignForm, unit_id: v === '__none__' ? '' : v })}>
                            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Link to a v2 unit" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">No unit</SelectItem>
                              {unitOptions.map((unit: any) => (
                                <SelectItem key={unit.unit_id} value={unit.unit_id}>
                                  {unit.unit_title} - {unit.module_title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>Due Date</Label><Input type="datetime-local" value={assignForm.due_date} onChange={e => setAssignForm({ ...assignForm, due_date: e.target.value })} className="mt-1.5" /></div>
                        <div>
                          <Label>Total Score</Label>
                          <Input type="number" min={1} value={assignForm.max_score} onChange={e => setAssignForm({ ...assignForm, max_score: e.target.value })} placeholder="e.g. 100" className="mt-1.5" />
                        </div>
                      </div>
                      <div>
                        <Label>Cohort</Label>
                        <Select value={assignForm.cohort_id || '__all__'} onValueChange={v => setAssignForm({ ...assignForm, cohort_id: v === '__all__' ? '' : v })}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="All cohorts" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all__">All cohorts</SelectItem>
                            {cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                        <div>
                          <p className="text-sm font-medium">Publish immediately</p>
                          <p className="text-xs text-muted-foreground">Students will see this assignment right away</p>
                        </div>
                        <Switch
                          checked={assignForm.status === 'published'}
                          onCheckedChange={v => setAssignForm(f => ({ ...f, status: v ? 'published' : 'draft' }))}
                        />
                      </div>
                      <Button onClick={handleSaveAssignment} disabled={savingAssign} className="w-full">{savingAssign ? 'Saving...' : assignEditing ? 'Save Assignment' : 'Create Assignment'}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            <div className="space-y-3">
              {assignments.map((a: any) => (
                <div key={a.id} className="glass-card rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{a.title}</p>
                      {a.due_date && <p className="text-xs text-muted-foreground mt-0.5">Due: {new Date(a.due_date).toLocaleString()}</p>}
                      {a.units?.title && <p className="text-xs text-muted-foreground">Unit: {a.units.title}</p>}
                      {a.cohorts && <p className="text-xs text-muted-foreground">{a.cohorts.cohort_label}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={a.status === 'published' ? 'default' : 'secondary'} className="capitalize">{a.status}</Badge>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/staff/assignments/${a.id}`)}>
                        <Eye className="h-3.5 w-3.5 mr-1" />View
                      </Button>
                      {canCreateAssignments && (
                        <Button size="sm" variant="outline" onClick={() => openEditAssignment(a)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                        </Button>
                      )}
                      {canCreateAssignments && a.status === 'draft' && (
                        <Button size="sm" variant="outline" onClick={() => publishAssignment(a.id)}>Publish</Button>
                      )}
                      {canCreateAssignments && (
                        <Button size="sm" variant="outline" onClick={() => setSubmissionsAssignment(a)}>
                          <Eye className="h-3.5 w-3.5 mr-1" />Submissions
                        </Button>
                      )}
                      {canCreateAssignments && (
                        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => handleDeleteAssignment(a)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {assignments.length === 0 && <p className="text-center text-muted-foreground py-10">No assignments yet</p>}
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Attendance drill-down modal */}
      <Dialog open={!!drillSession} onOpenChange={o => { if (!o) setDrillSession(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Session: <span className="font-mono tracking-widest">{drillSession?.code}</span>
              {(drillSession?.schedules?.lessons?.title || drillSession?.schedules?.title || drillSession?.old_lessons?.title) && (
                <span className="font-normal text-muted-foreground ml-2">— {drillSession.schedules?.lessons?.title || drillSession.schedules?.title || drillSession.old_lessons?.title}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          {drillSession && <AttendanceDrillDown session={drillSession} canMark={Boolean(can.can_start_attendance) || classroomData.staff_type === 'teaching'} />}
        </DialogContent>
      </Dialog>

      {/* Submissions review modal */}
      <Dialog open={!!submissionsAssignment} onOpenChange={o => { if (!o) setSubmissionsAssignment(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Submissions — {submissionsAssignment?.title}</DialogTitle></DialogHeader>
          {submissionsAssignment && <SubmissionsModal assignment={submissionsAssignment} />}
        </DialogContent>
      </Dialog>

      {/* Cohort student management modal */}
      <Dialog open={cohortStudentsModal.open} onOpenChange={o => { if (!o) setCohortStudentsModal({ open: false }); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {cohortStudentsModal.cohort?.cohort_label} — Students
            </DialogTitle>
          </DialogHeader>

          {cohortStudentsLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>
          ) : (
            <div className="space-y-6 mt-1">
              <Input placeholder="Search students by name or email..." value={cohortStudentSearch} onChange={e => setCohortStudentSearch(e.target.value)} />

              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4 text-success" />
                  In this cohort ({cohortMembers.length})
                </p>
                {cohortMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-3 text-center">No students assigned yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {cohortMembers
                      .filter(m => {
                        const q = cohortStudentSearch.toLowerCase();
                        return !q || m.full_name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q);
                      })
                      .map(m => (
                        <div key={m.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                          <div>
                            <p className="text-sm font-medium">{m.full_name || '—'}</p>
                            <p className="text-xs text-muted-foreground">{m.email}</p>
                          </div>
                          <Button size="sm" variant="ghost" className="text-destructive h-7 px-2"
                            onClick={() => handleRemoveFromCohort(m.id, m.full_name || 'Student')}>
                            <UserMinus className="h-3.5 w-3.5 mr-1" />Remove
                          </Button>
                        </div>
                      ))
                    }
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <UserPlus className="h-4 w-4 text-primary" />
                  Available to add
                </p>
                {(() => {
                  const memberIds = new Set(cohortMembers.map(m => m.student_id));
                  const available = students.filter((s: any) => s.user_id && !memberIds.has(s.user_id));
                  const filtered = available.filter((s: any) => {
                    const q = cohortStudentSearch.toLowerCase();
                    const name = (s.profiles as any)?.full_name || s.full_name || '';
                    const email = (s.profiles as any)?.email || s.email || '';
                    return !q || name.toLowerCase().includes(q) || email.toLowerCase().includes(q);
                  });
                  if (filtered.length === 0) return (
                    <p className="text-sm text-muted-foreground py-3 text-center">
                      {available.length === 0 ? 'All students with accounts are already in this cohort' : 'No students match your search'}
                    </p>
                  );
                  return (
                    <div className="space-y-1.5">
                      {filtered.map((s: any) => (
                        <div key={s.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                          <div>
                            <p className="text-sm font-medium">{(s.profiles as any)?.full_name || s.full_name || '—'}</p>
                            <p className="text-xs text-muted-foreground">{(s.profiles as any)?.email || s.email}</p>
                          </div>
                          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handleAddToCohort(s)}>
                            <UserPlus className="h-3.5 w-3.5 mr-1" />Add
                          </Button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDeleteAssignment} onOpenChange={o => { if (!o) setPendingDeleteAssignment(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{pendingDeleteAssignment?.title}&quot;? This will also remove related resources and submissions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteAssignment} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
