import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { CompleteProfileBanner } from '@/components/enrollment/CompleteProfileBanner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  GraduationCap,
  HelpCircle,
  LayoutList,
  Mail,
  UserCircle,
} from 'lucide-react';

const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

const withTimeout = async <T,>(request: PromiseLike<T>, fallback: T, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`Student dashboard request timed out: ${label}`);
          resolve(fallback);
        }, 10000);
      }),
    ]);
  } catch (error) {
    console.warn(`Student dashboard request failed: ${label}`, error);
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [submittedAssignmentIds, setSubmittedAssignmentIds] = useState<Set<string>>(new Set());
  const [profileMeta, setProfileMeta] = useState({ total: 0, completed: 0, requiredMissing: 0 });
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const [enrollmentRes, classroomRes, fieldsRes] = await Promise.all([
          withTimeout(
            supabase
              .from('enrollments')
              .select('*, programs(program_name), cohorts(cohort_label, classroom_id)')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false }),
            { data: [] } as any,
            'enrollments'
          ),
          withTimeout(
            supabase
              .from('classroom_students')
              .select('*, classrooms(*, programs(program_name))')
              .eq('student_id', user.id),
            { data: [] } as any,
            'classrooms'
          ),
          withTimeout(
            supabase
              .from('custom_fields')
              .select('*')
              .eq('active', true)
              .eq('visible_to_student', true)
              .order('sort_order'),
            { data: [] } as any,
            'custom fields'
          ),
        ]);

        const enrollmentRows = enrollmentRes.data || [];
        const classroomRows = classroomRes.data || [];
        const fields = fieldsRes.data || [];
        const classroomIds = classroomRows.map((row: any) => row.classroom_id).filter(Boolean);

        const [scheduleRes, assignmentRes, submissionRes, fieldValuesRes, notificationRes] = await Promise.all([
          classroomIds.length
            ? withTimeout(
                supabase
                  .from('schedules')
                  .select('*, lessons(title), cohorts(cohort_label), staff:instructor_id(full_name)')
                  .in('classroom_id', classroomIds)
                  .neq('status', 'cancelled')
                  .gte('scheduled_date', new Date().toISOString().split('T')[0])
                  .order('scheduled_date', { ascending: true })
                  .order('start_time', { ascending: true })
                  .limit(8),
                { data: [] } as any,
                'schedules'
              )
            : Promise.resolve({ data: [] } as any),
          classroomIds.length
            ? withTimeout(
                supabase
                  .from('assignments')
                  .select('*, cohorts(cohort_label), units(title)')
                  .in('classroom_id', classroomIds)
                  .eq('status', 'published')
                  .order('due_date', { ascending: true, nullsFirst: false })
                  .limit(8),
                { data: [] } as any,
                'assignments'
              )
            : Promise.resolve({ data: [] } as any),
          withTimeout(
            supabase
              .from('assignment_submissions')
              .select('assignment_id')
              .eq('student_id', user.id),
            { data: [] } as any,
            'assignment submissions'
          ),
          enrollmentRows.length && fields.length
            ? withTimeout(
                supabase
                  .from('field_values')
                  .select('field_id, value')
                  .eq('enrollment_id', enrollmentRows[0].id),
                { data: [] } as any,
                'field values'
              )
            : Promise.resolve({ data: [] } as any),
          withTimeout(
            supabase
              .from('notifications')
              .select('*')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(5),
            { data: [] } as any,
            'notifications'
          ),
        ]);

        const submitted = new Set((submissionRes.data || []).map((row: any) => row.assignment_id));
        const fieldValues = fieldValuesRes.data || [];
        const filledFieldIds = new Set(fieldValues.filter((row: any) => row.value?.trim?.()).map((row: any) => row.field_id));
        const requiredMissing = fields.filter((field: any) => field.required && !filledFieldIds.has(field.id)).length;

        setEnrollments(enrollmentRows);
        setClassrooms(classroomRows);
        setSchedules(scheduleRes.data || []);
        setAssignments(assignmentRes.data || []);
        setNotifications(notificationRes.data || []);
        setSubmittedAssignmentIds(submitted);
        setProfileMeta({ total: fields.length, completed: filledFieldIds.size, requiredMissing });

        const activeCohort = enrollmentRows.find((row: any) => row.cohort_id)?.cohort_id;
        if (activeCohort) {
          const progressRes = await withTimeout(
            supabase.rpc('get_student_progress', {
              p_student_id: user.id,
              p_cohort_id: activeCohort,
            }),
            { data: null } as any,
            'student progress'
          );
          setProgress(progressRes.data);
        } else {
          setProgress(null);
        }
      } catch (error) {
        console.warn('Student dashboard failed to load', error);
        setProgress(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  const totalAmount = enrollments.reduce((s, e) => s + Number(e.total_amount || 0), 0);
  const totalPaid = enrollments.reduce((s, e) => s + Number(e.amount_paid || 0), 0);
  const totalOwed = enrollments.reduce((s, e) => {
    const balance = e.outstanding_balance != null
      ? Number(e.outstanding_balance)
      : Math.max(Number(e.total_amount || 0) - Number(e.amount_paid || 0), 0);
    return s + balance;
  }, 0);
  const overdue = enrollments.filter(e => e.enrollment_status === 'overdue').length;
  const unreadNotifications = notifications.filter(notification => !notification.read);

  const pendingAssignments = useMemo(() => {
    return assignments.filter((assignment) => !submittedAssignmentIds.has(assignment.id));
  }, [assignments, submittedAssignmentIds]);

  const nextSchedule = schedules[0];
  const primaryClassroom = classrooms[0]?.classrooms;
  const profileComplete = profileMeta.total === 0 || (profileMeta.requiredMissing === 0 && profileMeta.completed >= profileMeta.total);

  const columns = [
    { key: 'program', header: 'Program', render: (r: any) => r.programs?.program_name || '—' },
    {
      key: 'cohort',
      header: 'Cohort',
      render: (r: any) => {
        const label = r.cohorts?.cohort_label;
        const classroomId = r.cohorts?.classroom_id;
        if (!label) return <span className="text-muted-foreground">—</span>;
        if (classroomId) return <Link to={`/student/classrooms/${classroomId}`} className="text-primary hover:underline">{label}</Link>;
        return <span>{label}</span>;
      },
    },
    { key: 'total_amount', header: 'Total', render: (r: any) => formatCurrency(Number(r.total_amount || 0)) },
    { key: 'amount_paid', header: 'Paid', render: (r: any) => formatCurrency(Number(r.amount_paid || 0)) },
    { key: 'outstanding_balance', header: 'Balance', render: (r: any) => formatCurrency(Number(r.outstanding_balance || 0)) },
    { key: 'enrollment_status', header: 'Status', render: (r: any) => <StatusBadge status={r.enrollment_status} /> },
  ];

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <PageHeader title="My Dashboard" description="Your classes, assignments, progress, and payments" />
      <CompleteProfileBanner />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard title="Outstanding" value={formatCurrency(totalOwed)} icon={AlertTriangle} />
        <StatCard title="Total Paid" value={formatCurrency(totalPaid)} icon={CreditCard} />
        <StatCard title="Pending Assignments" value={pendingAssignments.length} icon={BookOpen} />
        <StatCard title="Unread Notices" value={unreadNotifications.length} icon={Bell} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-8">
        <section className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-heading font-semibold">Current Learning</h2>
              <p className="text-sm text-muted-foreground">Your active classroom and cohort</p>
            </div>
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          {primaryClassroom ? (
            <div className="space-y-3">
              <div>
                <p className="font-semibold">{primaryClassroom.name}</p>
                <p className="text-sm text-muted-foreground">{primaryClassroom.programs?.program_name || 'No program'}</p>
              </div>
              {classrooms[0]?.cohort_id && <Badge variant="outline">Cohort assigned</Badge>}
              <Button size="sm" onClick={() => navigate(`/student/classrooms/${primaryClassroom.id}`)}>
                Open Classroom <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No classroom access yet.</p>
          )}
        </section>

        <section className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-heading font-semibold">Next Class</h2>
              <p className="text-sm text-muted-foreground">Upcoming scheduled session</p>
            </div>
            <Calendar className="h-5 w-5 text-primary" />
          </div>
          {nextSchedule ? (
            <div className="space-y-2">
              <p className="font-semibold">{nextSchedule.lessons?.title || nextSchedule.title || 'Scheduled session'}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {new Date(nextSchedule.scheduled_date + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' })}
                {' · '}
                {nextSchedule.start_time} - {nextSchedule.end_time}
              </p>
              {nextSchedule.cohorts?.cohort_label && <Badge variant="outline">{nextSchedule.cohorts.cohort_label}</Badge>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No upcoming classes scheduled.</p>
          )}
        </section>

        <section className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-heading font-semibold">Profile Status</h2>
              <p className="text-sm text-muted-foreground">Enrollment information</p>
            </div>
            {profileComplete ? <CheckCircle2 className="h-5 w-5 text-success" /> : <AlertTriangle className="h-5 w-5 text-warning" />}
          </div>
          <p className="font-semibold">{profileComplete ? 'Complete' : `${profileMeta.requiredMissing} required item${profileMeta.requiredMissing === 1 ? '' : 's'} missing`}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {profileMeta.total ? `${profileMeta.completed}/${profileMeta.total} fields filled` : 'No custom profile fields required'}
          </p>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-8">
        <section className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-heading font-semibold">Assignments</h2>
              <p className="text-sm text-muted-foreground">Pending work and deadlines</p>
            </div>
            <LayoutList className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-3">
            {pendingAssignments.slice(0, 4).map((assignment: any) => {
              const overdueAssignment = assignment.due_date && new Date(assignment.due_date) < new Date();
              return (
                <div key={assignment.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{assignment.title}</p>
                    <p className={`text-xs ${overdueAssignment ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {assignment.due_date ? `Due ${new Date(assignment.due_date).toLocaleString()}` : 'No due date'}
                    </p>
                    {assignment.units?.title && <p className="text-xs text-muted-foreground truncate">Unit: {assignment.units.title}</p>}
                  </div>
                  <Badge variant="outline" className={overdueAssignment ? 'text-destructive border-destructive/30' : ''}>
                    {overdueAssignment ? 'Overdue' : 'Pending'}
                  </Badge>
                </div>
              );
            })}
            {pendingAssignments.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No pending assignments.</p>}
          </div>
          {primaryClassroom && (
            <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate(`/student/classrooms/${primaryClassroom.id}`)}>
              View Assignments
            </Button>
          )}
        </section>

        <section className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-heading font-semibold">Progress</h2>
              <p className="text-sm text-muted-foreground">Attendance and assignment completion</p>
            </div>
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          {progress ? (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span>Attendance</span>
                  <span className="font-medium">{progress.lessons_attended}/{progress.total_lessons} ({progress.attendance_pct}%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(Number(progress.attendance_pct || 0), 100)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span>Assignments</span>
                  <span className="font-medium">{progress.assignments_submitted}/{progress.total_assignments} ({progress.assignment_pct}%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(Number(progress.assignment_pct || 0), 100)}%` }} />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">Progress starts when you join a cohort.</p>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-8">
        <section className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-heading font-semibold">Notifications</h2>
              <p className="text-sm text-muted-foreground">Recent payment and account messages</p>
            </div>
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-3">
            {notifications.slice(0, 3).map((notification: any) => (
              <div key={notification.id} className={`rounded-lg border px-3 py-2.5 ${notification.read ? 'border-border' : 'border-primary/30 bg-primary/5'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{notification.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{notification.message}</p>
                  </div>
                  {!notification.read && <Badge className="shrink-0">New</Badge>}
                </div>
              </div>
            ))}
            {notifications.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No notifications yet.</p>}
          </div>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/student/notifications')}>
            View Notifications <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </section>

        <section className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-heading font-semibold">Support</h2>
              <p className="text-sm text-muted-foreground">Get help with classes, payments, or profile access</p>
            </div>
            <HelpCircle className="h-5 w-5 text-primary" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button asChild variant="outline" className="justify-start">
              <a href="mailto:support@futurelabs.ng?subject=Student%20support%20request">
                <Mail className="mr-2 h-4 w-4" /> Email Support
              </a>
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => navigate('/profile')}>
              <UserCircle className="mr-2 h-4 w-4" /> Update Profile
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => navigate('/student/invoices')}>
              <CreditCard className="mr-2 h-4 w-4" /> Payment Help
            </Button>
            {primaryClassroom && (
              <Button variant="outline" className="justify-start" onClick={() => navigate(`/student/classrooms/${primaryClassroom.id}`)}>
                <BookOpen className="mr-2 h-4 w-4" /> Class Help
              </Button>
            )}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Include your full name, program, and invoice or classroom name when asking for help.
          </p>
        </section>
      </div>

      <h2 className="text-lg font-heading font-semibold mb-4">My Enrollments</h2>
      <DataTable columns={columns} data={enrollments} />

      <div className="sr-only">
        <span>{formatCurrency(totalAmount)}</span>
      </div>
    </div>
  );
}
