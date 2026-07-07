import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAttendanceSession } from '@/hooks/useAttendance';
import { useAuth } from '@/hooks/useAuth';
import { usePresentations } from '@/hooks/usePresentations';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  Archive,
  BarChart2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Eye,
  GraduationCap,
  Loader2,
  Pencil,
  Presentation,
  RefreshCw,
  RotateCcw,
  School,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { CohortAnalyticsTab } from '@/components/cohort/CohortAnalyticsTab';

const GRADUATION_COLOURS: Record<string, string> = {
  graduated: 'bg-success/15 text-success border-success/30',
  not_graduated: 'bg-destructive/15 text-destructive border-destructive/30',
  pending: 'bg-muted text-muted-foreground border-muted',
};

function SchedulePresentationForm({ classroomId, cohortId, onSaved, createPresentation }: { classroomId: string; cohortId: string; onSaved: () => void; createPresentation: ReturnType<typeof usePresentations>['createPresentation'] }) {
  const [form, setForm] = useState({
    title: '',
    instructions: '',
    scheduled_date: '',
    start_time: '',
    end_time: '',
    location: '',
    meeting_link: '',
    max_score: '100',
    pass_score: '50',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!form.scheduled_date || !form.start_time || !form.end_time) { toast.error('Date, start time and end time are required'); return; }
    setSaving(true);
    try {
      await createPresentation({
        classroomId,
        cohortId,
        title: form.title.trim(),
        instructions: form.instructions,
        scheduled_date: form.scheduled_date,
        start_time: form.start_time,
        end_time: form.end_time,
        location: form.location.trim() || undefined,
        meeting_link: form.meeting_link.trim() || undefined,
        max_score: Number(form.max_score) || 100,
        pass_score: Number(form.pass_score) || 50,
      });
      toast.success('Presentation scheduled — students have been notified');
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 mt-2">
      <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="mt-1.5" placeholder="e.g. Capstone Project Presentations" /></div>
      <div>
        <Label>Project Brief / Instructions</Label>
        <Textarea value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} rows={3} className="mt-1.5" placeholder="What students should be ready to present" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>Date *</Label><Input type="date" value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })} className="mt-1.5" /></div>
        <div><Label>Start *</Label><Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="mt-1.5" /></div>
        <div><Label>End *</Label><Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="mt-1.5" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Location</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="mt-1.5" placeholder="Optional" /></div>
        <div><Label>Meeting Link</Label><Input value={form.meeting_link} onChange={e => setForm({ ...form, meeting_link: e.target.value })} className="mt-1.5" placeholder="Optional" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Max Score</Label><Input type="number" min="1" value={form.max_score} onChange={e => setForm({ ...form, max_score: e.target.value })} className="mt-1.5" /></div>
        <div><Label>Pass Score</Label><Input type="number" min="0" value={form.pass_score} onChange={e => setForm({ ...form, pass_score: e.target.value })} className="mt-1.5" /></div>
      </div>
      <Button onClick={save} disabled={saving} className="w-full">{saving ? 'Scheduling...' : 'Schedule & Notify Cohort'}</Button>
    </div>
  );
}

function GraduationOverrideForm({ member, onSaved }: { member: any; onSaved: () => void }) {
  const [status, setStatus] = useState<string>(member.graduation_override || 'graduated');
  const [reason, setReason] = useState(member.graduation_override_reason || '');
  const [saving, setSaving] = useState(false);

  const save = async (clear: boolean) => {
    setSaving(true);
    const { error } = await supabase.rpc('set_graduation_override', {
      p_cohort_student_id: member.id,
      p_status: clear ? null : status,
      p_reason: clear ? null : reason.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(clear ? 'Override cleared' : 'Graduation status overridden');
    onSaved();
  };

  return (
    <div className="space-y-4 mt-2">
      <p className="text-sm text-muted-foreground">
        Auto-computed status: <Badge variant="outline" className={`capitalize ${GRADUATION_COLOURS[member.auto_graduation_status] || ''}`}>{member.auto_graduation_status}</Badge>
      </p>
      <div>
        <Label>Override Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="graduated">Graduated</SelectItem>
            <SelectItem value="not_graduated">Not Graduated</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Reason</Label>
        <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="mt-1.5" placeholder="Why this override was necessary" />
      </div>
      <div className="flex gap-2">
        <Button onClick={() => save(false)} disabled={saving} className="flex-1">{saving ? 'Saving...' : 'Save Override'}</Button>
        {member.graduation_override && (
          <Button variant="outline" onClick={() => save(true)} disabled={saving}>Clear Override</Button>
        )}
      </div>
    </div>
  );
}

const COHORT_STATUSES = ['upcoming', 'active', 'completed', 'archived'] as const;
const STATUS_COLOURS: Record<string, string> = {
  upcoming: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  active: 'bg-success/15 text-success border-success/30',
  completed: 'bg-muted text-muted-foreground border-muted',
  archived: 'bg-muted/50 text-muted-foreground/60 border-muted',
  open: 'bg-success/15 text-success border-success/30',
  closed: 'bg-muted text-muted-foreground border-muted',
  draft: 'bg-warning/15 text-warning border-warning/30',
  published: 'bg-success/15 text-success border-success/30',
};

const ENROLL_COLOURS: Record<string, string> = {
  active: 'bg-success/15 text-success border-success/30',
  pending: 'bg-warning/15 text-warning border-warning/30',
  overdue: 'bg-destructive/15 text-destructive border-destructive/30',
  cancelled: 'bg-destructive/15 text-destructive border-destructive/30',
  completed: 'bg-muted text-muted-foreground border-muted',
};

const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

function CohortEditForm({ cohort, onSaved }: { cohort: any; onSaved: () => void }) {
  const [form, setForm] = useState({
    cohort_label: cohort.cohort_label || '',
    start_date: cohort.start_date || '',
    end_date: cohort.end_date || '',
    status: cohort.status || 'upcoming',
    capacity: cohort.capacity?.toString() || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.cohort_label.trim()) { toast.error('Cohort label is required'); return; }
    setSaving(true);
    const { error } = await supabase.from('cohorts').update({
      cohort_label: form.cohort_label.trim(),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      status: form.status,
      capacity: form.capacity ? Number(form.capacity) : null,
    }).eq('id', cohort.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Cohort updated');
    onSaved();
  };

  return (
    <div className="space-y-4 mt-2">
      <div><Label>Cohort Label *</Label><Input value={form.cohort_label} onChange={e => setForm({ ...form, cohort_label: e.target.value })} className="mt-1.5" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="mt-1.5" /></div>
        <div><Label>End Date</Label><Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="mt-1.5" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>{COHORT_STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Capacity</Label><Input type="number" min="1" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} className="mt-1.5" placeholder="Optional" /></div>
      </div>
      <Button onClick={save} disabled={saving} className="w-full">{saving ? 'Saving...' : 'Save Changes'}</Button>
    </div>
  );
}

function ManageStudentsDialog({ cohort, classroomId, onChanged }: { cohort: any; classroomId: string; onChanged: () => void }) {
  const [enrolled, setEnrolled] = useState<any[]>([]);
  const [memberRows, setMemberRows] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: students }, { data: members }] = await Promise.all([
      supabase.rpc('get_classroom_students', { p_classroom_id: classroomId }),
      supabase.rpc('get_cohort_members', { p_cohort_id: cohort.id }),
    ]);
    setEnrolled(students || []);
    setMemberRows(new Map((members || []).map((row: any) => [row.student_id, row.id])));
    setLoading(false);
  };

  useEffect(() => { load(); }, [cohort.id, classroomId]);

  const toggle = async (student: any) => {
    if (!student.user_id) return;
    const isMember = memberRows.has(student.user_id);
    if (!isMember && cohort.capacity && memberRows.size >= cohort.capacity) {
      toast.error('This cohort is already at capacity');
      return;
    }

    setBusy(student.user_id);
    try {
      const rowId = memberRows.get(student.user_id);
      if (rowId) {
        const { error } = await supabase.rpc('remove_student_from_cohort', { p_id: rowId });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('add_student_to_cohort', {
          p_cohort_id: cohort.id,
          p_student_id: student.user_id,
          p_enrollment_id: student.id,
        });
        if (error) throw error;
      }
      await load();
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 mt-2 max-h-[60vh] overflow-y-auto">
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : enrolled.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No classroom students available.</p>
      ) : (
        enrolled.map(student => {
          const inCohort = memberRows.has(student.user_id);
          return (
            <div key={student.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{student.full_name || '—'}</p>
                <p className="text-xs text-muted-foreground truncate">{student.email}</p>
              </div>
              {!student.user_id ? (
                <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5">No account</span>
              ) : (
                <Button size="sm" variant={inCohort ? 'destructive' : 'outline'} className="h-7 text-xs" disabled={busy === student.user_id} onClick={() => toggle(student)}>
                  {busy === student.user_id ? <Loader2 className="h-3 w-3 animate-spin" /> : inCohort ? <><UserMinus className="h-3 w-3 mr-1" />Remove</> : <><UserPlus className="h-3 w-3 mr-1" />Add</>}
                </Button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

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

export default function CohortDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const queryKey = ['cohort-detail', id];
  const { isAdmin } = useAuth();

  const [editOpen, setEditOpen] = useState(false);
  const [studentsOpen, setStudentsOpen] = useState(false);
  const [drillSession, setDrillSession] = useState<any>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [presentationDialogOpen, setPresentationDialogOpen] = useState(false);
  const [overrideMember, setOverrideMember] = useState<any>(null);
  const [recomputingGraduation, setRecomputingGraduation] = useState(false);

  const { data: pageData, isLoading: loading } = useQuery({
    queryKey,
    queryFn: async () => {
      // Two waves instead of four: sessions/assignments only filter by cohort
      // id so they don't need the cohort row first, and the schedules lookup
      // embeds its lessons join instead of a fourth round trip
      const [cRes, mRes, sessionsRes, assignmentsRes] = await Promise.all([
        supabase.from('cohorts').select('*, programs(program_name), classrooms(id, name, location)').eq('id', id!).single(),
        supabase.from('cohort_students').select('id, student_id, enrollment_id, auto_graduation_status, graduation_override, graduation_override_reason, final_graduation_status, enrollments(enrollment_status, total_amount, amount_paid, outstanding_balance)').eq('cohort_id', id!),
        supabase.from('attendance_sessions').select('id, code, status, created_at, lesson_id, schedule_id').eq('cohort_id', id!).order('created_at', { ascending: false }),
        supabase.from('assignments').select('id, title, unit_id, lesson_id, due_date, status, cohort_id, classroom_id, created_at').eq('cohort_id', id!).order('created_at', { ascending: false }),
      ]);
      const cohortRow = cRes.data;
      const rows = mRes.data || [];
      const sessionRows = (sessionsRes.data || []) as any[];
      const assignmentRows = (assignmentsRes.data || []) as any[];

      const sessionLessonIds = [...new Set(sessionRows.map((r) => r.lesson_id).filter(Boolean))];
      const sessionScheduleIds = [...new Set(sessionRows.map((r) => r.schedule_id).filter(Boolean))];
      const assignmentUnitIds = [...new Set(assignmentRows.map((r) => r.unit_id).filter(Boolean))];
      const assignmentLessonIds = [...new Set(assignmentRows.map((r) => r.lesson_id).filter(Boolean))];
      const studentIds = [...new Set(rows.map((r: any) => r.student_id).filter(Boolean))];

      const [oldLessonsForSessions, schedulesData, unitsData, oldLessonsForAssignments, profilesData] = await Promise.all([
        sessionLessonIds.length ? supabase.from('old_lessons').select('id, title, lesson_date').in('id', sessionLessonIds) : { data: [] as any[] },
        sessionScheduleIds.length ? supabase.from('schedules').select('id, title, scheduled_date, lesson_id, lessons(id, title)').in('id', sessionScheduleIds) : { data: [] as any[] },
        assignmentUnitIds.length ? supabase.from('units').select('id, title').in('id', assignmentUnitIds) : { data: [] as any[] },
        assignmentLessonIds.length ? supabase.from('old_lessons').select('id, title, lesson_date').in('id', assignmentLessonIds) : { data: [] as any[] },
        studentIds.length ? supabase.from('profiles').select('user_id, full_name, email').in('user_id', studentIds) : { data: [] as any[] },
      ]);

      const sessionOldLessonsById = new Map((oldLessonsForSessions.data || []).map((r: any) => [r.id, r]));
      const schedulesById = new Map(((schedulesData.data || []) as any[]).map((r) => [r.id, r]));
      const unitsById = new Map((unitsData.data || []).map((r: any) => [r.id, r]));
      const assignmentOldLessonsById = new Map((oldLessonsForAssignments.data || []).map((r: any) => [r.id, r]));
      const profileMap = new Map((profilesData.data || []).map((p: any) => [p.user_id, p]));

      const enrichedSessions = sessionRows.map((r) => ({
        ...r,
        old_lessons: r.lesson_id ? sessionOldLessonsById.get(r.lesson_id) || null : null,
        schedules: (r.schedule_id ? schedulesById.get(r.schedule_id) : null) ?? null,
      }));
      const enrichedAssignments = assignmentRows.map((r) => ({
        ...r,
        units: r.unit_id ? unitsById.get(r.unit_id) || null : null,
        old_lessons: r.lesson_id ? assignmentOldLessonsById.get(r.lesson_id) || null : null,
      }));

      return {
        cohort: cohortRow,
        members: rows.map((r: any) => ({ ...r, profile: profileMap.get(r.student_id) || null })),
        attendanceSessions: enrichedSessions,
        assignments: enrichedAssignments,
      };
    },
    enabled: !!id,
  });

  const cohort = pageData?.cohort ?? null;
  const members = pageData?.members ?? [];
  const attendanceSessions = pageData?.attendanceSessions ?? [];
  const assignments = pageData?.assignments ?? [];
  const load = () => queryClient.invalidateQueries({ queryKey });

  const updateStatus = async (status: string) => {
    setStatusBusy(true);
    const { error } = await supabase.from('cohorts').update({ status }).eq('id', id!);
    setStatusBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Cohort marked ${status}`);
    load();
  };

  const doDelete = async () => {
    const { error } = await supabase.from('cohorts').delete().eq('id', id!);
    if (error) { toast.error(error.message); return; }
    toast.success('Cohort deleted');
    navigate(cohort.classrooms?.id ? `/admin/classrooms/${cohort.classrooms.id}` : '/admin/cohorts');
  };

  const deleteAttendanceSession = useCallback(async (sessionId: string) => {
    const { error } = await supabase.from('attendance_sessions').delete().eq('id', sessionId);
    if (error) { toast.error(error.message); return; }
    toast.success('Attendance session deleted');
    load();
  }, []);

  const publishAssignment = async (assignmentId: string) => {
    const { error } = await supabase.from('assignments').update({ status: 'published' }).eq('id', assignmentId);
    if (error) { toast.error(error.message); return; }
    toast.success('Assignment published');
    load();
  };

  const { presentations, createPresentation, deletePresentation } = usePresentations(cohort?.classroom_id || '', id || '');

  const recomputeGraduation = async () => {
    setRecomputingGraduation(true);
    const { error } = await supabase.rpc('compute_cohort_graduation', { p_cohort_id: id! });
    setRecomputingGraduation(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Graduation status recomputed');
    load();
  };

  const stats = useMemo(() => {
    const totalPaid = members.reduce((sum, m) => sum + Number(m.enrollments?.amount_paid || 0), 0);
    const totalOutstanding = members.reduce((sum, m) => sum + Number(m.enrollments?.outstanding_balance || 0), 0);
    const attendanceOpen = attendanceSessions.filter(s => s.status === 'open').length;

    return [
      { label: 'Students', value: members.length, icon: Users },
      { label: 'Capacity', value: cohort?.capacity ? `${members.length}/${cohort.capacity}` : 'Open', icon: GraduationCap },
      { label: 'Active Students', value: members.filter(m => m.enrollments?.enrollment_status === 'active').length, icon: UserPlus },
      { label: 'Attendance', value: attendanceSessions.length, icon: ClipboardList, hint: attendanceOpen ? `${attendanceOpen} open` : undefined },
      { label: 'Assignments', value: assignments.length, icon: ClipboardCheck },
      { label: 'Outstanding', value: formatCurrency(totalOutstanding), icon: CalendarDays },
      { label: 'Collected', value: formatCurrency(totalPaid), icon: School },
    ];
  }, [members, attendanceSessions, assignments, cohort]);

  const studentColumns = useMemo(() => [
    { key: 'name', header: 'Student', render: (r: any) => r.profile?.full_name || <span className="text-muted-foreground text-sm">—</span> },
    { key: 'email', header: 'Email', render: (r: any) => r.profile?.email || '—' },
    {
      key: 'enrollment_status', header: 'Status',
      render: (r: any) => r.enrollments?.enrollment_status
        ? <Badge variant="outline" className={`capitalize ${ENROLL_COLOURS[r.enrollments.enrollment_status] || ''}`}>{r.enrollments.enrollment_status}</Badge>
        : <span className="text-muted-foreground text-sm">—</span>,
    },
    { key: 'amount_paid', header: 'Paid', render: (r: any) => r.enrollments ? formatCurrency(Number(r.enrollments.amount_paid || 0)) : '—' },
    { key: 'outstanding', header: 'Outstanding', render: (r: any) => r.enrollments ? formatCurrency(Number(r.enrollments.outstanding_balance || 0)) : '—' },
    {
      key: 'graduation', header: 'Graduation',
      render: (r: any) => (
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={`capitalize ${GRADUATION_COLOURS[r.final_graduation_status] || ''}`}>
            {(r.final_graduation_status || 'pending').replace('_', ' ')}
          </Badge>
          {r.graduation_override && <span className="text-xs text-muted-foreground" title={r.graduation_override_reason || ''}>(overridden)</span>}
        </div>
      ),
    },
    ...(isAdmin ? [{
      key: 'graduation_actions', header: '',
      render: (r: any) => (
        <Button size="sm" variant="ghost" onClick={() => setOverrideMember(r)}>
          <Pencil className="h-3.5 w-3.5 mr-1" />Override
        </Button>
      ),
    }] : []),
  ], [isAdmin]);

  const presentationColumns = useMemo(() => [
    { key: 'title', header: 'Presentation', render: (r: any) => <span className="font-medium">{r.title}</span> },
    { key: 'date', header: 'Date', render: (r: any) => r.schedules?.scheduled_date ? `${new Date(`${r.schedules.scheduled_date}T00:00:00`).toLocaleDateString('en-NG')} · ${r.schedules.start_time}–${r.schedules.end_time}` : '—' },
    { key: 'pass_score', header: 'Pass Score', render: (r: any) => `${r.pass_score} / ${r.max_score}` },
    { key: 'status', header: 'Status', render: (r: any) => <Badge variant="outline" className={`capitalize ${STATUS_COLOURS[r.status] || ''}`}>{r.status}</Badge> },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={(event) => event.stopPropagation()}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent onClick={(event) => event.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Presentation?</AlertDialogTitle>
              <AlertDialogDescription>This will permanently delete "{r.title}" and all its grades. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deletePresentation(r.schedule_id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ),
    },
  ], []);

  const attendanceColumns = useMemo(() => [
    { key: 'code', header: 'Code', render: (r: any) => <span className="font-mono font-semibold tracking-wider">{r.code}</span> },
    { key: 'lesson', header: 'Lesson', render: (r: any) => r.schedules?.lessons?.title || r.schedules?.title || r.old_lessons?.title || '—' },
    { key: 'status', header: 'Status', render: (r: any) => <Badge variant="outline" className={STATUS_COLOURS[r.status] || ''}>{r.status}</Badge> },
    { key: 'created_at', header: 'Created', render: (r: any) => new Date(r.created_at).toLocaleString() },
    { key: 'actions', header: '', render: (r: any) => (
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={() => setDrillSession(r)}>
          <Eye className="h-4 w-4 mr-1" />View
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Attendance Session?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete session <span className="font-mono font-semibold">{r.code}</span> and all its attendance records. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteAttendanceSession(r.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )},
  ], [deleteAttendanceSession]);

  const assignmentColumns = useMemo(() => [
    { key: 'title', header: 'Assignment', render: (r: any) => <span className="font-medium">{r.title}</span> },
    { key: 'unit', header: 'Unit', render: (r: any) => r.units?.title || r.old_lessons?.title || '—' },
    { key: 'due_date', header: 'Due', render: (r: any) => r.due_date ? new Date(r.due_date).toLocaleDateString('en-NG') : '—' },
    { key: 'status', header: 'Status', render: (r: any) => <Badge variant="outline" className={STATUS_COLOURS[r.status] || ''}>{r.status}</Badge> },
    { key: 'actions', header: '', render: (r: any) => r.status !== 'published' ? (
      <Button size="sm" variant="outline" onClick={() => publishAssignment(r.id)}>
        <ClipboardCheck className="h-3.5 w-3.5 mr-1" />Publish
      </Button>
    ) : null },
  ], []);

  // Early returns must stay below every hook — returning during loading with
  // the columns memoized above changes the hook count between renders
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  if (!cohort) return <div className="text-center py-20 text-muted-foreground">Cohort not found.</div>;

  return (
    <div>
      <PageHeader
        title={cohort.cohort_label}
        description={cohort.programs?.program_name || 'No program'}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate(cohort.classrooms?.id ? `/admin/classrooms/${cohort.classrooms.id}` : '/admin/cohorts')}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild><Button variant="outline"><Pencil className="h-4 w-4 mr-2" />Edit</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Edit Cohort</DialogTitle></DialogHeader>
                <CohortEditForm cohort={cohort} onSaved={() => { setEditOpen(false); load(); }} />
              </DialogContent>
            </Dialog>
            {cohort.status !== 'archived' ? (
              <Button variant="outline" disabled={statusBusy} onClick={() => updateStatus('archived')}>
                <Archive className="h-4 w-4 mr-2" />Archive
              </Button>
            ) : (
              <Button variant="outline" disabled={statusBusy} onClick={() => updateStatus('active')}>
                <RotateCcw className="h-4 w-4 mr-2" />Reactivate
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Cohort?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {members.length > 0
                      ? `This cohort has ${members.length} student(s). Archive it instead unless you are sure. This cannot be undone.`
                      : `Delete cohort "${cohort.cohort_label}"? This cannot be undone.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Badge variant="outline" className={`capitalize ${STATUS_COLOURS[cohort.status] || ''}`}>{cohort.status}</Badge>
        {cohort.scope_type && <Badge variant="outline" className="capitalize text-primary/80">Scope: {cohort.scope_type}</Badge>}
        <span className="text-sm text-muted-foreground">
          {cohort.start_date ? new Date(cohort.start_date).toLocaleDateString('en-NG') : 'No start date'} – {cohort.end_date ? new Date(cohort.end_date).toLocaleDateString('en-NG') : 'ongoing'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, hint }) => (
          <div key={label} className="glass-card rounded-xl p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="text-xl font-bold font-heading mt-2">{value}</div>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
        ))}
      </div>

      <Tabs defaultValue="students">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="students"><GraduationCap className="h-4 w-4 mr-1.5" />Students ({members.length})</TabsTrigger>
          <TabsTrigger value="attendance"><ClipboardList className="h-4 w-4 mr-1.5" />Attendance ({attendanceSessions.length})</TabsTrigger>
          <TabsTrigger value="assignments"><ClipboardCheck className="h-4 w-4 mr-1.5" />Assignments ({assignments.length})</TabsTrigger>
          <TabsTrigger value="presentations"><Presentation className="h-4 w-4 mr-1.5" />Presentations ({presentations.length})</TabsTrigger>
          {cohort.classrooms && <TabsTrigger value="classroom"><School className="h-4 w-4 mr-1.5" />Classroom</TabsTrigger>}
          <TabsTrigger value="analytics"><BarChart2 className="h-4 w-4 mr-1.5" />Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="students">
          <div className="flex items-center justify-end gap-2 mb-4">
            {isAdmin && (
              <Button size="sm" variant="outline" disabled={recomputingGraduation} onClick={recomputeGraduation}>
                <RefreshCw className="h-4 w-4 mr-1.5" />Recompute Graduation
              </Button>
            )}
            <Dialog open={studentsOpen} onOpenChange={setStudentsOpen}>
              <DialogTrigger asChild><Button size="sm"><UserPlus className="h-4 w-4 mr-1.5" />Manage Students</Button></DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Manage Students</DialogTitle></DialogHeader>
                <ManageStudentsDialog cohort={cohort} classroomId={cohort.classroom_id} onChanged={load} />
              </DialogContent>
            </Dialog>
          </div>
          <DataTable columns={studentColumns} data={members} searchable searchPlaceholder="Search students..." emptyMessage="No students in this cohort" />
        </TabsContent>

        <TabsContent value="attendance">
          <DataTable columns={attendanceColumns} data={attendanceSessions} searchable searchPlaceholder="Search attendance..." emptyMessage="No attendance sessions for this cohort" />
        </TabsContent>

        <TabsContent value="assignments">
          <DataTable columns={assignmentColumns} data={assignments} searchable searchPlaceholder="Search assignments..." emptyMessage="No assignments for this cohort" />
        </TabsContent>

        <TabsContent value="presentations">
          <div className="flex items-center justify-end mb-4">
            <Dialog open={presentationDialogOpen} onOpenChange={setPresentationDialogOpen}>
              <DialogTrigger asChild><Button size="sm"><Presentation className="h-4 w-4 mr-1.5" />Schedule Presentation</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Schedule Presentation</DialogTitle></DialogHeader>
                <SchedulePresentationForm
                  classroomId={cohort.classroom_id}
                  cohortId={id!}
                  createPresentation={createPresentation}
                  onSaved={() => setPresentationDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </div>
          <DataTable
            columns={presentationColumns}
            data={presentations}
            searchable
            searchPlaceholder="Search presentations..."
            emptyMessage="No presentations scheduled for this cohort"
            onRowClick={(row: any) => navigate(`/admin/presentations/${row.id}`)}
          />
        </TabsContent>

        {cohort.classrooms && (
          <TabsContent value="classroom">
            <div className="glass-card rounded-xl p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{cohort.classrooms.name}</p>
                  {cohort.classrooms.location && <p className="text-sm text-muted-foreground mt-0.5">{cohort.classrooms.location}</p>}
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate(`/admin/classrooms/${cohort.classrooms.id}`)}>
                  <School className="h-3.5 w-3.5 mr-1.5" />View Classroom
                </Button>
              </div>
            </div>
          </TabsContent>
        )}

        <TabsContent value="analytics">
          <CohortAnalyticsTab cohortId={id!} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!drillSession} onOpenChange={o => { if (!o) setDrillSession(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Attendance — <span className="font-mono">{drillSession?.code}</span>
              {(drillSession?.schedules?.lessons?.title || drillSession?.schedules?.title || drillSession?.old_lessons?.title) && (
                <span className="font-normal text-muted-foreground ml-2">— {drillSession?.schedules?.lessons?.title || drillSession?.schedules?.title || drillSession?.old_lessons?.title}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          {drillSession && <AttendanceDrillDown session={drillSession} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!overrideMember} onOpenChange={o => { if (!o) setOverrideMember(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Override Graduation Status</DialogTitle></DialogHeader>
          {overrideMember && (
            <GraduationOverrideForm
              member={overrideMember}
              onSaved={() => { setOverrideMember(null); load(); }}
            />
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
