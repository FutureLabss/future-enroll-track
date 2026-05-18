import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DataTable } from '@/components/shared/DataTable';
import { CurriculumTreeV2 } from '@/components/classroom/CurriculumTreeV2';
import { toast } from 'sonner';
import {
  Calendar, ClipboardList, Users, BookOpen, Plus, Radio, Clock, Loader2,
  LayoutList, Layers, PlayCircle, CheckCircle, XCircle, Pencil, Eye, RefreshCw,
  UserPlus, UserMinus, UserCheck,
} from 'lucide-react';

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

function AttendanceDrillDown({ session }: { session: any }) {
  const { records, absentStudents, loading } = useAttendanceSession(session.id);

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
                <span className="font-medium">{s.profiles?.full_name || '—'}</span>
                <span className="text-xs text-muted-foreground">{s.profiles?.email}</span>
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
  const [grading, setGrading] = useState<{ id: string; grade: string; feedback: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleGrade = async () => {
    if (!grading) return;
    setSaving(true);
    try {
      await gradeSubmission(grading.id, grading.grade, grading.feedback);
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
                <Textarea placeholder="Feedback (optional)" value={grading.feedback} onChange={e => setGrading({ ...grading, feedback: e.target.value })} rows={2} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleGrade} disabled={saving}>{saving ? 'Saving...' : 'Submit Grade'}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setGrading(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setGrading({ id: sub.id, grade: '', feedback: '' })}>Grade</Button>
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
  const { user } = useAuth();

  const [classroomData, setClassroomData] = useState<any>(null);
  const [permissions, setPermissions] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const { sessions, generateSession, closeSession, regenerateCode } = useAttendance(id!);
  const { assignments, createAssignment, publishAssignment } = useAssignments(id!);
  const { cohorts, refetch: refetchCohorts, createCohort, updateCohort } = useClassroomCohorts(id!);
  const { schedules, createSchedule, updateSchedule, deleteSchedule } = useSchedules(id!);

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
  const [scheduleForm, setScheduleForm] = useState({ cohort_id: '', instructor_id: '', scheduled_date: '', start_time: '09:00', end_time: '11:00', location: '', meeting_link: '' });
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Assignment state
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ title: '', instructions: '', due_date: '', cohort_id: '' });
  const [savingAssign, setSavingAssign] = useState(false);
  const [submissionsAssignment, setSubmissionsAssignment] = useState<any>(null);

  // Cohort state
  const [cohortOpen, setCohortOpen] = useState(false);
  const [cohortEditModal, setCohortEditModal] = useState<{ open: boolean; cohort?: any }>({ open: false });
  const [cohortForm, setCohortForm] = useState({ cohort_label: '', start_date: '', end_date: '', status: 'upcoming' });
  const [savingCohort, setSavingCohort] = useState(false);

  // Cohort student management
  const [cohortStudentsModal, setCohortStudentsModal] = useState<{ open: boolean; cohort?: any }>({ open: false });
  const [cohortMembers, setCohortMembers] = useState<any[]>([]);
  const [cohortStudentsLoading, setCohortStudentsLoading] = useState(false);
  const [cohortStudentSearch, setCohortStudentSearch] = useState('');

  useEffect(() => { if (id && user) loadData(); }, [id, user]);

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

  const loadData = async () => {
    const [csRes, staffRes] = await Promise.all([
      supabase.from('classroom_staff')
        .select('*, classrooms(*, programs(program_name)), classroom_permissions(*)')
        .eq('classroom_id', id).eq('user_id', user!.id).single(),
      supabase.from('staff').select('id, full_name').eq('active', true),
    ]);
    setClassroomData(csRes.data);
    setPermissions(csRes.data?.classroom_permissions);
    setStaffList(staffRes.data || []);

    const programId = csRes.data?.classrooms?.program_id;
    if (programId) {
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('id, full_name, email, user_id, enrollment_status, profiles:user_id(full_name, email)')
        .eq('program_id', programId)
        .in('enrollment_status', ['active', 'pending']);
      setStudents(enrollments || []);
    }

    setDataLoading(false);
  };

  const handleStartAttendance = async () => {
    setGeneratingSession(true);
    try {
      await generateSession(null, sessionForm.cohort_id || null, parseInt(sessionForm.duration));
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
      setScheduleForm({ cohort_id: '', instructor_id: '', scheduled_date: '', start_time: '09:00', end_time: '11:00', location: '', meeting_link: '' });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleScheduleStatus = async (scheduleId: string, status: 'scheduled' | 'completed' | 'cancelled') => {
    try {
      await updateSchedule(scheduleId, { status });
      toast.success(`Schedule ${status}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleCreateAssignment = async () => {
    if (!assignForm.title) { toast.error('Title required'); return; }
    setSavingAssign(true);
    try {
      await createAssignment({ title: assignForm.title, instructions: assignForm.instructions || null, due_date: assignForm.due_date || null, cohort_id: assignForm.cohort_id || null, status: 'draft' });
      toast.success('Assignment created (draft)');
      setAssignOpen(false);
      setAssignForm({ title: '', instructions: '', due_date: '', cohort_id: '' });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingAssign(false);
    }
  };

  const handleCreateCohort = async () => {
    if (!cohortForm.cohort_label.trim()) { toast.error('Cohort label required'); return; }
    setSavingCohort(true);
    try {
      const cls = classroomData?.classrooms;
      await createCohort({ ...cohortForm, program_id: cls?.program_id });
      toast.success('Cohort created');
      setCohortOpen(false);
      setCohortForm({ cohort_label: '', start_date: '', end_date: '', status: 'upcoming' });
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
    const { data } = await supabase
      .from('cohort_students')
      .select('id, student_id, status, profiles:student_id(full_name, email)')
      .eq('cohort_id', cohort.id);
    setCohortMembers(data || []);
    setCohortStudentsLoading(false);
  };

  const handleAddToCohort = async (student: any) => {
    const cohort = cohortStudentsModal.cohort;
    const { error } = await supabase.from('cohort_students').insert({
      cohort_id: cohort.id,
      student_id: student.user_id,
      enrollment_id: student.id || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`${(student.profiles as any)?.full_name || student.full_name || 'Student'} added to cohort`);
    openCohortStudents(cohort);
  };

  const handleRemoveFromCohort = async (memberId: string, name: string) => {
    const cohort = cohortStudentsModal.cohort;
    const { error } = await supabase.from('cohort_students').delete().eq('id', memberId);
    if (error) { toast.error(error.message); return; }
    toast.success(`${name} removed from cohort`);
    openCohortStudents(cohort);
  };

  if (dataLoading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  if (!classroomData) return <div className="text-center py-20 text-muted-foreground">Classroom not found or access denied.</div>;

  const cls = classroomData.classrooms;
  const can = permissions || {};
  const today = new Date().toISOString().split('T')[0];
  const todaySchedules = schedules.filter(s => s.scheduled_date === today && s.status === 'scheduled');

  const scheduleColumns = [
    { key: 'date', header: 'Date', render: (r: any) => new Date(r.scheduled_date + 'T00:00:00').toLocaleDateString() },
    { key: 'lesson', header: 'Lesson', render: (r: any) => r.lessons?.title || <span className="text-muted-foreground text-xs">No lesson linked</span> },
    { key: 'time', header: 'Time', render: (r: any) => `${r.start_time} – ${r.end_time}` },
    { key: 'instructor', header: 'Instructor', render: (r: any) => r.staff?.full_name || '—' },
    { key: 'cohort', header: 'Cohort', render: (r: any) => r.cohorts?.cohort_label || 'All' },
    { key: 'status', header: 'Status', render: (r: any) => (
      <Badge variant="outline" className={`capitalize ${STATUS_COLOURS[r.status] || ''}`}>{r.status}</Badge>
    )},
    { key: 'actions', header: '', render: (r: any) => (
      <div className="flex gap-1">
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
  ];

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
          {can.can_create_assignments && <TabsTrigger value="assignments"><BookOpen className="h-4 w-4 mr-1.5" />Assignments</TabsTrigger>}
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
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => openCohortStudents(c)}>
                            <UserCheck className="h-3.5 w-3.5 mr-1" />Students
                          </Button>
                          <Dialog
                            open={cohortEditModal.open && cohortEditModal.cohort?.id === c.id}
                            onOpenChange={o => {
                              if (o) { setCohortForm({ cohort_label: c.cohort_label, start_date: c.start_date || '', end_date: c.end_date || '', status: c.status }); }
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
          <DataTable columns={scheduleColumns} data={schedules} emptyMessage="No sessions scheduled" />
        </TabsContent>

        {/* ATTENDANCE */}
        <TabsContent value="attendance">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold">Attendance Sessions</h3>
            {can.can_start_attendance && !activeSession && (
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
                          <SelectContent>{todaySchedules.map(s => <SelectItem key={s.id} value={s.id}>{s.start_time} – {s.end_time}{s.lessons ? ` (${s.lessons.title})` : ''}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label>Cohort (optional)</Label>
                      <Select value={sessionForm.cohort_id} onValueChange={v => setSessionForm({ ...sessionForm, cohort_id: v })}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="All students" /></SelectTrigger>
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
                    <Button onClick={handleStartAttendance} disabled={generatingSession} className="w-full">
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
                    <span className="text-sm text-muted-foreground">{s.old_lessons?.title || s.cohorts?.cohort_label || '—'}</span>
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
        {can.can_create_assignments && (
          <TabsContent value="assignments">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Assignments</h3>
              <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New Assignment</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Create Assignment</DialogTitle></DialogHeader>
                  <div className="space-y-3 mt-2">
                    <div><Label>Title *</Label><Input value={assignForm.title} onChange={e => setAssignForm({ ...assignForm, title: e.target.value })} className="mt-1.5" /></div>
                    <div><Label>Instructions</Label><Textarea value={assignForm.instructions} onChange={e => setAssignForm({ ...assignForm, instructions: e.target.value })} className="mt-1.5" rows={4} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Due Date</Label><Input type="datetime-local" value={assignForm.due_date} onChange={e => setAssignForm({ ...assignForm, due_date: e.target.value })} className="mt-1.5" /></div>
                      <div>
                        <Label>Cohort</Label>
                        <Select value={assignForm.cohort_id} onValueChange={v => setAssignForm({ ...assignForm, cohort_id: v })}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="All cohorts" /></SelectTrigger>
                          <SelectContent>{cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button onClick={handleCreateAssignment} disabled={savingAssign} className="w-full">{savingAssign ? 'Saving...' : 'Create (Draft)'}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-3">
              {assignments.map((a: any) => (
                <div key={a.id} className="glass-card rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{a.title}</p>
                      {a.due_date && <p className="text-xs text-muted-foreground mt-0.5">Due: {new Date(a.due_date).toLocaleString()}</p>}
                      {a.cohorts && <p className="text-xs text-muted-foreground">{a.cohorts.cohort_label}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={a.status === 'published' ? 'default' : 'secondary'} className="capitalize">{a.status}</Badge>
                      {a.status === 'draft' && (
                        <Button size="sm" variant="outline" onClick={() => publishAssignment(a.id)}>Publish</Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setSubmissionsAssignment(a)}>
                        <Eye className="h-3.5 w-3.5 mr-1" />Submissions
                      </Button>
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
              {drillSession?.old_lessons?.title && <span className="font-normal text-muted-foreground ml-2">— {drillSession.old_lessons.title}</span>}
            </DialogTitle>
          </DialogHeader>
          {drillSession && <AttendanceDrillDown session={drillSession} />}
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
                        return !q || m.profiles?.full_name?.toLowerCase().includes(q) || m.profiles?.email?.toLowerCase().includes(q);
                      })
                      .map(m => (
                        <div key={m.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                          <div>
                            <p className="text-sm font-medium">{m.profiles?.full_name || '—'}</p>
                            <p className="text-xs text-muted-foreground">{m.profiles?.email}</p>
                          </div>
                          <Button size="sm" variant="ghost" className="text-destructive h-7 px-2"
                            onClick={() => handleRemoveFromCohort(m.id, m.profiles?.full_name || 'Student')}>
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
    </div>
  );
}
