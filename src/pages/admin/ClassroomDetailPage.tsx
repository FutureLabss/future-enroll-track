import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useClassroom } from '@/hooks/useClassroom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DataTable } from '@/components/shared/DataTable';
import { CurriculumBuilder } from '@/components/classroom/CurriculumBuilder';
import { toast } from 'sonner';
import { Users, BookOpen, Calendar, ClipboardList, BarChart2, UserPlus, Loader2, GraduationCap, LayoutList } from 'lucide-react';

export default function ClassroomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { classroom, loading } = useClassroom(id!);
  const [staff, setStaff] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [staffRoster, setStaffRoster] = useState<any[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ staff_id: '', staff_type: 'teaching' });
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadAll();
  }, [id]);

  const loadAll = async () => {
    const [staffRes, studentsRes, lessonsRes, sessionsRes, rosterRes] = await Promise.all([
      supabase.from('classroom_staff')
        .select('*, staff(full_name, email, role_title), classroom_permissions(*)')
        .eq('classroom_id', id).eq('status', 'active'),
      supabase.from('classroom_students')
        .select('*, profiles:student_id(full_name, email)')
        .eq('classroom_id', id),
      supabase.from('lessons')
        .select('*, staff:tutor_id(full_name), cohorts(cohort_label)')
        .eq('classroom_id', id).order('lesson_date', { ascending: false }).limit(20),
      supabase.from('attendance_sessions')
        .select('*, lessons(title)')
        .eq('classroom_id', id).order('created_at', { ascending: false }).limit(20),
      supabase.from('staff').select('id, full_name, role_title, email').eq('active', true),
    ]);
    setStaff(staffRes.data || []);
    setStudents(studentsRes.data || []);
    setLessons(lessonsRes.data || []);
    setSessions(sessionsRes.data || []);
    setStaffRoster(rosterRes.data || []);
  };

  const handleInvite = async () => {
    if (!inviteForm.staff_id) { toast.error('Select a staff member'); return; }
    setInviting(true);
    try {
      const { data, error } = await supabase.rpc('assign_staff_to_classroom', {
        p_classroom_id: id,
        p_staff_id: inviteForm.staff_id,
        p_staff_type: inviteForm.staff_type,
      });
      if (error) throw error;
      toast.success('Staff assigned and invitation created');
      setInviteOpen(false);
      loadAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setInviting(false);
    }
  };

  const staffColumns = [
    { key: 'name', header: 'Name', render: (r: any) => r.staff?.full_name || '—' },
    { key: 'role_title', header: 'Role', render: (r: any) => r.staff?.role_title || '—' },
    { key: 'type', header: 'Type', render: (r: any) => (
      <Badge variant={r.staff_type === 'teaching' ? 'default' : 'secondary'}>
        {r.staff_type === 'teaching' ? 'Teaching' : 'Non-Teaching'}
      </Badge>
    )},
    { key: 'perms', header: 'Permissions', render: (r: any) => {
      const p = r.classroom_permissions;
      if (!p) return '—';
      const flags = [];
      if (p.can_create_lessons) flags.push('Lessons');
      if (p.can_schedule) flags.push('Schedule');
      if (p.can_start_attendance) flags.push('Attendance');
      if (p.can_create_assignments) flags.push('Assignments');
      return flags.length ? flags.join(', ') : 'View only';
    }},
  ];

  const studentColumns = [
    { key: 'name', header: 'Student', render: (r: any) => r.profiles?.full_name || '—' },
    { key: 'email', header: 'Email', render: (r: any) => r.profiles?.email || '—' },
    { key: 'joined', header: 'Joined', render: (r: any) => new Date(r.joined_at).toLocaleDateString() },
  ];

  const lessonColumns = [
    { key: 'date', header: 'Date', render: (r: any) => new Date(r.lesson_date).toLocaleDateString() },
    { key: 'title', header: 'Lesson', render: (r: any) => r.title },
    { key: 'tutor', header: 'Tutor', render: (r: any) => r.staff?.full_name || '—' },
    { key: 'cohort', header: 'Cohort', render: (r: any) => r.cohorts?.cohort_label || 'All' },
    { key: 'time', header: 'Time', render: (r: any) => `${r.start_time} – ${r.end_time}` },
    { key: 'status', header: 'Status', render: (r: any) => (
      <Badge variant={r.status === 'completed' ? 'secondary' : r.status === 'cancelled' ? 'destructive' : 'default'}>
        {r.status}
      </Badge>
    )},
  ];

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  }

  if (!classroom) {
    return <div className="text-center py-20 text-muted-foreground">Classroom not found.</div>;
  }

  return (
    <div>
      <PageHeader
        title={classroom.name}
        description={`${(classroom as any).programs?.program_name || 'No program'} · ${classroom.location || 'No location'}`}
        actions={
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button><UserPlus className="h-4 w-4 mr-2" /> Invite to Classroom</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Assign Staff to Classroom</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-3">
                <div>
                  <Label>Staff Member *</Label>
                  <Select value={inviteForm.staff_id} onValueChange={v => setInviteForm({ ...inviteForm, staff_id: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Search staff..." /></SelectTrigger>
                    <SelectContent>
                      {staffRoster.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.full_name} — {s.role_title || s.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Role in Classroom *</Label>
                  <Select value={inviteForm.staff_type} onValueChange={v => setInviteForm({ ...inviteForm, staff_type: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="teaching">Teaching Staff (full classroom access)</SelectItem>
                      <SelectItem value="non_teaching">Non-Teaching Staff (view only)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  An invitation will be emailed to the staff member with classroom access instructions.
                </p>
                <Button onClick={handleInvite} disabled={inviting} className="w-full">
                  {inviting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                  {inviting ? 'Assigning...' : 'Assign & Send Invitation'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList className="mb-6">
          <TabsTrigger value="overview"><BarChart2 className="h-4 w-4 mr-1.5" />Overview</TabsTrigger>
          <TabsTrigger value="curriculum"><LayoutList className="h-4 w-4 mr-1.5" />Curriculum</TabsTrigger>
          <TabsTrigger value="staff"><Users className="h-4 w-4 mr-1.5" />Staff ({staff.length})</TabsTrigger>
          <TabsTrigger value="students"><GraduationCap className="h-4 w-4 mr-1.5" />Students ({students.length})</TabsTrigger>
          <TabsTrigger value="schedule"><Calendar className="h-4 w-4 mr-1.5" />Schedule</TabsTrigger>
          <TabsTrigger value="attendance"><ClipboardList className="h-4 w-4 mr-1.5" />Attendance</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Staff', value: staff.length, icon: Users },
              { label: 'Students', value: students.length, icon: GraduationCap },
              { label: 'Lessons', value: lessons.length, icon: BookOpen },
              { label: 'Cohorts', value: ((classroom as any).cohorts || []).length, icon: BarChart2 },
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

        <TabsContent value="curriculum">
          <CurriculumBuilder classroomId={id!} canEdit={true} />
        </TabsContent>

        <TabsContent value="staff">
          <DataTable columns={staffColumns} data={staff} />
        </TabsContent>

        <TabsContent value="students">
          <DataTable columns={studentColumns} data={students} />
        </TabsContent>

        <TabsContent value="schedule">
          <DataTable columns={lessonColumns} data={lessons} />
        </TabsContent>

        <TabsContent value="attendance">
          <DataTable
            columns={[
              { key: 'code', header: 'Code', render: (r: any) => <span className="font-mono font-bold text-lg tracking-widest">{r.code}</span> },
              { key: 'lesson', header: 'Lesson', render: (r: any) => r.lessons?.title || '—' },
              { key: 'status', header: 'Status', render: (r: any) => <Badge variant={r.status === 'open' ? 'default' : 'secondary'}>{r.status}</Badge> },
              { key: 'expires', header: 'Expires', render: (r: any) => new Date(r.code_expires_at).toLocaleString() },
              { key: 'created', header: 'Generated', render: (r: any) => new Date(r.created_at).toLocaleString() },
            ]}
            data={sessions}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
