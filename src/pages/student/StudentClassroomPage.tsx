import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMarkAttendance } from '@/hooks/useAttendance';
import { useStudentAssignments, useSubmissions } from '@/hooks/useAssignments';
import { useStudentProgress } from '@/hooks/useAttendance';
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
import { Calendar, ClipboardList, BookOpen, BarChart2, Loader2, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

function AttendanceTab({ classroomId, cohortId }: { classroomId: string; cohortId: string }) {
  const { markAttendance } = useMarkAttendance();
  const [code, setCode] = useState('');
  const [marking, setMarking] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    supabase.from('attendance_records')
      .select('*, attendance_sessions(code, created_at, duration_mins)')
      .eq('student_id', (supabase.auth as any)._session?.user?.id || '')
      .eq('classroom_id', classroomId)
      .order('marked_at', { ascending: false })
      .then(({ data }) => setRecords(data || []));
  }, [classroomId, result]);

  const handleMark = async () => {
    if (!code.trim()) { toast.error('Enter the attendance code'); return; }
    setMarking(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      // Try to get geolocation
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {}
      const data = await markAttendance(code, lat, lng);
      setResult(data);
      setCode('');
      toast.success('Attendance marked!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl p-6 max-w-md">
        <h3 className="font-semibold mb-1">Enter Attendance Code</h3>
        <p className="text-sm text-muted-foreground mb-4">Ask your tutor for today's attendance code</p>
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. WD4821"
            className="font-mono text-lg tracking-widest text-center"
            maxLength={6}
          />
          <Button onClick={handleMark} disabled={marking}>
            {marking ? <Loader2 className="animate-spin h-4 w-4" /> : 'Mark'}
          </Button>
        </div>
        {result && (
          <div className="mt-3 flex items-center gap-2 text-success text-sm">
            <CheckCircle2 className="h-4 w-4" /> Marked as <strong>{result.attendance_status}</strong>
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
                  <p className="font-mono text-sm font-medium">{r.attendance_sessions?.code}</p>
                  <p className="text-xs text-muted-foreground">{new Date(r.marked_at).toLocaleString()}</p>
                </div>
                <Badge variant={r.attendance_status === 'present' ? 'default' : r.attendance_status === 'late' ? 'secondary' : 'destructive'}>
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
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold">{a.title}</h3>
                {a.due_date && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <Clock className="h-3.5 w-3.5" />
                    Due: {new Date(a.due_date).toLocaleString()}
                    {isOverdue && <span className="text-destructive ml-1">(Overdue)</span>}
                  </p>
                )}
                {a.instructions && <p className="text-sm mt-2 text-muted-foreground line-clamp-2">{a.instructions}</p>}
              </div>
              <div className="ml-4 flex flex-col items-end gap-2">
                {sub ? (
                  <Badge variant={sub.status === 'graded' ? 'default' : 'secondary'}>{sub.status}</Badge>
                ) : (
                  <Button size="sm" onClick={() => setSelected(a)}>Submit</Button>
                )}
              </div>
            </div>
            {sub?.grade && (
              <div className="mt-3 p-3 rounded-lg bg-muted/50 text-sm">
                <strong>Grade:</strong> {sub.grade}
                {sub.feedback && <p className="mt-1 text-muted-foreground">{sub.feedback}</p>}
              </div>
            )}
          </div>
        );
      })}
      {assignments.length === 0 && <p className="text-center text-muted-foreground py-10">No assignments yet</p>}

      <Dialog open={!!selected} onOpenChange={o => { if (!o) setSelected(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit: {selected?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
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
  const [lessons, setLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { progress } = useStudentProgress(user?.id || '', cohortId);

  useEffect(() => {
    if (!id || !user) return;
    Promise.all([
      supabase.from('classrooms').select('*, programs(program_name)').eq('id', id).single(),
      supabase.from('cohort_students').select('cohort_id').eq('student_id', user.id).limit(1).single(),
      supabase.from('lessons').select('*, cohorts(cohort_label)').eq('classroom_id', id).order('lesson_date'),
    ]).then(([clsRes, cohortRes, lessonsRes]) => {
      setClassroom(clsRes.data);
      setCohortId(cohortRes.data?.cohort_id || '');
      setLessons(lessonsRes.data || []);
      setLoading(false);
    });
  }, [id, user]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  if (!classroom) return <div className="text-center py-20 text-muted-foreground">Classroom not found.</div>;

  const upcoming = lessons.filter(l => l.lesson_date >= new Date().toISOString().split('T')[0]);

  return (
    <div>
      <PageHeader title={classroom.name} description={classroom.programs?.program_name} />

      <Tabs defaultValue="lessons">
        <TabsList className="mb-6">
          <TabsTrigger value="lessons"><BookOpen className="h-4 w-4 mr-1.5" />Lessons</TabsTrigger>
          <TabsTrigger value="attendance"><ClipboardList className="h-4 w-4 mr-1.5" />Attendance</TabsTrigger>
          <TabsTrigger value="assignments"><Calendar className="h-4 w-4 mr-1.5" />Assignments</TabsTrigger>
          <TabsTrigger value="progress"><BarChart2 className="h-4 w-4 mr-1.5" />Progress</TabsTrigger>
        </TabsList>

        <TabsContent value="lessons">
          <div className="space-y-3">
            {upcoming.length === 0 && <p className="text-center text-muted-foreground py-10">No upcoming lessons</p>}
            {upcoming.map((l: any) => (
              <div key={l.id} className="glass-card rounded-xl p-4 flex items-center justify-between border border-border">
                <div>
                  <p className="font-semibold">{l.title}</p>
                  <p className="text-sm text-muted-foreground">{new Date(l.lesson_date).toLocaleDateString()} · {l.start_time} – {l.end_time}</p>
                  {l.location && <p className="text-xs text-muted-foreground mt-0.5">{l.location}</p>}
                </div>
                <Badge variant="outline">{l.cohorts?.cohort_label || 'All'}</Badge>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="attendance">
          <AttendanceTab classroomId={id!} cohortId={cohortId} />
        </TabsContent>

        <TabsContent value="assignments">
          <AssignmentsTab classroomId={id!} />
        </TabsContent>

        <TabsContent value="progress">
          {progress ? (
            <div className="space-y-5 max-w-lg">
              <div className="glass-card rounded-2xl p-6 space-y-4">
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
                    <span>Assignments</span>
                    <span className="font-medium">{progress.assignments_submitted}/{progress.total_assignments} ({progress.assignment_pct}%)</span>
                  </div>
                  <Progress value={progress.assignment_pct} className="h-2" />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-10">Join a cohort to see your progress</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
