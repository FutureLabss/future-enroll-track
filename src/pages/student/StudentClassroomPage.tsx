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
  const { assignments, loading } = useStudentAssignments(classroomId);
  const [selected, setSelected] = useState<any>(null);
  const [subText, setSubText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { submitAssignment } = useSubmissions(selected?.id || '');

  const handleSubmit = async () => {
    if (!subText.trim()) { toast.error('Write your submission'); return; }
    setSubmitting(true);
    try {
      await submitAssignment(subText);
      toast.success('Submitted!');
      setSelected(null);
      setSubText('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>;

  return (
    <div className="space-y-4">
      {assignments.map((a: any) => {
        const sub = a.assignment_submissions?.[0];
        const isOverdue = a.due_date && new Date(a.due_date) < new Date() && !sub;
        return (
          <div key={a.id} className="glass-card rounded-2xl p-5 border border-border">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold">{a.title}</h3>
                {a.due_date && (
                  <p className={`text-sm flex items-center gap-1 mt-1 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                    <Clock className="h-3.5 w-3.5" />
                    Due: {new Date(a.due_date).toLocaleString()}
                    {isOverdue && ' (Overdue)'}
                  </p>
                )}
                {a.instructions && <p className="text-sm mt-2 text-muted-foreground line-clamp-2">{a.instructions}</p>}
                {a.units?.title && <p className="text-xs mt-2 text-muted-foreground">Unit: {a.units.title}</p>}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-2">
                {sub ? (
                  <Badge variant={sub.status === 'graded' ? 'default' : 'secondary'} className="capitalize">{sub.status}</Badge>
                ) : (
                  <Button size="sm" onClick={() => setSelected(a)}>Submit</Button>
                )}
              </div>
            </div>
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

      <Dialog open={!!selected} onOpenChange={o => { if (!o) { setSelected(null); setSubText(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit: {selected?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            {selected?.instructions && <p className="text-sm text-muted-foreground">{selected.instructions}</p>}
            <div><Label>Your Answer / Notes</Label><Textarea value={subText} onChange={e => setSubText(e.target.value)} rows={6} className="mt-1.5" /></div>
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
  const [cohortInfo, setCohortInfo] = useState<{ cohort_label: string; scope_type?: string } | null>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPast, setShowPast] = useState(false);
  const { progress } = useStudentProgress(user?.id || '', cohortId);
  const { schedules } = useSchedules(id!);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!id || !user) return;
    Promise.all([
      supabase.from('classrooms').select('*, programs(program_name)').eq('id', id).single(),
      supabase.from('cohort_students').select('cohort_id, cohorts!inner(cohort_label, scope_type)').eq('student_id', user.id).eq('cohorts.classroom_id', id).maybeSingle(),
      supabase.from('old_lessons')
        .select('*, cohorts(cohort_label)')
        .eq('classroom_id', id)
        .neq('status', 'cancelled')
        .order('lesson_date')
        .order('start_time'),
    ]).then(([clsRes, cohortRes, lessonsRes]) => {
      setClassroom(clsRes.data);
      setCohortId(cohortRes.data?.cohort_id || '');
      setCohortInfo((cohortRes.data as any)?.cohorts || null);
      setLessons(lessonsRes.data || []);
      setLoading(false);
    });
  }, [id, user]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  if (!classroom) return <div className="text-center py-20 text-muted-foreground">Classroom not found.</div>;

  const todayLessons = lessons.filter(l => l.lesson_date === today);
  const upcomingLessons = lessons.filter(l => l.lesson_date > today);
  const pastLessons = lessons.filter(l => l.lesson_date < today);

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
        <div className="mb-5 flex items-center gap-2 text-sm rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5">
          <span className="text-muted-foreground">Your cohort:</span>
          <span className="font-medium text-primary">{cohortInfo.cohort_label}</span>
          {cohortInfo.scope_type && (
            <Badge variant="outline" className="text-xs capitalize border-primary/30 text-primary/70">{cohortInfo.scope_type}</Badge>
          )}
        </div>
      )}

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
              const todaySched = schedules.filter(s => s.scheduled_date === today && s.status !== 'cancelled');
              const upcomingSched = schedules.filter(s => s.scheduled_date > today && s.status !== 'cancelled');
              const pastSched = schedules.filter(s => s.scheduled_date < today);

              const ScheduleCard = ({ s }: { s: any }) => (
                <div className={`rounded-xl p-4 flex items-center justify-between border ${s.scheduled_date === today ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      {s.scheduled_date === today && <span className="text-xs font-semibold text-primary uppercase tracking-wide">Today</span>}
                      <p className="font-semibold">{s.title || s.lessons?.title || s.modules?.title || 'Session'}</p>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {new Date(s.scheduled_date + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {' · '}{s.start_time} – {s.end_time}
                    </p>
                    {s.location && <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><MapPin className="h-3 w-3" />{s.location}</p>}
                    {s.meeting_link && <a href={s.meeting_link} target="_blank" rel="noreferrer" className="text-xs text-primary mt-0.5 block">Join online →</a>}
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
                  {todaySched.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-primary mb-3">Today</h3>
                      <div className="space-y-3">{todaySched.map(s => <ScheduleCard key={s.id} s={s} />)}</div>
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold mb-3">Upcoming {upcomingSched.length > 0 && <span className="text-muted-foreground font-normal ml-1">({upcomingSched.length})</span>}</h3>
                    {upcomingSched.length > 0
                      ? <div className="space-y-3">{upcomingSched.map(s => <ScheduleCard key={s.id} s={s} />)}</div>
                      : <p className="text-sm text-muted-foreground">No upcoming sessions</p>}
                  </div>
                  {pastSched.length > 0 && (
                    <div>
                      <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-3" onClick={() => setShowPast(v => !v)}>
                        {showPast ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        Past sessions ({pastSched.length})
                      </button>
                      {showPast && <div className="space-y-3 opacity-70">{[...pastSched].reverse().map(s => <ScheduleCard key={s.id} s={s} />)}</div>}
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
