import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMarkAttendance } from '@/hooks/useAttendance';
import { uploadAssignmentImage, useStudentAssignments, useSubmissions } from '@/hooks/useAssignments';
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
  Users, Video, ExternalLink, FileText, Send, ShieldCheck,
} from 'lucide-react';

const ATTENDANCE_STATUS_COLOURS: Record<string, string> = {
  present: 'bg-success/15 text-success border-success/30',
  late: 'bg-warning/15 text-warning border-warning/30',
  absent: 'bg-destructive/15 text-destructive border-destructive/30',
  invalid: 'bg-muted text-muted-foreground border-muted',
};

function AttendanceTab({ classroomId, cohortId }: { classroomId: string; cohortId?: string }) {
  const { markAttendance } = useMarkAttendance();
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [marking, setMarking] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [records, setRecords] = useState<any[]>([]);
  const [openSessions, setOpenSessions] = useState<any[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'today' | 'recent' | 'all'>('recent');
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'captured' | 'unavailable'>('idle');
  const today = new Date().toISOString().split('T')[0];

  const loadRecords = async () => {
    if (!user) return;
    const [recordsRes, sessionsRes] = await Promise.all([
      supabase
      .from('attendance_records')
      .select('*, attendance_sessions(code, created_at, duration_mins, code_expires_at, status, old_lessons(title), schedules(title, scheduled_date, start_time, end_time, lessons(title)))')
      .eq('student_id', user.id)
      .eq('classroom_id', classroomId)
      .order('marked_at', { ascending: false }),
      supabase
        .from('attendance_sessions')
        .select('id, cohort_id, code_expires_at, created_at, duration_mins, status, old_lessons(title), schedules(title, scheduled_date, start_time, end_time, lessons(title))')
        .eq('classroom_id', classroomId)
        .eq('status', 'open')
        .gt('code_expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }),
    ]);
    const inCohortScope = (row: any) => !row.cohort_id || row.cohort_id === cohortId;
    setRecords((recordsRes.data || []).filter(inCohortScope));
    setOpenSessions((sessionsRes.data || []).filter(inCohortScope));
  };

  useEffect(() => { loadRecords(); }, [classroomId, cohortId, user]);

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
      await loadRecords();
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

  const todayRecords = records.filter((record) => record.marked_at?.startsWith(today));
  const recentRecords = records.slice(0, 8);
  const visibleRecords = historyFilter === 'today'
    ? todayRecords
    : historyFilter === 'recent'
      ? recentRecords
      : records;
  const presentCount = records.filter((record) => record.attendance_status === 'present' || record.attendance_status === 'late').length;
  const attendanceRate = records.length > 0 ? Math.round((presentCount / records.length) * 100) : 0;
  const markedOpenSessionIds = new Set(records.map((record) => record.session_id));
  const pendingOpenSessions = openSessions.filter((session) => !markedOpenSessionIds.has(session.id));

  const getSessionTitle = (session: any) => (
    session?.schedules?.lessons?.title
    || session?.schedules?.title
    || session?.old_lessons?.title
    || 'Attendance session'
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="glass-card rounded-xl border border-border p-4">
          <p className="text-sm font-medium">Attendance Rate</p>
          <p className="mt-2 text-2xl font-semibold">{attendanceRate}%</p>
          <p className="text-xs text-muted-foreground">{presentCount}/{records.length} marked present or late</p>
        </div>
        <div className="glass-card rounded-xl border border-border p-4">
          <p className="text-sm font-medium">Today</p>
          <p className="mt-2 text-2xl font-semibold">{todayRecords.length}</p>
          <p className="text-xs text-muted-foreground">{todayRecords.length === 1 ? 'record marked' : 'records marked'}</p>
        </div>
        <div className="glass-card rounded-xl border border-border p-4">
          <p className="text-sm font-medium">Open Sessions</p>
          <p className="mt-2 text-2xl font-semibold">{pendingOpenSessions.length}</p>
          <p className="text-xs text-muted-foreground">{pendingOpenSessions.length === 1 ? 'awaiting attendance' : 'awaiting attendance'}</p>
        </div>
      </div>

      {pendingOpenSessions.length > 0 && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Open attendance now</h3>
          </div>
          <div className="space-y-2">
            {pendingOpenSessions.map((session) => (
              <div key={session.id} className="flex flex-col gap-1 rounded-xl border border-primary/20 bg-background/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">{getSessionTitle(session)}</p>
                  <p className="text-xs text-muted-foreground">
                    Expires {new Date(session.code_expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {session.schedules?.scheduled_date && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(`${session.schedules.scheduled_date}T00:00:00`).toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {session.schedules.start_time ? ` · ${session.schedules.start_time}` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-card rounded-2xl p-6 max-w-xl">
        <h3 className="font-semibold mb-1">Enter Attendance Code</h3>
        <p className="text-sm text-muted-foreground mb-4">Use the 6-character code from your tutor while the session is open</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={code}
            onChange={e => { setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleMark()}
            placeholder="e.g. WD4821"
            className="font-mono text-lg tracking-widest text-center uppercase"
            maxLength={6}
            inputMode="text"
          />
          <Button onClick={handleMark} disabled={marking || code.length !== 6} className="sm:w-32">
            {marking ? <Loader2 className="animate-spin h-4 w-4" /> : 'Mark'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Location is requested when available to validate on-site attendance.</p>

        {gpsStatus === 'captured' && (
          <p className="mt-2 text-xs flex items-center gap-1 text-muted-foreground"><MapPin className="h-3.5 w-3.5 text-success" />Location captured</p>
        )}
        {gpsStatus === 'unavailable' && (
          <p className="mt-2 text-xs flex items-center gap-1 text-muted-foreground"><MapPin className="h-3.5 w-3.5 text-warning" />Location unavailable — marked without GPS</p>
        )}

        {result && (
          <div className="mt-4 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Marked as {result.attendance_status}
            </div>
            {typeof result.distance_metres === 'number' && (
              <p className="mt-1 text-xs text-muted-foreground">Distance from class location: {Math.round(result.distance_metres)}m</p>
            )}
          </div>
        )}
        {error && (
          <div className="mt-3 flex items-start gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-semibold">My Attendance History</h3>
          <div className="flex rounded-lg border border-border p-1">
            {[
              { key: 'today', label: 'Today' },
              { key: 'recent', label: 'Recent' },
              { key: 'all', label: 'All' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setHistoryFilter(item.key as typeof historyFilter)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${historyFilter === item.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {visibleRecords.length > 0 ? (
          <div className="space-y-2">
            {visibleRecords.map((r: any) => {
              const session = r.attendance_sessions;
              return (
                <div key={r.id} className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-sm">{getSessionTitle(session)}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{new Date(r.marked_at).toLocaleString()}</span>
                      <span className="capitalize">Method: {r.method}</span>
                      {r.geofence_passed !== null && r.geofence_passed !== undefined && (
                        <span>{r.geofence_passed ? 'Location verified' : 'Location outside range'}</span>
                      )}
                      {r.distance_metres !== null && r.distance_metres !== undefined && (
                        <span>{Math.round(Number(r.distance_metres))}m away</span>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className={`capitalize ${ATTENDANCE_STATUS_COLOURS[r.attendance_status] || ''}`}>
                    {r.attendance_status}
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-10">No attendance records in this view</p>
        )}
      </div>
    </div>
  );
}

function AssignmentsTab({ classroomId, cohortId }: { classroomId: string; cohortId?: string }) {
  const { user } = useAuth();
  const { assignments, loading, refetch } = useStudentAssignments(classroomId, cohortId);
  const [selected, setSelected] = useState<any>(null);
  const [subText, setSubText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'submitted' | 'graded'>('all');
  const [submitting, setSubmitting] = useState(false);
  const { submitAssignment } = useSubmissions(selected?.id || '');

  const resetSubmissionForm = () => {
    setSubText('');
    setLinkUrl('');
    setImageUrl('');
    setImageFile(null);
  };

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

  const handleImageSelect = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5MB or smaller');
      return;
    }
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!subText.trim() && !linkUrl.trim() && !imageFile && !imageUrl) {
      toast.error('Add text, an image, or a link before submitting');
      return;
    }
    if (!selected?.id || !user?.id) return;

    setSubmitting(true);
    try {
      let uploadedImageUrl = imageUrl && !imageUrl.startsWith('blob:') ? imageUrl : '';
      if (imageFile) {
        setUploadingImage(true);
        uploadedImageUrl = await uploadAssignmentImage(imageFile, selected.id, user.id);
        setUploadingImage(false);
      }

      await submitAssignment({
        text: subText,
        imageUrl: uploadedImageUrl || undefined,
        linkUrl: linkUrl || undefined,
        dueDate: selected?.due_date,
      });
      toast.success('Submitted!');
      setSelected(null);
      resetSubmissionForm();
      await refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploadingImage(false);
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
                      setLinkUrl(sub?.link_url || sub?.file_url || '');
                      setImageUrl(sub?.image_url || '');
                      setImageFile(null);
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
                {sub.submission_text && <p className="text-muted-foreground whitespace-pre-wrap">{sub.submission_text}</p>}
                {sub.image_url && (
                  <a href={sub.image_url} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                    <img src={sub.image_url} alt="Submitted" className="max-h-40 rounded-lg border border-border object-cover" />
                  </a>
                )}
                {(sub.link_url || sub.file_url) && (
                  <a href={sub.link_url || sub.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open submitted link
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

      <Dialog open={!!selected} onOpenChange={o => { if (!o) { setSelected(null); resetSubmissionForm(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit: {selected?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            {selected?.instructions && <p className="text-sm text-muted-foreground">{selected.instructions}</p>}
            <div>
              <Label>Your Answer / Notes</Label>
              <Textarea value={subText} onChange={e => setSubText(e.target.value)} rows={6} className="mt-1.5" placeholder="Write your response here..." />
            </div>
            <div>
              <Label>Image</Label>
              <Input type="file" accept="image/*" className="mt-1.5" onChange={e => handleImageSelect(e.target.files?.[0] || null)} />
              {imageUrl && (
                <div className="mt-2 flex items-start gap-3">
                  <img src={imageUrl} alt="Submission preview" className="max-h-32 rounded-lg border border-border object-cover" />
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setImageUrl(''); setImageFile(null); }}>
                    Remove
                  </Button>
                </div>
              )}
            </div>
            <div>
              <Label>Link</Label>
              <Input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://docs.google.com/..." className="mt-1.5" />
            </div>
            <Button onClick={handleSubmit} disabled={submitting || uploadingImage} className="w-full">
              {uploadingImage ? 'Uploading image...' : submitting ? 'Submitting...' : 'Submit Assignment'}
            </Button>
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
    scope_id?: string | null;
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
        .select('cohort_id, status, joined_at, cohorts!inner(cohort_label, scope_type, scope_id, status, start_date, end_date, capacity)')
        .eq('student_id', user.id)
        .eq('cohorts.classroom_id', id)
        .order('joined_at', { ascending: false })
        .limit(10),
      supabase.from('old_lessons')
        .select('*, cohorts(cohort_label)')
        .eq('classroom_id', id)
        .neq('status', 'cancelled')
        .order('lesson_date')
        .order('start_time'),
      supabase.from('assignments').select('id, due_date, cohort_id').eq('classroom_id', id).eq('status', 'published'),
      supabase.from('assignment_submissions').select('assignment_id').eq('student_id', user.id),
    ]).then(([clsRes, cohortRes, lessonsRes, assignmentsRes, submissionsRes]) => {
      const cohortRows = cohortRes.data || [];
      const selectedCohortRow = cohortRows.find((row: any) => row.status === 'active' && row.cohorts?.status === 'active')
        || cohortRows.find((row: any) => row.status === 'active')
        || cohortRows.find((row: any) => row.cohorts?.status === 'active')
        || cohortRows[0];

      setClassroom(clsRes.data);
      setCohortId(selectedCohortRow?.cohort_id || '');
      setCohortInfo((selectedCohortRow as any)?.cohorts || null);
      setLessons(lessonsRes.data || []);
      const currentCohortId = selectedCohortRow?.cohort_id || '';
      const submittedIds = new Set((submissionsRes.data || []).map((submission: any) => submission.assignment_id));
      const visibleAssignments = (assignmentsRes.data || []).filter((assignment: any) => !assignment.cohort_id || assignment.cohort_id === currentCohortId);
      const pendingAssignments = visibleAssignments.filter((assignment: any) => !submittedIds.has(assignment.id));
      setAssignmentSummary({
        pending: pendingAssignments.length,
        overdue: pendingAssignments.filter((assignment: any) => assignment.due_date && new Date(assignment.due_date) < new Date()).length,
      });
      setLoading(false);
    });
  }, [id, user]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  if (!classroom) return <div className="text-center py-20 text-muted-foreground">Classroom not found.</div>;

  const visibleLessons = lessons.filter(l => !l.cohort_id || l.cohort_id === cohortId);
  const todayLessons = visibleLessons.filter(l => l.lesson_date === today);
  const upcomingLessons = visibleLessons.filter(l => l.lesson_date > today);
  const pastLessons = visibleLessons.filter(l => l.lesson_date < today);
  const visibleSchedules = schedules.filter(s => !s.cohort_id || s.cohort_id === cohortId);
  const activeSchedules = visibleSchedules.filter(s => s.status !== 'cancelled');
  const todaySchedules = activeSchedules.filter(s => s.scheduled_date === today);
  const upcomingSchedules = activeSchedules.filter(s => s.scheduled_date > today);
  const pastSchedules = visibleSchedules.filter(s => s.scheduled_date < today);
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
      <PageHeader
        title={classroom.name}
        description={[
          classroom.programs?.program_name,
          cohortInfo?.cohort_label ? `Cohort: ${cohortInfo.cohort_label}` : null,
        ].filter(Boolean).join(' · ')}
      />

      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        {cohortInfo ? (
          <>
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
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Your cohort:</span>
            <Badge variant="outline" className="text-muted-foreground">No cohort assigned</Badge>
          </div>
        )}
      </div>

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

      <Tabs defaultValue="curriculum">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="curriculum"><LayoutList className="h-4 w-4 mr-1.5" />Curriculum</TabsTrigger>
          <TabsTrigger value="schedule"><Calendar className="h-4 w-4 mr-1.5" />Schedule</TabsTrigger>
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

              if (visibleSchedules.length === 0 && visibleLessons.length === 0) return (
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
                  {visibleSchedules.length === 0 && visibleLessons.length > 0 && (
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
          <StudentCurriculumView
            classroomId={id!}
            scopeType={cohortInfo?.scope_type}
            scopeId={cohortInfo?.scope_id}
          />
        </TabsContent>

        {/* ATTENDANCE */}
        <TabsContent value="attendance">
          <AttendanceTab classroomId={id!} cohortId={cohortId} />
        </TabsContent>

        {/* ASSIGNMENTS */}
        <TabsContent value="assignments">
          <AssignmentsTab classroomId={id!} cohortId={cohortId} />
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
