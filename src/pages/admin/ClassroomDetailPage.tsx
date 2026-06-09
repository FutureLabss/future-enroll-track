import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useClassroom, useClassroomCohorts } from '@/hooks/useClassroom';
import { useAttendance, useAttendanceSession } from '@/hooks/useAttendance';
import { useAssignments } from '@/hooks/useAssignments';
import { useSchedules } from '@/hooks/useSchedules';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DataTable } from '@/components/shared/DataTable';
import { CurriculumTreeV2 } from '@/components/classroom/CurriculumTreeV2';
import { AutoScheduleWizard } from '@/components/classroom/AutoScheduleWizard';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import {
  Users, BookOpen, Calendar, ClipboardList, BarChart2, UserPlus, Loader2,
  GraduationCap, LayoutList, Layers, Plus, Pencil, Ban, CheckCircle, PlayCircle,
  XCircle, ChevronDown, ChevronRight, Eye, Mail, ArrowLeftRight, ArrowLeft,
  Archive, RotateCcw, ClipboardCheck, CalendarDays,
} from 'lucide-react';

const COHORT_STATUSES = ['upcoming', 'active', 'completed', 'archived'] as const;
const STATUS_COLOURS: Record<string, string> = {
  upcoming: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  active: 'bg-success/15 text-success border-success/30',
  completed: 'bg-muted text-muted-foreground border-muted',
  archived: 'bg-muted/50 text-muted-foreground/60 border-muted',
  scheduled: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  in_progress: 'bg-warning/15 text-warning border-warning/30',
  cancelled: 'bg-destructive/15 text-destructive border-destructive/30',
};

function CohortModal({ classroomId, programId, existing, onClose, onSaved, staffList }: any) {
  const { createCohort, updateCohort } = useClassroomCohorts(classroomId);
  const [scopeOptions, setScopeOptions] = useState<{ curricula: any[]; tracks: any[]; modules: any[] }>({ curricula: [], tracks: [], modules: [] });

  useEffect(() => {
    supabase.rpc('get_classroom_scope_options', { p_classroom_id: classroomId })
      .then(({ data }) => { if (data) setScopeOptions(data as any); });
  }, [classroomId]);

  const [form, setForm] = useState({
    cohort_label: existing?.cohort_label || '',
    start_date: existing?.start_date || '',
    end_date: existing?.end_date || '',
    status: existing?.status || 'upcoming',
    capacity: existing?.capacity?.toString() || '',
    scope_type: (existing?.scope_type || '') as '' | 'curriculum' | 'track' | 'module',
    scope_id: existing?.scope_id || '',
  });
  const [scheduleOpts, setScheduleOpts] = useState({ enabled: false, days: [] as string[], start_time: '09:00', end_time: '11:00', instructor_id: '' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.cohort_label.trim()) { toast.error('Cohort label is required'); return; }
    if (!existing && scheduleOpts.enabled && scheduleOpts.days.length === 0) { toast.error('Select at least one day for scheduling'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        capacity: form.capacity ? Number(form.capacity) : null,
        scope_type: form.scope_type || null,
        scope_id: form.scope_id || null,
      };
      if (existing) {
        await updateCohort(existing.id, payload);
        toast.success('Cohort updated');
      } else {
        const newId = await createCohort({ ...payload, program_id: programId });
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
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 mt-2">
      <div><Label>Cohort Label *</Label><Input value={form.cohort_label} onChange={e => setForm({ ...form, cohort_label: e.target.value })} className="mt-1.5" placeholder="e.g. May 2026 Intake" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="mt-1.5" /></div>
        <div><Label>End Date</Label><Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="mt-1.5" /></div>
      </div>
      <div>
        <Label>Capacity</Label>
        <Input type="number" min="1" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} className="mt-1.5" placeholder="Optional maximum students" />
      </div>
      <div>
        <Label>Status</Label>
        <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            {COHORT_STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Scope</Label>
        <Select value={form.scope_type} onValueChange={v => setForm({ ...form, scope_type: v as any, scope_id: '' })}>
          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Entire classroom (no scope)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="curriculum">Curriculum</SelectItem>
            <SelectItem value="track">Track</SelectItem>
            <SelectItem value="module">Module</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {form.scope_type === 'curriculum' && scopeOptions.curricula.length > 0 && (
        <div>
          <Label>Curriculum</Label>
          <Select value={form.scope_id} onValueChange={v => setForm({ ...form, scope_id: v })}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select curriculum" /></SelectTrigger>
            <SelectContent>{scopeOptions.curricula.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      {form.scope_type === 'track' && scopeOptions.tracks.length > 0 && (
        <div>
          <Label>Track</Label>
          <Select value={form.scope_id} onValueChange={v => setForm({ ...form, scope_id: v })}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select track" /></SelectTrigger>
            <SelectContent>{scopeOptions.tracks.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      {form.scope_type === 'module' && scopeOptions.modules.length > 0 && (
        <div>
          <Label>Module</Label>
          <Select value={form.scope_id} onValueChange={v => setForm({ ...form, scope_id: v })}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select module" /></SelectTrigger>
            <SelectContent>{scopeOptions.modules.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      {/* Auto-schedule (create only) */}
      {!existing && (
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
              {staffList?.length > 0 && (
                <div>
                  <Label className="text-xs">Instructor (optional)</Label>
                  <Select value={scheduleOpts.instructor_id} onValueChange={v => setScheduleOpts(o => ({ ...o, instructor_id: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Assign instructor" /></SelectTrigger>
                    <SelectContent>{staffList.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </div>
      )}
      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? 'Saving...' : existing ? 'Update Cohort' : 'Create Cohort'}
      </Button>
    </div>
  );
}

function CohortStudentsModal({ cohort, classroomId, onClose }: { cohort: any; classroomId: string; onClose: () => void }) {
  const [enrolled, setEnrolled] = useState<any[]>([]);
  // Maps student_id → cohort_students.id (row id needed for remove RPC)
  const [memberRows, setMemberRows] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: enr }, { data: mem }] = await Promise.all([
        supabase.rpc('get_classroom_students', { p_classroom_id: classroomId }),
        supabase.rpc('get_cohort_members', { p_cohort_id: cohort.id }),
      ]);
      setEnrolled(enr || []);
      setMemberRows(new Map((mem || []).map((r: any) => [r.student_id, r.id])));
      setLoading(false);
    };
    load();
  }, [cohort.id, classroomId]);

  const toggle = async (enrollment: any) => {
    if (!enrollment.user_id) return;
    setBusy(enrollment.user_id);
    try {
      const rowId = memberRows.get(enrollment.user_id);
      if (rowId) {
        const { error } = await supabase.rpc('remove_student_from_cohort', { p_id: rowId });
        if (error) throw error;
        setMemberRows(prev => { const m = new Map(prev); m.delete(enrollment.user_id); return m; });
      } else {
        const { error } = await supabase.rpc('add_student_to_cohort', {
          p_cohort_id: cohort.id,
          p_student_id: enrollment.user_id,
          p_enrollment_id: enrollment.id,
        });
        if (error) throw error;
        // Re-fetch to get the new row id
        const { data: mem } = await supabase.rpc('get_cohort_members', { p_cohort_id: cohort.id });
        setMemberRows(new Map((mem || []).map((r: any) => [r.student_id, r.id])));
      }
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
        <p className="text-sm text-muted-foreground text-center py-6">No active or pending enrollments found.</p>
      ) : (
        enrolled.map(e => {
          const inCohort = memberRows.has(e.user_id);
          return (
            <div key={e.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">{e.full_name || '—'}</p>
                <p className="text-xs text-muted-foreground">{e.email}</p>
              </div>
              {!e.user_id ? (
                <span className="text-xs text-muted-foreground border border-border rounded px-2 py-0.5">No account</span>
              ) : (
                <Button
                  size="sm"
                  variant={inCohort ? 'destructive' : 'outline'}
                  className="h-7 text-xs"
                  disabled={busy === e.user_id}
                  onClick={() => toggle(e)}
                >
                  {busy === e.user_id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : inCohort ? 'Remove' : 'Add'}
                </Button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function SwitchClassroomDialog({ student, fromClassroomId, programId, onClose, onSwitched }: {
  student: any; fromClassroomId: string; programId: string | null; onClose: () => void; onSwitched: () => void;
}) {
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [toClassroomId, setToClassroomId] = useState('');
  const [toCohortId, setToCohortId] = useState('');
  const [reason, setReason] = useState('');
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!programId) return;
    supabase.from('classrooms')
      .select('id, name')
      .eq('program_id', programId)
      .eq('status', 'active')
      .neq('id', fromClassroomId)
      .then(({ data }) => setClassrooms(data || []));
  }, [programId, fromClassroomId]);

  useEffect(() => {
    setCohorts([]);
    setToCohortId('');
    if (!toClassroomId) return;
    supabase.from('cohorts')
      .select('id, cohort_label')
      .eq('classroom_id', toClassroomId)
      .in('status', ['active', 'upcoming'])
      .order('start_date', { ascending: false })
      .then(({ data }) => setCohorts(data || []));
  }, [toClassroomId]);

  const handleSwitch = async () => {
    if (!toClassroomId) { toast.error('Select a destination classroom'); return; }
    setSwitching(true);
    try {
      const { error } = await supabase.rpc('switch_student_classroom' as any, {
        p_student_id: student.user_id,
        p_from_classroom_id: fromClassroomId,
        p_to_classroom_id: toClassroomId,
        p_to_cohort_id: toCohortId || null,
        p_reason: reason,
      });
      if (error) throw error;
      toast.success(`${student.full_name} switched to new classroom`);
      onSwitched();
      onClose();
    } catch (e: any) { toast.error(e.message); } finally { setSwitching(false); }
  };

  return (
    <div className="space-y-4 mt-2">
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Student: </span>
        <span className="font-medium">{student.full_name}</span>
        <span className="text-muted-foreground ml-2">({student.email})</span>
      </div>
      <div>
        <Label>Destination Classroom *</Label>
        {classrooms.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-2">No other active classrooms for this program.</p>
        ) : (
          <Select value={toClassroomId} onValueChange={setToClassroomId}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select classroom..." /></SelectTrigger>
            <SelectContent>
              {classrooms.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
      {toClassroomId && (
        <div>
          <Label>Assign to Cohort <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Select value={toCohortId} onValueChange={setToCohortId}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder={cohorts.length ? 'Select cohort...' : 'No active cohorts'} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">No cohort</SelectItem>
              {cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div>
        <Label>Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Scheduling conflict, cohort reassignment..."
          className="mt-1.5"
          rows={2}
        />
      </div>
      <Button onClick={handleSwitch} disabled={switching || !toClassroomId || classrooms.length === 0} className="w-full">
        {switching ? <><Loader2 className="animate-spin h-4 w-4 mr-2" />Switching...</> : <><ArrowLeftRight className="h-4 w-4 mr-2" />Switch Classroom</>}
      </Button>
    </div>
  );
}

function AttendanceDrillDown({ session }: { session: any }) {
  const { records, absentStudents, loading } = useAttendanceSession(session.id);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6 text-primary" /></div>;

  return (
    <div className="space-y-6">
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
                  <span className="text-muted-foreground ml-2">{r.profiles?.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  {r.lat && <span className="text-xs text-muted-foreground">GPS</span>}
                  <Badge variant="outline" className={STATUS_COLOURS[r.attendance_status] || ''}>
                    {r.attendance_status}
                  </Badge>
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
                <span className="text-muted-foreground">{s.profiles?.email}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {records.length === 0 && absentStudents.length === 0 && (
        <p className="text-center text-muted-foreground py-6">No attendance data for this session</p>
      )}
    </div>
  );
}

function AttendanceTab({ sessions, cohorts, onView }: { sessions: any[]; cohorts: any[]; onView: (s: any) => void }) {
  const [filterCohort, setFilterCohort] = useState('all');
  const visible = filterCohort === 'all' ? sessions : sessions.filter(s => s.cohort_id === filterCohort);
  return (
    <div className="space-y-3">
      {cohorts.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={filterCohort} onValueChange={setFilterCohort}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cohorts</SelectItem>
              {cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        {visible.map((s: any) => (
          <div key={s.id} className="rounded-xl border border-border px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-lg tracking-widest">{s.code}</span>
                <Badge variant={s.status === 'open' ? 'default' : 'secondary'}>{s.status}</Badge>
                {s.cohorts?.cohort_label && (
                  <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">{s.cohorts.cohort_label}</Badge>
                )}
                <span className="text-sm text-muted-foreground">{s.schedules?.lessons?.title || s.schedules?.title || s.old_lessons?.title || 'No lesson'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</span>
                <Button size="sm" variant="outline" onClick={() => onView(s)}>
                  <Eye className="h-3.5 w-3.5 mr-1" />View
                </Button>
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="text-center text-muted-foreground py-10">
            {filterCohort === 'all' ? 'No attendance sessions yet' : 'No sessions for this cohort'}
          </p>
        )}
      </div>
    </div>
  );
}

function ClassroomEditModal({ classroom, onSave }: { classroom: any; onSave: (payload: any) => Promise<void> }) {
  const [form, setForm] = useState({
    name: classroom.name || '',
    description: classroom.description || '',
    location: classroom.location || '',
    gps_lat: classroom.gps_lat?.toString() || '',
    gps_lng: classroom.gps_lng?.toString() || '',
    attendance_radius_metres: classroom.attendance_radius_metres?.toString() || '100',
    geofencing_enabled: !!classroom.geofencing_enabled,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Classroom name is required'); return; }
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        gps_lat: form.gps_lat ? Number(form.gps_lat) : null,
        gps_lng: form.gps_lng ? Number(form.gps_lng) : null,
        attendance_radius_metres: Number(form.attendance_radius_metres) || 100,
        geofencing_enabled: form.geofencing_enabled,
      });
      toast.success('Classroom updated');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 mt-2">
      <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1.5" /></div>
      <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-1.5" rows={2} /></div>
      <div><Label>Location</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="mt-1.5" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Latitude</Label><Input type="number" step="any" value={form.gps_lat} onChange={e => setForm({ ...form, gps_lat: e.target.value })} className="mt-1.5" /></div>
        <div><Label>Longitude</Label><Input type="number" step="any" value={form.gps_lng} onChange={e => setForm({ ...form, gps_lng: e.target.value })} className="mt-1.5" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3 items-end">
        <div><Label>Attendance Radius (m)</Label><Input type="number" value={form.attendance_radius_metres} onChange={e => setForm({ ...form, attendance_radius_metres: e.target.value })} className="mt-1.5" /></div>
        <div className="flex items-center gap-3 pb-2">
          <Switch checked={form.geofencing_enabled} onCheckedChange={v => setForm({ ...form, geofencing_enabled: v })} />
          <Label>Geofencing</Label>
        </div>
      </div>
      <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? 'Saving...' : 'Save Classroom'}</Button>
    </div>
  );
}

export default function ClassroomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isSuperadmin } = useAuth();
  const { classroom, loading, updateClassroom } = useClassroom(id!);
  const { cohorts, refetch: refetchCohorts } = useClassroomCohorts(id!);
  const { sessions } = useAttendance(id!);
  const { assignments, publishAssignment, createAssignment } = useAssignments(id!);
  const { schedules, refetch: refetchSchedules } = useSchedules(id!);

  const [staff, setStaff] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [staffRoster, setStaffRoster] = useState<any[]>([]);

  // Modals
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [cohortModal, setCohortModal] = useState<{ open: boolean; cohort?: any }>({ open: false });
  const [cohortStudentsModal, setCohortStudentsModal] = useState<{ open: boolean; cohort?: any }>({ open: false });
  const [inviteForm, setInviteForm] = useState({ staff_id: '', staff_type: 'teaching' });
  const [inviting, setInviting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);


  const [permissionsModal, setPermissionsModal] = useState<{ open: boolean; cs?: any }>({ open: false });
  const [perms, setPerms] = useState<any>({});
  const [savingPerms, setSavingPerms] = useState(false);

  const [lessonEditModal, setLessonEditModal] = useState<{ open: boolean; lesson?: any }>({ open: false });
  const [lessonForm, setLessonForm] = useState<any>({});
  const [savingLesson, setSavingLesson] = useState(false);

  const [sessionModal, setSessionModal] = useState<{ open: boolean; session?: any }>({ open: false });
  const [switchModal, setSwitchModal] = useState<{ open: boolean; student?: any }>({ open: false });
  const [sendingReminders, setSendingReminders] = useState(false);
  const [autoScheduleOpen, setAutoScheduleOpen] = useState(false);
  const [assignmentModal, setAssignmentModal] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({ title: '', instructions: '', due_date: '', cohort_id: '', status: 'draft' });
  const [savingAssignment, setSavingAssignment] = useState(false);

  useEffect(() => { if (id) loadAll(); }, [id]);

  useEffect(() => {
    if (id) supabase.rpc('get_classroom_students', { p_classroom_id: id }).then(({ data }) => setStudents(data || []));
  }, [id]);

  const handleCreateAssignment = async () => {
    if (!assignmentForm.title.trim()) { toast.error('Title is required'); return; }
    setSavingAssignment(true);
    try {
      await createAssignment({
        title: assignmentForm.title.trim(),
        instructions: assignmentForm.instructions.trim() || null,
        due_date: assignmentForm.due_date || null,
        cohort_id: assignmentForm.cohort_id || null,
        status: assignmentForm.status,
      });
      toast.success('Assignment created');
      setAssignmentModal(false);
      setAssignmentForm({ title: '', instructions: '', due_date: '', cohort_id: '', status: 'draft' });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleSendReminders = async () => {
    if (!classroom?.program_id) return;
    const needsReminder = students.filter(s => !s.user_id || !s.full_name?.trim());
    if (needsReminder.length === 0) { toast.info('All students have accounts and complete profiles.'); return; }
    if (!confirm(`Send reminder emails to ${needsReminder.length} student(s) who need to set up their account or complete their profile?`)) return;
    setSendingReminders(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-account-reminders', {
        body: { program_id: classroom.program_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Sent ${data.signup_sent} account setup + ${data.profile_sent} profile reminders${data.failed ? ` (${data.failed} failed)` : ''}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSendingReminders(false);
    }
  };

  const loadAll = async () => {
    const [staffRes, lessonsRes, rosterRes] = await Promise.all([
      supabase.from('classroom_staff')
        .select('*, staff(full_name, email, role_title), classroom_permissions(*)')
        .eq('classroom_id', id).eq('status', 'active'),
      supabase.from('old_lessons')
        .select('*, staff:tutor_id(full_name), cohorts(cohort_label)')
        .eq('classroom_id', id).order('lesson_date', { ascending: false }),
      supabase.from('staff').select('id, full_name, role_title, email, program_id').eq('active', true),
    ]);
    setStaff(staffRes.data || []);
    setLessons(lessonsRes.data || []);
    setStaffRoster(rosterRes.data || []);
  };

  const handleInvite = async () => {
    if (!inviteForm.staff_id) { toast.error('Select a staff member'); return; }
    setInviting(true);
    try {
      const { data: invitationId, error } = await supabase.rpc('assign_staff_to_classroom', {
        p_classroom_id: id,
        p_staff_id: inviteForm.staff_id,
        p_staff_type: inviteForm.staff_type,
      });
      if (error) throw error;

      // Fetch the generated token
      const { data: inv } = await supabase
        .from('staff_invitations')
        .select('token')
        .eq('id', invitationId)
        .single();

      if (inv?.token) {
        const staffMember = staffRoster.find(s => s.id === inviteForm.staff_id);
        const { data: { session } } = await supabase.auth.getSession();
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-staff-invitation`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session?.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: staffMember?.email,
              name: staffMember?.full_name,
              classroom: classroom?.name,
              token: inv.token,
              staffType: inviteForm.staff_type,
            }),
          }
        );
      }

      toast.success('Staff assigned and invitation email sent');
      setInviteOpen(false);
      loadAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeStaff = async (csId: string) => {
    const { error } = await supabase.from('classroom_staff').update({ status: 'revoked' }).eq('id', csId);
    if (error) { toast.error(error.message); return; }
    toast.success('Access revoked');
    loadAll();
  };

  const handleClassroomStatus = async (status: 'active' | 'archived') => {
    if (status === 'archived' && !confirm(`Archive "${classroom?.name}"? Staff and students can still be reviewed, but it will be treated as inactive.`)) return;
    setUpdatingStatus(true);
    try {
      await updateClassroom({ status });
      toast.success(status === 'active' ? 'Classroom reactivated' : 'Classroom archived');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const openPermissions = (cs: any) => {
    setPerms(cs.classroom_permissions || {});
    setPermissionsModal({ open: true, cs });
  };

  const handleSavePerms = async () => {
    const cs = permissionsModal.cs;
    if (!cs) return;
    setSavingPerms(true);
    const { error } = await supabase.from('classroom_permissions')
      .update({
        can_create_lessons: perms.can_create_lessons,
        can_edit_cohorts: perms.can_edit_cohorts,
        can_schedule: perms.can_schedule,
        can_create_assignments: perms.can_create_assignments,
        can_start_attendance: perms.can_start_attendance,
        can_view_students: perms.can_view_students,
      })
      .eq('classroom_staff_id', cs.id);
    setSavingPerms(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Permissions updated');
    setPermissionsModal({ open: false });
    loadAll();
  };

  const handleLessonStatus = async (lessonId: string, status: string) => {
    const { error } = await supabase.from('old_lessons').update({ status }).eq('id', lessonId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Lesson marked as ${status}`);
    loadAll();
  };

  const openLessonEdit = (lesson: any) => {
    setLessonForm({
      title: lesson.title,
      lesson_date: lesson.lesson_date,
      start_time: lesson.start_time,
      end_time: lesson.end_time,
      location: lesson.location || '',
      week_number: lesson.week_number?.toString() || '',
    });
    setLessonEditModal({ open: true, lesson });
  };

  const handleSaveLesson = async () => {
    const lesson = lessonEditModal.lesson;
    if (!lesson) return;
    setSavingLesson(true);
    const { error } = await supabase.from('old_lessons').update({
      title: lessonForm.title,
      lesson_date: lessonForm.lesson_date,
      start_time: lessonForm.start_time,
      end_time: lessonForm.end_time,
      location: lessonForm.location || null,
      week_number: lessonForm.week_number ? parseInt(lessonForm.week_number) : null,
    }).eq('id', lesson.id);
    setSavingLesson(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Lesson updated');
    setLessonEditModal({ open: false });
    loadAll();
  };

  const handleDeleteLesson = async (lessonId: string) => {
    const { error } = await supabase.from('old_lessons').delete().eq('id', lessonId);
    if (error) { toast.error(error.message); return; }
    toast.success('Lesson deleted');
    loadAll();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  if (!classroom) return <div className="text-center py-20 text-muted-foreground">Classroom not found.</div>;

  const programId = (classroom as any).program_id || null;

  const staffColumns = [
    { key: 'name', header: 'Name', render: (r: any) => r.staff?.full_name || '—' },
    { key: 'role_title', header: 'Role', render: (r: any) => r.staff?.role_title || '—' },
    { key: 'type', header: 'Type', render: (r: any) => (
      <Badge variant={r.staff_type === 'teaching' ? 'default' : 'secondary'} className="capitalize">
        {r.staff_type === 'teaching' ? 'Teaching' : 'Non-Teaching'}
      </Badge>
    )},
    { key: 'perms', header: 'Permissions', render: (r: any) => {
      const p = r.classroom_permissions;
      if (!p) return <span className="text-muted-foreground text-sm">—</span>;
      const flags = [
        p.can_create_lessons && 'Lessons',
        p.can_schedule && 'Schedule',
        p.can_start_attendance && 'Attendance',
        p.can_create_assignments && 'Assignments',
      ].filter(Boolean);
      return <span className="text-sm">{flags.length ? flags.join(', ') : 'View only'}</span>;
    }},
    { key: 'actions', header: '', render: (r: any) => isSuperadmin ? (
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => openPermissions(r)}><Pencil className="h-3.5 w-3.5 mr-1" />Permissions</Button>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleRevokeStaff(r.id)}><Ban className="h-3.5 w-3.5 mr-1" />Revoke</Button>
      </div>
    ) : null },
  ];

  const studentColumns = [
    { key: 'name', header: 'Student', render: (r: any) => r.full_name || <span className="text-muted-foreground text-sm">—</span> },
    { key: 'email', header: 'Email', render: (r: any) => r.email || '—' },
    { key: 'cohort', header: 'Cohort', render: (r: any) => r.cohort_label || <span className="text-muted-foreground text-sm">—</span> },
    { key: 'status', header: 'Status', render: (r: any) => (
      <Badge variant="outline" className={`capitalize ${STATUS_COLOURS[r.enrollment_status] || ''}`}>{r.enrollment_status}</Badge>
    )},
    { key: 'account', header: 'Account', render: (r: any) => r.user_id
      ? <Badge variant="outline" className="bg-success/10 text-success border-success/30">Active</Badge>
      : <Badge variant="outline" className="text-muted-foreground">No account</Badge>
    },
    { key: 'actions', header: '', render: (r: any) => r.user_id ? (
      <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-foreground" onClick={() => setSwitchModal({ open: true, student: r })} title="Switch classroom">
        <ArrowLeftRight className="h-3.5 w-3.5" />
      </Button>
    ) : null },
  ];

  const lessonColumns = [
    { key: 'date', header: 'Date', render: (r: any) => new Date(r.lesson_date).toLocaleDateString() },
    { key: 'title', header: 'Lesson', render: (r: any) => r.title },
    { key: 'time', header: 'Time', render: (r: any) => `${r.start_time} – ${r.end_time}` },
    { key: 'tutor', header: 'Tutor', render: (r: any) => r.staff?.full_name || '—' },
    { key: 'cohort', header: 'Cohort', render: (r: any) => r.cohorts?.cohort_label || 'All' },
    { key: 'status', header: 'Status', render: (r: any) => (
      <Badge variant="outline" className={`capitalize ${STATUS_COLOURS[r.status] || ''}`}>{r.status}</Badge>
    )},
    { key: 'actions', header: '', render: (r: any) => (
      <div className="flex gap-1">
        {r.status === 'scheduled' && (
          <Button size="sm" variant="ghost" className="text-warning h-7 px-2" onClick={() => handleLessonStatus(r.id, 'in_progress')} title="Start"><PlayCircle className="h-4 w-4" /></Button>
        )}
        {r.status === 'in_progress' && (
          <Button size="sm" variant="ghost" className="text-success h-7 px-2" onClick={() => handleLessonStatus(r.id, 'completed')} title="Complete"><CheckCircle className="h-4 w-4" /></Button>
        )}
        {(r.status === 'scheduled' || r.status === 'in_progress') && (
          <Button size="sm" variant="ghost" className="text-destructive h-7 px-2" onClick={() => handleLessonStatus(r.id, 'cancelled')} title="Cancel"><XCircle className="h-4 w-4" /></Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openLessonEdit(r)} title="Edit"><Pencil className="h-4 w-4" /></Button>
      </div>
    )},
  ];

  const scheduleColumns = [
    { key: 'date', header: 'Date', render: (r: any) => new Date(r.scheduled_date + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) },
    { key: 'title', header: 'Session / Unit', render: (r: any) => <span className="font-medium">{r.title || r.lessons?.title || '—'}</span> },
    { key: 'time', header: 'Time', render: (r: any) => `${r.start_time} – ${r.end_time}` },
    { key: 'module', header: 'Module', render: (r: any) => r.modules?.title || '—' },
    { key: 'cohort', header: 'Cohort', render: (r: any) => r.cohorts?.cohort_label || 'All' },
    { key: 'instructor', header: 'Instructor', render: (r: any) => r.staff?.full_name || '—' },
    { key: 'status', header: 'Status', render: (r: any) => <Badge variant="outline" className={`capitalize ${STATUS_COLOURS[r.status] || ''}`}>{r.status}</Badge> },
  ];

  const cohortColumns = [
    { key: 'cohort_label', header: 'Cohort', render: (r: any) => <span className="font-medium">{r.cohort_label}</span> },
    { key: 'status', header: 'Status', render: (r: any) => (
      <Badge variant="outline" className={`capitalize ${STATUS_COLOURS[r.status] || ''}`}>{r.status || '—'}</Badge>
    )},
    { key: 'students', header: 'Students', render: (r: any) => r.cohort_students?.[0]?.count ?? 0 },
    { key: 'capacity', header: 'Capacity', render: (r: any) => r.capacity || '—' },
    { key: 'scope', header: 'Scope', render: (r: any) => r.scope_type ? <span className="capitalize">{r.scope_type}</span> : 'Entire classroom' },
    { key: 'start_date', header: 'Start', render: (r: any) => r.start_date ? new Date(r.start_date).toLocaleDateString() : '—' },
    { key: 'end_date', header: 'End', render: (r: any) => r.end_date ? new Date(r.end_date).toLocaleDateString() : '—' },
    { key: 'actions', header: '', render: (r: any) => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={(event) => { event.stopPropagation(); setCohortStudentsModal({ open: true, cohort: r }); }}>
          <Users className="h-3.5 w-3.5 mr-1" />Students
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={(event) => { event.stopPropagation(); setCohortModal({ open: true, cohort: r }); }}>
          <Pencil className="h-3.5 w-3.5 mr-1" />Edit
        </Button>
      </div>
    )},
  ];

  const assignmentColumns = [
    { key: 'title', header: 'Assignment', render: (r: any) => <span className="font-medium">{r.title}</span> },
    { key: 'cohort', header: 'Cohort', render: (r: any) => r.cohorts?.cohort_label || 'All' },
    { key: 'unit', header: 'Unit', render: (r: any) => r.units?.title || '—' },
    { key: 'due_date', header: 'Due', render: (r: any) => r.due_date ? new Date(r.due_date).toLocaleDateString() : '—' },
    { key: 'status', header: 'Status', render: (r: any) => <Badge variant="outline" className="capitalize">{r.status}</Badge> },
    { key: 'actions', header: '', render: (r: any) => r.status !== 'published' ? (
      <Button size="sm" variant="outline" onClick={async () => {
        try { await publishAssignment(r.id); toast.success('Assignment published'); } catch (e: any) { toast.error(e.message); }
      }}>
        <ClipboardCheck className="h-3.5 w-3.5 mr-1" />Publish
      </Button>
    ) : null },
  ];

  const permKeys = [
    { key: 'can_create_lessons', label: 'Create & edit lessons' },
    { key: 'can_edit_cohorts', label: 'Manage cohorts' },
    { key: 'can_schedule', label: 'Schedule lessons' },
    { key: 'can_create_assignments', label: 'Create assignments' },
    { key: 'can_start_attendance', label: 'Start attendance sessions' },
    { key: 'can_view_students', label: 'View student list' },
  ] as const;

  return (
    <div>
      <button
        onClick={() => navigate('/admin/classrooms')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Classrooms
      </button>
      <PageHeader
        title={classroom.name}
        description={`${(classroom as any).programs?.program_name || 'No program'} · ${classroom.location || 'No location'}`}
        actions={
          <div className="flex items-center gap-2">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild><Button variant="outline"><Pencil className="h-4 w-4 mr-2" />Edit</Button></DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Edit Classroom</DialogTitle></DialogHeader>
                <ClassroomEditModal classroom={classroom} onSave={async (payload) => { await updateClassroom(payload); setEditOpen(false); }} />
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              disabled={updatingStatus}
              onClick={() => handleClassroomStatus(classroom.status === 'archived' ? 'active' : 'archived')}
            >
              {classroom.status === 'archived' ? <RotateCcw className="h-4 w-4 mr-2" /> : <Archive className="h-4 w-4 mr-2" />}
              {classroom.status === 'archived' ? 'Reactivate' : 'Archive'}
            </Button>
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button><UserPlus className="h-4 w-4 mr-2" />Invite Staff</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Assign Staff to Classroom</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-3">
                  <div>
                    <Label>Staff Member *</Label>
                    {(() => {
                      const cpId = (classroom as any).program_id;
                      const matched = cpId ? staffRoster.filter(s => !s.program_id || s.program_id === cpId) : staffRoster;
                      const other = cpId ? staffRoster.filter(s => s.program_id && s.program_id !== cpId) : [];
                      return (
                        <>
                          <Select value={inviteForm.staff_id} onValueChange={v => setInviteForm({ ...inviteForm, staff_id: v })}>
                            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select staff..." /></SelectTrigger>
                            <SelectContent>
                              {matched.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name} — {s.role_title || s.email}</SelectItem>)}
                              {other.length > 0 && <div className="px-2 py-1 text-xs text-muted-foreground border-t mt-1">Other programs</div>}
                              {other.map(s => <SelectItem key={s.id} value={s.id} className="text-muted-foreground">{s.full_name} — {s.role_title || s.email}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {cpId && matched.length === 0 && (
                            <p className="text-xs text-muted-foreground mt-1">No staff assigned to this program. Set a program on staff members in Payroll → Staff.</p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div>
                    <Label>Role in Classroom *</Label>
                    <Select value={inviteForm.staff_type} onValueChange={v => setInviteForm({ ...inviteForm, staff_type: v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="teaching">Teaching Staff</SelectItem>
                        <SelectItem value="non_teaching">Non-Teaching Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleInvite} disabled={inviting} className="w-full">
                    {inviting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                    {inviting ? 'Assigning...' : 'Assign & Send Invitation'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList className="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="overview"><BarChart2 className="h-4 w-4 mr-1.5" />Overview</TabsTrigger>
          <TabsTrigger value="cohorts"><Layers className="h-4 w-4 mr-1.5" />Cohorts ({cohorts.length})</TabsTrigger>
          <TabsTrigger value="curriculum"><LayoutList className="h-4 w-4 mr-1.5" />Curriculum</TabsTrigger>
          <TabsTrigger value="staff"><Users className="h-4 w-4 mr-1.5" />Staff ({staff.length})</TabsTrigger>
          <TabsTrigger value="students"><GraduationCap className="h-4 w-4 mr-1.5" />Students ({students.length})</TabsTrigger>
          <TabsTrigger value="schedule"><Calendar className="h-4 w-4 mr-1.5" />Schedule</TabsTrigger>
          <TabsTrigger value="assignments"><ClipboardCheck className="h-4 w-4 mr-1.5" />Assignments</TabsTrigger>
          <TabsTrigger value="attendance"><ClipboardList className="h-4 w-4 mr-1.5" />Attendance</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Staff', value: staff.length, icon: Users },
              { label: 'Students', value: students.length, icon: GraduationCap },
              { label: 'Lessons', value: lessons.length, icon: BookOpen },
              { label: 'Cohorts', value: cohorts.length, icon: Layers },
              { label: 'Assignments', value: assignments.length, icon: ClipboardCheck },
              { label: 'Attendance Sessions', value: sessions.length, icon: ClipboardList },
            ].map(s => (
              <div key={s.label} className="glass-card rounded-xl p-4 text-center">
                <s.icon className="h-5 w-5 mx-auto mb-1 text-primary" />
                <div className="text-2xl font-bold font-heading">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="glass-card rounded-2xl p-5">
            <h3 className="font-semibold mb-3">Classroom Details</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {[
                { label: 'Program', value: (classroom as any).programs?.program_name },
                { label: 'Status', value: classroom.status },
                { label: 'Location', value: classroom.location },
                { label: 'GPS', value: classroom.gps_lat ? `${classroom.gps_lat}, ${classroom.gps_lng}` : 'Not set' },
                { label: 'Geofencing', value: classroom.geofencing_enabled ? `Enabled (${classroom.attendance_radius_metres}m radius)` : 'Disabled' },
              ].map(i => (
                <div key={i.label}>
                  <dt className="text-muted-foreground">{i.label}</dt>
                  <dd className="font-medium">{i.value || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
        </TabsContent>

        {/* COHORTS */}
        <TabsContent value="cohorts">
          <div className="flex items-center justify-end mb-4">
            <Button size="sm" onClick={() => setCohortModal({ open: true })}>
              <Plus className="h-4 w-4 mr-1.5" /> New Cohort
            </Button>
          </div>
          <DataTable
            columns={cohortColumns}
            data={cohorts}
            searchable
            searchPlaceholder="Search cohorts..."
            emptyMessage="No cohorts in this classroom"
            onRowClick={(row) => navigate(`/admin/cohorts/${row.id}`)}
          />
        </TabsContent>

        {/* CURRICULUM */}
        <TabsContent value="curriculum">
          <CurriculumTreeV2 classroomId={id!} />
        </TabsContent>

        {/* STAFF */}
        <TabsContent value="staff">
          <DataTable columns={staffColumns} data={staff} emptyMessage="No staff assigned" />
        </TabsContent>

        {/* STUDENTS */}
        <TabsContent value="students">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-sm text-muted-foreground">
              {(() => {
                const noAccount = students.filter(s => !s.user_id).length;
                const noProfile = students.filter(s => s.user_id && !s.full_name?.trim()).length;
                const total = noAccount + noProfile;
                if (total === 0) return null;
                return <span className="text-warning">{noAccount > 0 && `${noAccount} no account`}{noAccount > 0 && noProfile > 0 && ' · '}{noProfile > 0 && `${noProfile} incomplete profile`}</span>;
              })()}
            </div>
            <Button size="sm" variant="outline" onClick={handleSendReminders} disabled={sendingReminders}>
              {sendingReminders ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Mail className="h-4 w-4 mr-1.5" />}
              {sendingReminders ? 'Sending...' : 'Send Reminders'}
            </Button>
          </div>
          <DataTable columns={studentColumns} data={students} searchable searchPlaceholder="Search students..." emptyMessage="No students enrolled" />
          <Dialog open={switchModal.open} onOpenChange={o => !o && setSwitchModal({ open: false })}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Switch Classroom</DialogTitle></DialogHeader>
              {switchModal.student && (
                <SwitchClassroomDialog
                  student={switchModal.student}
                  fromClassroomId={id!}
                  programId={programId}
                  onClose={() => setSwitchModal({ open: false })}
                  onSwitched={() => supabase.rpc('get_classroom_students', { p_classroom_id: id }).then(({ data }) => setStudents(data || []))}
                />
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* SCHEDULE */}
        <TabsContent value="schedule">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setAutoScheduleOpen(true)}>
                <CalendarDays className="h-4 w-4 mr-1.5" />Auto Schedule
              </Button>
            </div>
            <DataTable
              columns={scheduleColumns}
              data={schedules}
              searchable
              searchPlaceholder="Search schedule..."
              emptyMessage="No sessions scheduled yet — use Auto Schedule to generate one"
            />
          </div>
          <AutoScheduleWizard
            open={autoScheduleOpen}
            onClose={() => setAutoScheduleOpen(false)}
            classroomId={id!}
            classroomName={classroom.name}
            cohorts={cohorts}
            onGenerated={refetchSchedules}
          />
        </TabsContent>

        {/* ASSIGNMENTS */}
        <TabsContent value="assignments">
          <div className="flex justify-end mb-4">
            <Button onClick={() => setAssignmentModal(true)}>
              <Plus className="h-4 w-4 mr-1.5" />Create Assignment
            </Button>
          </div>
          <DataTable
            columns={assignmentColumns}
            data={assignments}
            searchable
            searchPlaceholder="Search assignments..."
            emptyMessage="No assignments created yet"
          />
        </TabsContent>

        {/* ATTENDANCE */}
        <TabsContent value="attendance">
          <AttendanceTab sessions={sessions} cohorts={cohorts} onView={s => setSessionModal({ open: true, session: s })} />
        </TabsContent>
      </Tabs>

      <Dialog open={cohortModal.open} onOpenChange={o => !o && setCohortModal({ open: false })}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{cohortModal.cohort ? 'Edit Cohort' : 'Create Cohort'}</DialogTitle></DialogHeader>
          <CohortModal
            classroomId={id!}
            programId={programId}
            existing={cohortModal.cohort}
            staffList={staffRoster}
            onClose={() => setCohortModal({ open: false })}
            onSaved={() => { refetchCohorts(); loadAll(); }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={cohortStudentsModal.open} onOpenChange={o => !o && setCohortStudentsModal({ open: false })}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Manage Students — {cohortStudentsModal.cohort?.cohort_label}</DialogTitle></DialogHeader>
          {cohortStudentsModal.cohort && (
            <CohortStudentsModal
              cohort={cohortStudentsModal.cohort}
              classroomId={id!}
              onClose={() => {
                setCohortStudentsModal({ open: false });
                refetchCohorts();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Create Assignment modal */}
      <Dialog open={assignmentModal} onOpenChange={o => { if (!o) { setAssignmentModal(false); setAssignmentForm({ title: '', instructions: '', due_date: '', cohort_id: '', status: 'draft' }); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Assignment</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input
                value={assignmentForm.title}
                onChange={e => setAssignmentForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Build a to-do list app"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Instructions</Label>
              <Textarea
                value={assignmentForm.instructions}
                onChange={e => setAssignmentForm(f => ({ ...f, instructions: e.target.value }))}
                placeholder="Describe what students need to do..."
                rows={4}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Due Date</Label>
                <Input
                  type="datetime-local"
                  value={assignmentForm.due_date}
                  onChange={e => setAssignmentForm(f => ({ ...f, due_date: e.target.value }))}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Cohort</Label>
                <Select value={assignmentForm.cohort_id} onValueChange={v => setAssignmentForm(f => ({ ...f, cohort_id: v === '__all__' ? '' : v }))}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="All cohorts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All cohorts</SelectItem>
                    {cohorts.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Publish immediately</p>
                <p className="text-xs text-muted-foreground">Students will see this assignment right away</p>
              </div>
              <Switch
                checked={assignmentForm.status === 'published'}
                onCheckedChange={v => setAssignmentForm(f => ({ ...f, status: v ? 'published' : 'draft' }))}
              />
            </div>
            <Button onClick={handleCreateAssignment} disabled={savingAssignment} className="w-full">
              {savingAssignment ? <Loader2 className="animate-spin h-4 w-4 mr-1.5" /> : null}
              Create Assignment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Permissions modal */}
      <Dialog open={permissionsModal.open} onOpenChange={o => setPermissionsModal({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permissions — {permissionsModal.cs?.staff?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-3">
            {permKeys.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <Label>{label}</Label>
                <Switch checked={!!perms[key]} onCheckedChange={v => setPerms({ ...perms, [key]: v })} />
              </div>
            ))}
            <Button onClick={handleSavePerms} disabled={savingPerms} className="w-full">
              {savingPerms ? 'Saving...' : 'Save Permissions'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lesson edit modal */}
      <Dialog open={lessonEditModal.open} onOpenChange={o => setLessonEditModal({ open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Lesson</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div><Label>Title</Label><Input value={lessonForm.title || ''} onChange={e => setLessonForm({ ...lessonForm, title: e.target.value })} className="mt-1.5" /></div>
            <div><Label>Date</Label><Input type="date" value={lessonForm.lesson_date || ''} onChange={e => setLessonForm({ ...lessonForm, lesson_date: e.target.value })} className="mt-1.5" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start</Label><Input type="time" value={lessonForm.start_time || ''} onChange={e => setLessonForm({ ...lessonForm, start_time: e.target.value })} className="mt-1.5" /></div>
              <div><Label>End</Label><Input type="time" value={lessonForm.end_time || ''} onChange={e => setLessonForm({ ...lessonForm, end_time: e.target.value })} className="mt-1.5" /></div>
            </div>
            <div><Label>Location</Label><Input value={lessonForm.location || ''} onChange={e => setLessonForm({ ...lessonForm, location: e.target.value })} className="mt-1.5" /></div>
            <div><Label>Week Number</Label><Input type="number" value={lessonForm.week_number || ''} onChange={e => setLessonForm({ ...lessonForm, week_number: e.target.value })} className="mt-1.5" /></div>
            <div className="flex gap-2">
              <Button onClick={handleSaveLesson} disabled={savingLesson} className="flex-1">{savingLesson ? 'Saving...' : 'Update Lesson'}</Button>
              <Button variant="destructive" onClick={() => { handleDeleteLesson(lessonEditModal.lesson?.id); setLessonEditModal({ open: false }); }}>Delete</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Attendance drill-down modal */}
      <Dialog open={sessionModal.open} onOpenChange={o => setSessionModal({ open: o })}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Session: <span className="font-mono tracking-widest">{sessionModal.session?.code}</span>
              {(sessionModal.session?.schedules?.lessons?.title || sessionModal.session?.schedules?.title || sessionModal.session?.old_lessons?.title) && (
                <span className="font-normal text-muted-foreground ml-2">— {sessionModal.session.schedules?.lessons?.title || sessionModal.session.schedules?.title || sessionModal.session.old_lessons?.title}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          {sessionModal.session && <AttendanceDrillDown session={sessionModal.session} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
