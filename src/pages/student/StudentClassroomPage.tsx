import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMarkAttendance } from '@/hooks/useAttendance';
import { useStudentAssignments, useSubmissions } from '@/hooks/useAssignments';
import { useStudentProgress } from '@/hooks/useAttendance';
import { useSchedules } from '@/hooks/useSchedules';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StudentCurriculumView } from '@/components/classroom/StudentCurriculumView';
import {
  Calendar, ClipboardList, BookOpen, BarChart2, Loader2,
  CheckCircle2, Clock, AlertCircle, MapPin, ChevronDown, ChevronUp, LayoutList,
  Users, Video, ExternalLink, FileText, Send,
} from 'lucide-react';

const ATTENDANCE_STATUS_COLOURS: Record<string, string> = {
  present: 'bg-success/15 text-success border-success/30',
  late: 'bg-warning/15 text-warning border-warning/30',
  absent: 'bg-destructive/15 text-destructive border-destructive/30',
  invalid: 'bg-muted text-muted-foreground border-muted',
};

function AttendanceTab({ classroomId }: { classroomId: string }) {
  const { markAttendance } = useMarkAttendance();
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [marking, setMarking] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [records, setRecords] = useState<any[]>([]);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'captured' | 'unavailable'>('idle');

  const loadRecords = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('attendance_records')
      .select('*, attendance_sessions(code, created_at, duration_mins, old_lessons(title), schedules(title, lessons(title)))')
      .eq('student_id', user.id)
      .eq('classroom_id', classroomId)
      .order('marked_at', { ascending: false });
    setRecords(data || []);
  };

  useEffect(() => { loadRecords(); }, [classroomId, user]);

  const handleMark = async () => {
    if (!code.trim()) { toast.error('Enter the attendance code'); return; }
    setMarking(true);
    setError('');
    setResult(null);
    setGpsStatus('idle');
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        setGpsStatus('captured');
      } catch {
        setGpsStatus('unavailable');
      }
      const data = await markAttendance(code, lat, lng);
      setResult(data);
      setCode('');
      loadRecords();
      toast.success('Attendance marked!');
    } catch (e: any) {
      const msg: string = e.message || 'Failed to mark attendance';
      if (msg.includes('expired')) setError('This session has expired. Ask your tutor for a new code.');
      else if (msg.includes('already')) setError('You have already marked attendance for this session.');
      else if (msg.includes('cohort') || msg.includes('enrolled')) setError('You are not enrolled in the cohort for this session.');
      else if (msg.includes('closed') || msg.includes('open')) setError('This attendance session is no longer open.');
      else if (msg.includes('invalid') || msg.includes('found')) setError('Invalid code. Check with your tutor and try again.');
      else setError(msg);
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-6 max-w-md">
        <h3 className="font-semibold mb-1">Enter Attendance Code</h3>
        <p className="text-sm text-muted-foreground mb-4">Ask your tutor for today's 6-character code</p>
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleMark()}
            placeholder="e.g. WD4821"
            className="font-mono text-lg tracking-widest text-center"
            maxLength={6}
          />
          <Button onClick={handleMark} disabled={marking || code.length !== 6}>
            {marking ? <Loader2 className="animate-spin h-4 w-4" /> : 'Mark'}
          </Button>
        </div>

        {gpsStatus === 'captured' && (
          <p className="mt-2 text-xs flex items-center gap-1 text-muted-foreground"><MapPin className="h-3.5 w-3.5 text-success" />Location captured</p>
        )}
        {gpsStatus === 'unavailable' && (
          <p className="mt-2 text-xs flex items-center gap-1 text-muted-foreground"><MapPin className="h-3.5 w-3.5 text-warning" />Location unavailable — marked without GPS</p>
        )}

        {result && (
          <div className="mt-3 flex items-center gap-2 text-success text-sm">
            <CheckCircle2 className="h-4 w-4" />
            Marked as <strong>{result.attendance_status}</strong>
          </div>
        )}
        {error && (
          <div className="mt-3 flex items-start gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>

      {records.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">My Attendance History</h3>
          <div className="space-y-2">
            {records.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                <div>
                  <p className="font-medium text-sm">
                    {r.attendance_sessions?.schedules?.lessons?.title
                      || r.attendance_sessions?.schedules?.title
                      || r.attendance_sessions?.old_lessons?.title
                      || <span className="font-mono">{r.attendance_sessions?.code}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{new Date(r.marked_at).toLocaleString()}</p>
                </div>
                <Badge variant="outline" className={`capitalize ${ATTENDANCE_STATUS_COLOURS[r.attendance_status] || ''}`}>
                  {r.attendance_status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AssignmentsTab({ classroomId }: { classroomId: string }) {
  const { assignments, loading, refetch } = useStudentAssignments(classroomId);
  const [selected, setSelected] = useState<any>(null);
  const [subText, setSubText] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'submitted' | 'graded'>('all');
  const [submitting, setSubmitting] = useState(false);
  const { submitAssignment } = useSubmissions(selected?.id || '');

  const getSubmission = (assignment: any) => assignment.assignment_submissions?.[0];

  const getStatus = (assignment: any) => {
    const sub = getSubmission(assignment);
    if (sub?.status === 'graded') return 'graded';
    if (sub?.status === 'late') return 'late';
    if (sub) return 'submitted';
    if (assignment.due_date && new Date(assignment.due_date) < new Date()) return 'overdue';
    return 'pending';
  };

  const counts = assignments.reduce((acc: Record<string, number>, assignment: any) => {
    const status = getStatus(assignment);
    acc.all += 1;
    if (status === 'pending' || status === 'overdue') acc.pending += 1;
    if (status === 'submitted' || status === 'late') acc.submitted += 1;
    if (status === 'graded') acc.graded += 1;
    return acc;
  }, { all: 0, pending: 0, submitted: 0, graded: 0 });

  const visibleAssignments = assignments.filter((assignment: any) => {
    const status = getStatus(assignment);
    if (filter === 'pending') return status === 'pending' || status === 'overdue';
    if (filter === 'submitted') return status === 'submitted' || status === 'late';
    if (filter === 'graded') return status === 'graded';
    return true;
  });

  const handleSubmit = async () => {
    if (!subText.trim() && !fileUrl.trim()) { toast.error('Write a submission or add a file link'); return; }
    setSubmitting(true);
    try {
      await submitAssignment(subText, fileUrl || undefined, selected?.due_date);
      toast.success('Submitted!');
      setSelected(null);
      setSubText('');
      setFileUrl('');
      await refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { key: 'all', label: 'All', value: counts.all },
          { key: 'pending', label: 'To Submit', value: counts.pending },
          { key: 'submitted', label: 'Submitted', value: counts.submitted },
          { key: 'graded', label: 'Graded', value: counts.graded },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key as typeof filter)}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${filter === item.key ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-muted/40'}`}
          >
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</span>
            <span className="mt-1 block text-2xl font-semibold">{item.value}</span>
          </button>
        ))}
      </div>

      {visibleAssignments.map((a: any) => {
        const sub = getSubmission(a);
        const status = getStatus(a);
        const isOverdue = status === 'overdue';
        const canSubmit = !sub || sub.status !== 'graded';
        const statusClass = status === 'graded'
          ? 'bg-success/15 text-success border-success/30'
          : status === 'late' || status === 'overdue'
            ? 'bg-destructive/15 text-destructive border-destructive/30'
            : status === 'submitted'
              ? 'bg-primary/15 text-primary border-primary/30'
              : 'bg-muted text-muted-foreground border-muted';
        return (
          <div key={a.id} className="glass-card rounded-2xl p-5 border border-border">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{a.title}</h3>
                  <Badge variant="outline" className={`capitalize ${statusClass}`}>
                    {status === 'pending' ? 'to submit' : status}
                  </Badge>
                </div>
                {a.due_date && (
                  <p className={`text-sm flex items-center gap-1 mt-1 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                    <Clock className="h-3.5 w-3.5" />
                    Due: {new Date(a.due_date).toLocaleString()}
                    {isOverdue && ' (Overdue)'}
                  </p>
                )}
                {a.instructions && <p className="text-sm mt-2 text-muted-foreground line-clamp-2">{a.instructions}</p>}
                {a.units?.title && <p className="text-xs mt-2 text-muted-foreground">Unit: {a.units.title}</p>}
                {a.assignment_resources?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {a.assignment_resources.filter((resource: any) => resource.file_url).map((resource: any) => (
                      <Button key={resource.id} asChild size="sm" variant="outline" className="h-8">
                        <a href={resource.file_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          {resource.title || 'Resource'}
                        </a>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-2">
                {canSubmit && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelected(a);
                      setSubText(sub?.submission_text || '');
                      setFileUrl(sub?.file_url || '');
                    }}
                  >
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    {sub ? 'Update' : 'Submit'}
                  </Button>
                )}
              </div>
            </div>
            {sub && (
              <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">Your submission</p>
                  {sub.submitted_at && <span className="text-xs text-muted-foreground">{new Date(sub.submitted_at).toLocaleString()}</span>}
                </div>
                {sub.submission_text && <p className="text-muted-foreground line-clamp-3">{sub.submission_text}</p>}
                {sub.file_url && (
                  <a href={sub.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary">
                    <FileText className="h-3.5 w-3.5" />
                    Open submitted file
                  </a>
                )}
              </div>
            )}
            {sub?.grade && (
              <div className="mt-3 p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                <p><strong>Grade:</strong> {sub.grade}</p>
                {sub.feedback && <p className="text-muted-foreground">{sub.feedback}</p>}
              </div>
            )}
          </div>
        );
      })}
      {assignments.length === 0 && <p className="text-center text-muted-foreground py-10">No assignments yet</p>}
      {assignments.length > 0 && visibleAssignments.length === 0 && (
        <p className="text-center text-muted-foreground py-10">No assignments in this view</p>
      )}

      <Dialog open={!!selected} onOpenChange={o => { if (!o) { setSelected(null); setSubText(''); setFileUrl(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit: {selected?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            {selected?.instructions && <p className="text-sm text-muted-foreground">{selected.instructions}</p>}
            <div><Label>Your Answer / Notes</Label><Textarea value={subText} onChange={e => setSubText(e.target.value)} rows={6} className="mt-1.5" /></div>
            <div>
              <Label>File Link</Label>
              <Input value={fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="https://..." className="mt-1.5" />
            </div>
            <Button onClick={handleSubmit} disabled={submitting} className="w-full">{submitting ? 'Submitting...' : 'Submit Assignment'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function StudentClassroomPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [classroom, setClassroom] = useState<any>(null);
  const [cohortId, setCohortId] = useState('');
  const [cohortInfo, setCohortInfo] = useState<{
    cohort_label: string;
    scope_type?: string;
    status?: string;
    start_date?: string | null;
    end_date?: string | null;
    capacity?: number | null;
  } | null>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [assignmentSummary, setAssignmentSummary] = useState({ pending: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [showPast, setShowPast] = useState(false);
  const { progress } = useStudentProgress(user?.id || '', cohortId);
  const { schedules } = useSchedules(id!);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!id || !user) return;
    Promise.all([
      supabase.from('classrooms').select('*, programs(program_name)').eq('id', id).single(),
      supabase.from('cohort_students')
        .select('cohort_id, cohorts!inner(cohort_label, scope_type, status, start_date, end_date, capacity)')
        .eq('student_id', user.id)
        .eq('cohorts.classroom_id', id)
        .maybeSingle(),
      supabase.from('old_lessons')
        .select('*, cohorts(cohort_label)')
        .eq('classroom_id', id)
        .neq('status', 'cancelled')
        .order('lesson_date')
        .order('start_time'),
      supabase.from('assignments').select('id, due_date').eq('classroom_id', id).eq('status', 'published'),
      supabase.from('assignment_submissions').select('assignment_id').eq('student_id', user.id),
    ]).then(([clsRes, cohortRes, lessonsRes, assignmentsRes, submissionsRes]) => {
      setClassroom(clsRes.data);
      setCohortId(cohortRes.data?.cohort_id || '');
      setCohortInfo((cohortRes.data as any)?.cohorts || null);
      setLessons(lessonsRes.data || []);
      const submittedIds = new Set((submissionsRes.data || []).map((submission: any) => submission.assignment_id));
      const pendingAssignments = (assignmentsRes.data || []).filter((assignment: any) => !submittedIds.has(assignment.id));
      setAssignmentSummary({
        pending: pendingAssignments.length,
        overdue: pendingAssignments.filter((assignment: any) => assignment.due_date && new Date(assignment.due_date) < new Date()).length,
      });
      setLoading(false);
    });
  }, [id, user]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  if (!classroom) return <div className="text-center py-20 text-muted-foreground">Classroom not found.</div>;

  const todayLessons = lessons.filter(l => l.lesson_date === today);
  const upcomingLessons = lessons.filter(l => l.lesson_date > today);
  const pastLessons = lessons.filter(l => l.lesson_date < today);
  const activeSchedules = schedules.filter(s => s.status !== 'cancelled');
  const todaySchedules = activeSchedules.filter(s => s.scheduled_date === today);
  const upcomingSchedules = activeSchedules.filter(s => s.scheduled_date > today);
  const pastSchedules = schedules.filter(s => s.scheduled_date < today);
  const nextSchedule = todaySchedules[0] || upcomingSchedules[0];
  const attendancePct = Number(progress?.attendance_pct || 0);
  const assignmentPct = Number(progress?.assignment_pct || 0);
  const formatDate = (date?: string | null) => date
    ? new Date(`${date}T00:00:00`).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const LessonCard = ({ lesson }: { lesson: any }) => (
    <div className={`glass-card rounded-xl p-4 flex items-center justify-between border ${lesson.lesson_date === today ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
      <div>
        <div className="flex items-center gap-2">
          {lesson.lesson_date === today && <span className="text-xs font-semibold text-primary uppercase tracking-wide">Today</span>}
          <p className="font-semibold">{lesson.title}</p>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          {new Date(lesson.lesson_date + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' })}
          {' · '}
          {lesson.start_time} – {lesson.end_time}
        </p>
        {lesson.location && <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><MapPin className="h-3 w-3" />{lesson.location}</p>}
      </div>
      <div className="flex flex-col items-end gap-1">
        {lesson.cohorts && <Badge variant="outline" className="text-xs">{lesson.cohorts.cohort_label}</Badge>}
        {lesson.status === 'in_progress' && <Badge className="text-xs bg-warning/15 text-warning border-warning/30">In Progress</Badge>}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title={classroom.name} description={classroom.programs?.program_name} />

      {cohortInfo && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Your cohort:</span>
            <span className="font-medium text-primary">{cohortInfo.cohort_label}</span>
            {cohortInfo.status && (
              <Badge variant="outline" className="text-xs capitalize border-primary/30 text-primary/70">{cohortInfo.status}</Badge>
            )}
            {cohortInfo.scope_type && (
              <Badge variant="secondary" className="text-xs capitalize">{cohortInfo.scope_type}</Badge>
            )}
          </div>
          {(cohortInfo.start_date || cohortInfo.end_date || cohortInfo.capacity) && (
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {(cohortInfo.start_date || cohortInfo.end_date) && (
                <span>{formatDate(cohortInfo.start_date)}{cohortInfo.end_date ? ` - ${formatDate(cohortInfo.end_date)}` : ''}</span>
              )}
              {cohortInfo.capacity && <span>Capacity: {cohortInfo.capacity}</span>}
            </div>
          )}
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Next Class</p>
            <Calendar className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-3 truncate text-lg font-semibold">{nextSchedule?.lessons?.title || nextSchedule?.title || nextSchedule?.modules?.title || 'Not scheduled'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {nextSchedule
              ? `${formatDate(nextSchedule.scheduled_date)} · ${nextSchedule.start_time} - ${nextSchedule.end_time}`
              : 'Check back when your tutor posts the next session'}
          </p>
        </div>
        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Today</p>
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-3 text-2xl font-semibold">{todaySchedules.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">{todaySchedules.length === 1 ? 'session scheduled' : 'sessions scheduled'}</p>
        </div>
        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Pending Work</p>
            <ClipboardList className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-3 text-2xl font-semibold">{assignmentSummary.pending}</p>
          <p className={`mt-1 text-xs ${assignmentSummary.overdue > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
            {assignmentSummary.overdue > 0 ? `${assignmentSummary.overdue} overdue` : 'No overdue assignments'}
          </p>
        </div>
        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Progress</p>
            <BarChart2 className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-3 text-2xl font-semibold">{Math.round((attendancePct + assignmentPct) / (progress ? 2 : 1))}%</p>
          <p className="mt-1 text-xs text-muted-foreground">Attendance {attendancePct}% · Assignments {assignmentPct}%</p>
        </div>
      </div>

      <Tabs defaultValue="schedule">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="schedule"><Calendar className="h-4 w-4 mr-1.5" />Schedule</TabsTrigger>
          <TabsTrigger value="curriculum"><LayoutList className="h-4 w-4 mr-1.5" />Curriculum</TabsTrigger>
          <TabsTrigger value="attendance"><ClipboardList className="h-4 w-4 mr-1.5" />Attendance</TabsTrigger>
          <TabsTrigger value="assignments"><BookOpen className="h-4 w-4 mr-1.5" />Assignments</TabsTrigger>
          <TabsTrigger value="progress"><BarChart2 className="h-4 w-4 mr-1.5" />Progress</TabsTrigger>
        </TabsList>

        {/* SCHEDULE */}
        <TabsContent value="schedule">
          <div className="space-y-6">
            {(() => {
              const ScheduleCard = ({ s }: { s: any }) => (
                <div className={`rounded-xl p-4 flex items-center justify-between border ${s.scheduled_date === today ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      {s.scheduled_date === today && <span className="text-xs font-semibold text-primary uppercase tracking-wide">Today</span>}
                      <p className="font-semibold">{s.lessons?.title || s.title || s.modules?.title || 'Session'}</p>
                      {s.status && <Badge variant="outline" className="text-xs capitalize">{s.status}</Badge>}
                    </div>
                    {s.lessons?.units?.title && <p className="text-xs text-muted-foreground mt-1">Unit: {s.lessons.units.title}</p>}
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {new Date(s.scheduled_date + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {' · '}{s.start_time} – {s.end_time}
                    </p>
                    {s.location && <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><MapPin className="h-3 w-3" />{s.location}</p>}
                    {s.meeting_link && (
                      <Button asChild size="sm" variant="outline" className="mt-3 h-8">
                        <a href={s.meeting_link} target="_blank" rel="noreferrer">
                          <Video className="mr-1.5 h-3.5 w-3.5" />
                          Join online
                        </a>
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {s.cohorts && <Badge variant="outline" className="text-xs">{s.cohorts.cohort_label}</Badge>}
                    {s.staff && <span className="text-xs text-muted-foreground">{s.staff.full_name}</span>}
                  </div>
                </div>
              );

              if (schedules.length === 0 && lessons.length === 0) return (
                <p className="text-center text-muted-foreground py-10">No sessions scheduled yet</p>
              );

              return (
                <>
                  {todaySchedules.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-primary mb-3">Today</h3>
                      <div className="space-y-3">{todaySchedules.map(s => <ScheduleCard key={s.id} s={s} />)}</div>
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold mb-3">Upcoming {upcomingSchedules.length > 0 && <span className="text-muted-foreground font-normal ml-1">({upcomingSchedules.length})</span>}</h3>
                    {upcomingSchedules.length > 0
                      ? <div className="space-y-3">{upcomingSchedules.map(s => <ScheduleCard key={s.id} s={s} />)}</div>
                      : <p className="text-sm text-muted-foreground">No upcoming sessions</p>}
                  </div>
                  {pastSchedules.length > 0 && (
                    <div>
                      <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-3" onClick={() => setShowPast(v => !v)}>
                        {showPast ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        Past sessions ({pastSchedules.length})
                      </button>
                      {showPast && <div className="space-y-3 opacity-70">{[...pastSchedules].reverse().map(s => <ScheduleCard key={s.id} s={s} />)}</div>}
                    </div>
                  )}
                  {schedules.length === 0 && lessons.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground mb-1">Historical lessons</p>
                      {todayLessons.map(l => <LessonCard key={l.id} lesson={l} />)}
                      {upcomingLessons.map(l => <LessonCard key={l.id} lesson={l} />)}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </TabsContent>

        {/* CURRICULUM */}
        <TabsContent value="curriculum">
          <StudentCurriculumView classroomId={id!} />
        </TabsContent>

        {/* ATTENDANCE */}
        <TabsContent value="attendance">
          <AttendanceTab classroomId={id!} />
        </TabsContent>

        {/* ASSIGNMENTS */}
        <TabsContent value="assignments">
          <AssignmentsTab classroomId={id!} />
        </TabsContent>

        {/* PROGRESS */}
        <TabsContent value="progress">
          {progress ? (
            <div className="space-y-5 max-w-lg">
              <div className="glass-card rounded-2xl p-6 space-y-5">
                <h3 className="font-semibold">My Progress</h3>
                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span>Attendance</span>
                    <span className="font-medium">{progress.lessons_attended}/{progress.total_lessons} ({progress.attendance_pct}%)</span>
                  </div>
                  <Progress value={progress.attendance_pct} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span>Assignments Submitted</span>
                    <span className="font-medium">{progress.assignments_submitted}/{progress.total_assignments} ({progress.assignment_pct}%)</span>
                  </div>
                  <Progress value={progress.assignment_pct} className="h-2" />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-10">No progress data yet — join a cohort to start tracking</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
