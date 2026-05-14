import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAttendance } from '@/hooks/useAttendance';
import { useAssignments } from '@/hooks/useAssignments';
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
import { CurriculumBuilder } from '@/components/classroom/CurriculumBuilder';
import { toast } from 'sonner';
import { Calendar, ClipboardList, Users, BookOpen, Plus, Radio, Clock, Loader2, LayoutList } from 'lucide-react';

export default function ClassroomWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [classroomData, setClassroomData] = useState<any>(null);
  const [permissions, setPermissions] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Attendance
  const { sessions, generateSession, closeSession } = useAttendance(id!);
  const [sessionForm, setSessionForm] = useState({ lesson_id: '', cohort_id: '', duration: '30' });
  const [activeSession, setActiveSession] = useState<any>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [generatingSession, setGeneratingSession] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Lessons
  const [lessonOpen, setLessonOpen] = useState(false);
  const [lessonForm, setLessonForm] = useState({ title: '', cohort_id: '', tutor_id: '', lesson_date: '', start_time: '09:00', end_time: '11:00', location: '', week_number: '' });
  const [savingLesson, setSavingLesson] = useState(false);

  // Assignments
  const { assignments, createAssignment, publishAssignment } = useAssignments(id!);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ title: '', instructions: '', due_date: '', cohort_id: '' });
  const [savingAssign, setSavingAssign] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    loadData();
  }, [id, user]);

  useEffect(() => {
    const open = sessions.find(s => s.status === 'open');
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
    const [csRes, studentsRes, lessonsRes, cohortsRes, staffRes] = await Promise.all([
      supabase.from('classroom_staff')
        .select('*, classrooms(*, programs(program_name)), classroom_permissions(*)')
        .eq('classroom_id', id).eq('user_id', user!.id).single(),
      supabase.from('classroom_students').select('*, profiles:student_id(full_name, email)').eq('classroom_id', id),
      supabase.from('lessons').select('*, staff:tutor_id(full_name), cohorts(cohort_label)').eq('classroom_id', id).order('lesson_date', { ascending: false }),
      supabase.from('cohorts').select('*').eq('classroom_id', id),
      supabase.from('staff').select('id, full_name').eq('active', true),
    ]);
    setClassroomData(csRes.data);
    setPermissions(csRes.data?.classroom_permissions);
    setStudents(studentsRes.data || []);
    setLessons(lessonsRes.data || []);
    setCohorts(cohortsRes.data || []);
    setStaffList(staffRes.data || []);
    setLoading(false);
  };

  const handleStartAttendance = async () => {
    setGeneratingSession(true);
    try {
      const session = await generateSession(
        sessionForm.lesson_id || null,
        sessionForm.cohort_id || null,
        parseInt(sessionForm.duration)
      );
      setActiveSession(session);
      setSessionOpen(false);
      toast.success('Attendance session started!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGeneratingSession(false);
    }
  };

  const handleCloseSession = async () => {
    if (!activeSession) return;
    await closeSession(activeSession.id);
    setActiveSession(null);
    toast.success('Session closed');
  };

  const handleScheduleLesson = async () => {
    if (!lessonForm.title || !lessonForm.lesson_date) { toast.error('Title and date required'); return; }
    setSavingLesson(true);
    try {
      const { error } = await supabase.from('lessons').insert({
        classroom_id: id,
        title: lessonForm.title,
        cohort_id: lessonForm.cohort_id || null,
        tutor_id: lessonForm.tutor_id || null,
        lesson_date: lessonForm.lesson_date,
        start_time: lessonForm.start_time,
        end_time: lessonForm.end_time,
        location: lessonForm.location || null,
        week_number: lessonForm.week_number ? parseInt(lessonForm.week_number) : null,
        created_by: user?.id,
      });
      if (error) throw error;
      toast.success('Lesson scheduled');
      setLessonOpen(false);
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingLesson(false);
    }
  };

  const handleCreateAssignment = async () => {
    if (!assignForm.title) { toast.error('Title required'); return; }
    setSavingAssign(true);
    try {
      await createAssignment({
        title: assignForm.title,
        instructions: assignForm.instructions || null,
        due_date: assignForm.due_date || null,
        cohort_id: assignForm.cohort_id || null,
        status: 'draft',
      });
      toast.success('Assignment created (draft)');
      setAssignOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingAssign(false);
    }
  };

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  if (!classroomData) return <div className="text-center py-20 text-muted-foreground">Classroom not found or access denied.</div>;

  const cls = classroomData.classrooms;
  const can = permissions || {};

  return (
    <div>
      <PageHeader
        title={cls.name}
        description={`${cls.programs?.program_name || ''} · ${classroomData.staff_type === 'teaching' ? 'Teaching Staff' : 'Non-Teaching Staff'}`}
      />

      {/* Active attendance session banner */}
      {activeSession && (
        <div className="mb-6 rounded-2xl bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/30 p-6 flex items-center justify-between">
          <div>
            <div className="text-xs text-primary font-semibold mb-1 flex items-center gap-1"><Radio className="h-3 w-3" /> LIVE ATTENDANCE SESSION</div>
            <div className="font-mono text-5xl font-black tracking-[0.2em] text-primary">{activeSession.code}</div>
            <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {countdown !== null ? (countdown > 0 ? `Expires in ${formatCountdown(countdown)}` : 'Expired') : 'Checking...'}
            </div>
          </div>
          <Button variant="destructive" onClick={handleCloseSession}>Close Session</Button>
        </div>
      )}

      <Tabs defaultValue="schedule">
        <TabsList className="mb-6">
          {can.can_create_lessons && <TabsTrigger value="curriculum"><LayoutList className="h-4 w-4 mr-1.5" />Curriculum</TabsTrigger>}
          <TabsTrigger value="schedule"><Calendar className="h-4 w-4 mr-1.5" />Schedule</TabsTrigger>
          <TabsTrigger value="attendance"><ClipboardList className="h-4 w-4 mr-1.5" />Attendance</TabsTrigger>
          {can.can_view_students && <TabsTrigger value="students"><Users className="h-4 w-4 mr-1.5" />Students ({students.length})</TabsTrigger>}
          {can.can_create_assignments && <TabsTrigger value="assignments"><BookOpen className="h-4 w-4 mr-1.5" />Assignments</TabsTrigger>}
        </TabsList>

        {can.can_create_lessons && (
          <TabsContent value="curriculum">
            <CurriculumBuilder classroomId={id!} canEdit={true} />
          </TabsContent>
        )}

        <TabsContent value="schedule">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold">Scheduled Lessons</h3>
            {can.can_schedule && (
              <Dialog open={lessonOpen} onOpenChange={setLessonOpen}>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Schedule Lesson</Button></DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>Schedule Lesson</DialogTitle></DialogHeader>
                  <div className="space-y-3 mt-2">
                    <div><Label>Title *</Label><Input value={lessonForm.title} onChange={e => setLessonForm({...lessonForm, title: e.target.value})} className="mt-1.5" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Cohort</Label>
                        <Select value={lessonForm.cohort_id} onValueChange={v => setLessonForm({...lessonForm, cohort_id: v})}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="All cohorts" /></SelectTrigger>
                          <SelectContent>{cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Tutor</Label>
                        <Select value={lessonForm.tutor_id} onValueChange={v => setLessonForm({...lessonForm, tutor_id: v})}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select tutor" /></SelectTrigger>
                          <SelectContent>{staffList.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div><Label>Date *</Label><Input type="date" value={lessonForm.lesson_date} onChange={e => setLessonForm({...lessonForm, lesson_date: e.target.value})} className="mt-1.5" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Start Time</Label><Input type="time" value={lessonForm.start_time} onChange={e => setLessonForm({...lessonForm, start_time: e.target.value})} className="mt-1.5" /></div>
                      <div><Label>End Time</Label><Input type="time" value={lessonForm.end_time} onChange={e => setLessonForm({...lessonForm, end_time: e.target.value})} className="mt-1.5" /></div>
                    </div>
                    <div><Label>Location</Label><Input value={lessonForm.location} onChange={e => setLessonForm({...lessonForm, location: e.target.value})} className="mt-1.5" placeholder="Override classroom default" /></div>
                    <div><Label>Week Number</Label><Input type="number" value={lessonForm.week_number} onChange={e => setLessonForm({...lessonForm, week_number: e.target.value})} className="mt-1.5" placeholder="e.g. 1" /></div>
                    <Button onClick={handleScheduleLesson} disabled={savingLesson} className="w-full">{savingLesson ? 'Saving...' : 'Schedule Lesson'}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <DataTable
            columns={[
              { key: 'date', header: 'Date', render: (r: any) => new Date(r.lesson_date).toLocaleDateString() },
              { key: 'title', header: 'Lesson', render: (r: any) => r.title },
              { key: 'time', header: 'Time', render: (r: any) => `${r.start_time} – ${r.end_time}` },
              { key: 'tutor', header: 'Tutor', render: (r: any) => r.staff?.full_name || '—' },
              { key: 'cohort', header: 'Cohort', render: (r: any) => r.cohorts?.cohort_label || 'All' },
              { key: 'status', header: '', render: (r: any) => <Badge variant={r.status === 'completed' ? 'secondary' : 'default'}>{r.status}</Badge> },
            ]}
            data={lessons}
          />
        </TabsContent>

        <TabsContent value="attendance">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold">Attendance Sessions</h3>
            {can.can_start_attendance && !activeSession && (
              <Dialog open={sessionOpen} onOpenChange={setSessionOpen}>
                <DialogTrigger asChild><Button size="sm"><Radio className="h-4 w-4 mr-1" />Start Session</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Start Attendance Session</DialogTitle></DialogHeader>
                  <div className="space-y-3 mt-2">
                    <div>
                      <Label>Lesson (optional)</Label>
                      <Select value={sessionForm.lesson_id} onValueChange={v => setSessionForm({...sessionForm, lesson_id: v})}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select lesson" /></SelectTrigger>
                        <SelectContent>{lessons.filter(l => l.lesson_date === new Date().toISOString().split('T')[0]).map(l => <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Cohort (optional)</Label>
                      <Select value={sessionForm.cohort_id} onValueChange={v => setSessionForm({...sessionForm, cohort_id: v})}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="All students" /></SelectTrigger>
                        <SelectContent>{cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Duration (minutes)</Label>
                      <Select value={sessionForm.duration} onValueChange={v => setSessionForm({...sessionForm, duration: v})}>
                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['10','15','20','30','45','60'].map(d => <SelectItem key={d} value={d}>{d} minutes</SelectItem>)}
                        </SelectContent>
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
          <DataTable
            columns={[
              { key: 'code', header: 'Code', render: (r: any) => <span className="font-mono font-bold text-lg tracking-widest">{r.code}</span> },
              { key: 'lesson', header: 'Lesson', render: (r: any) => r.lessons?.title || '—' },
              { key: 'status', header: 'Status', render: (r: any) => <Badge variant={r.status === 'open' ? 'default' : 'secondary'}>{r.status}</Badge> },
              { key: 'duration', header: 'Duration', render: (r: any) => `${r.duration_mins} min` },
              { key: 'expires', header: 'Expires', render: (r: any) => new Date(r.code_expires_at).toLocaleTimeString() },
            ]}
            data={sessions}
          />
        </TabsContent>

        {can.can_view_students && (
          <TabsContent value="students">
            <DataTable
              columns={[
                { key: 'name', header: 'Student', render: (r: any) => r.profiles?.full_name || '—' },
                { key: 'email', header: 'Email', render: (r: any) => r.profiles?.email || '—' },
                { key: 'joined', header: 'Joined', render: (r: any) => new Date(r.joined_at).toLocaleDateString() },
              ]}
              data={students}
            />
          </TabsContent>
        )}

        {can.can_create_assignments && (
          <TabsContent value="assignments">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Assignments</h3>
              <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New Assignment</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Create Assignment</DialogTitle></DialogHeader>
                  <div className="space-y-3 mt-2">
                    <div><Label>Title *</Label><Input value={assignForm.title} onChange={e => setAssignForm({...assignForm, title: e.target.value})} className="mt-1.5" /></div>
                    <div><Label>Instructions</Label><Textarea value={assignForm.instructions} onChange={e => setAssignForm({...assignForm, instructions: e.target.value})} className="mt-1.5" rows={4} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Due Date</Label><Input type="datetime-local" value={assignForm.due_date} onChange={e => setAssignForm({...assignForm, due_date: e.target.value})} className="mt-1.5" /></div>
                      <div>
                        <Label>Cohort</Label>
                        <Select value={assignForm.cohort_id} onValueChange={v => setAssignForm({...assignForm, cohort_id: v})}>
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
            <DataTable
              columns={[
                { key: 'title', header: 'Title', render: (r: any) => r.title },
                { key: 'due', header: 'Due', render: (r: any) => r.due_date ? new Date(r.due_date).toLocaleDateString() : '—' },
                { key: 'cohort', header: 'Cohort', render: (r: any) => r.cohorts?.cohort_label || 'All' },
                { key: 'status', header: 'Status', render: (r: any) => <Badge variant={r.status === 'published' ? 'default' : 'secondary'}>{r.status}</Badge> },
                { key: 'actions', header: '', render: (r: any) => r.status === 'draft' ? (
                  <Button size="sm" variant="outline" onClick={() => publishAssignment(r.id)}>Publish</Button>
                ) : null },
              ]}
              data={assignments}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
