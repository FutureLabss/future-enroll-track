import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useActivityReport, useActivityReportViewers, useCanViewActivityReport } from '@/hooks/useActivityReport';
import { activityByClassroom, countOf, filterActivity, groupActivityByDay, type ActivityEvent, type ClassroomActivity } from '@/lib/activity';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { DataTable } from '@/components/shared/DataTable';
import { CohortSetupGapsAlert } from '@/components/cohort/CohortSetupGapsAlert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Activity, BookOpen, CalendarCheck, CalendarClock, CalendarX, ClipboardCheck, ClipboardList,
  CreditCard, Layers, Search, ShieldCheck, Trash2, UserPlus, Users,
} from 'lucide-react';
import { toast } from 'sonner';

const RANGES = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

const CATEGORIES = [
  { value: 'all', label: 'Everything' },
  { value: 'schedule', label: 'Classes & schedule' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'assignment', label: 'Assignments' },
  { value: 'cohort', label: 'Cohorts' },
  { value: 'staff', label: 'Staff' },
  { value: 'enrollment', label: 'Enrollments' },
  { value: 'finance', label: 'Payments' },
];

const CATEGORY_ICONS: Record<string, typeof Activity> = {
  schedule: CalendarClock,
  attendance: ClipboardList,
  assignment: BookOpen,
  cohort: Layers,
  staff: Users,
  enrollment: UserPlus,
  finance: CreditCard,
};

const EVENT_COLOURS: Record<string, string> = {
  session_cancelled: 'text-destructive bg-destructive/10',
  sessions_removed: 'text-destructive bg-destructive/10',
  session_completed: 'text-success bg-success/10',
  assignment_graded: 'text-success bg-success/10',
  payment_recorded: 'text-success bg-success/10',
  session_rescheduled: 'text-warning bg-warning/10',
};

function eventLink(e: ActivityEvent): string | null {
  if (e.event_type === 'payment_recorded' && e.details?.invoice_id) return `/admin/invoices/${e.details.invoice_id}`;
  if (e.category === 'enrollment' && e.entity_id) return `/admin/enrollments/${e.entity_id}`;
  if (e.category === 'assignment' && e.details?.assignment_id) return `/admin/assignments/${e.details.assignment_id}`;
  if (e.entity_type === 'assignment' && e.entity_id) return `/admin/assignments/${e.entity_id}`;
  if (e.cohort_id && e.category === 'cohort') return `/admin/cohorts/${e.cohort_id}`;
  if (e.classroom_id) return `/admin/classrooms/${e.classroom_id}`;
  return null;
}

function ManageAccessDialog() {
  const [open, setOpen] = useState(false);
  const [candidate, setCandidate] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, loading, grant, revoke } = useActivityReportViewers(open);

  const handleGrant = async () => {
    if (!candidate) return;
    setBusy(true);
    try {
      await grant(candidate);
      toast.success('Access granted. They have been notified.');
      setCandidate('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (viewerId: string) => {
    setBusy(true);
    try {
      await revoke(viewerId);
      toast.success('Access removed');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><ShieldCheck className="mr-2 h-4 w-4" />Manage access</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Who can see this report</DialogTitle>
          <DialogDescription>You always have access. Admins you add see activity for their own hub.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Add an admin</Label>
            <div className="mt-1.5 flex gap-2">
              <Select value={candidate} onValueChange={setCandidate}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={data.candidates.length ? 'Select an admin' : 'No other admins to add'} />
                </SelectTrigger>
                <SelectContent>
                  {data.candidates.map(c => (
                    <SelectItem key={`${c.user_id}-${c.hub_id}`} value={c.user_id}>
                      {c.full_name || c.email} {c.hub_name ? `· ${c.hub_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleGrant} disabled={!candidate || busy}>Add</Button>
            </div>
          </div>
          <div className="space-y-2">
            {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!loading && data.viewers.length === 0 && <p className="text-sm text-muted-foreground">No other admins have access yet.</p>}
            {data.viewers.map(v => (
              <div key={v.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{v.full_name || v.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {v.hub_name} · added {new Date(v.granted_at).toLocaleDateString('en-NG')}{v.granted_by_name ? ` by ${v.granted_by_name}` : ''}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="text-destructive" disabled={busy} onClick={() => handleRevoke(v.id)} aria-label={`Remove ${v.full_name || v.email}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ActivityReportPage() {
  const navigate = useNavigate();
  const { isSuperadmin } = useAuth();
  const { data: canView, loading: checking } = useCanViewActivityReport();
  const [range, setRange] = useState('7');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const { data, loading, error } = useActivityReport(Number(range), category === 'all' ? null : category, canView);

  const visible = useMemo(() => filterActivity(data.events, search), [data.events, search]);
  const days = useMemo(() => groupActivityByDay(visible), [visible]);
  const byClassroom = useMemo(() => activityByClassroom(data.events), [data.events]);
  const showHub = isSuperadmin && new Set(data.events.map(e => e.hub_id)).size > 1;

  const classroomColumns = useMemo(() => [
    { key: 'classroom_name', header: 'Classroom', render: (r: ClassroomActivity) => <span className="font-medium">{r.classroom_name}</span> },
    { key: 'held', header: 'Classes held' },
    { key: 'cancelled', header: 'Cancelled', render: (r: ClassroomActivity) => r.cancelled ? <span className="text-destructive">{r.cancelled}</span> : 0 },
    { key: 'attendance', header: 'Attendance taken' },
    { key: 'submissions', header: 'Submissions' },
    { key: 'total', header: 'All activity' },
    { key: 'last_at', header: 'Last activity', render: (r: ClassroomActivity) => new Date(r.last_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) },
  ], []);

  if (checking) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!canView) {
    return (
      <div>
        <PageHeader title="Activity Report" />
        <p className="text-muted-foreground">You don't have access to the activity report. Ask the superadmin to add you.</p>
      </div>
    );
  }

  const rangeLabel = RANGES.find(r => r.value === range)?.label.toLowerCase();

  return (
    <div>
      <PageHeader
        title="Activity Report"
        description="Everything happening across classrooms, cohorts, enrollments and payments"
        actions={
          <>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{RANGES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
            {isSuperadmin && <ManageAccessDialog />}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Classes held" value={countOf(data.counts, 'session_completed')} icon={CalendarCheck} />
        <StatCard title="Classes cancelled" value={countOf(data.counts, 'session_cancelled')} icon={CalendarX} />
        <StatCard title="Attendance sessions" value={countOf(data.counts, 'attendance_closed')} icon={ClipboardList} />
        <StatCard title="Submissions" value={countOf(data.counts, 'assignment_submitted')} icon={ClipboardCheck} />
        <StatCard title="Assignments published" value={countOf(data.counts, 'assignment_published')} icon={BookOpen} />
        <StatCard title="Schedule changes" value={countOf(data.counts, 'sessions_scheduled', 'session_rescheduled', 'sessions_removed')} icon={CalendarClock} />
        <StatCard title="New enrollments" value={countOf(data.counts, 'enrollment_created')} icon={UserPlus} />
        <StatCard title="Payments recorded" value={countOf(data.counts, 'payment_recorded')} icon={CreditCard} />
      </div>

      <CohortSetupGapsAlert showClassroom />

      {byClassroom.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-heading text-lg font-semibold">By classroom <span className="text-sm font-normal text-muted-foreground">· {rangeLabel}</span></h2>
          <DataTable columns={classroomColumns} data={byClassroom} onRowClick={(r: ClassroomActivity) => navigate(`/admin/classrooms/${r.classroom_id}`)} />
        </section>
      )}

      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-heading text-lg font-semibold">Timeline</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search activity…" className="pl-8 sm:w-56" />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {loading && <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}
        {error && <p className="text-sm text-destructive">Could not load activity: {(error as Error).message}</p>}
        {!loading && !error && days.length === 0 && (
          <p className="rounded-xl border-2 border-dashed border-border py-12 text-center text-muted-foreground">No activity {rangeLabel}.</p>
        )}

        <div className="space-y-6">
          {days.map(({ day, events }) => (
            <div key={day}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {new Date(`${day}T12:00:00`).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                <span className="ml-2 font-normal normal-case">· {events.length} event{events.length === 1 ? '' : 's'}</span>
              </p>
              <ol className="divide-y divide-border rounded-xl border border-border bg-card">
                {events.map(e => {
                  const Icon = CATEGORY_ICONS[e.category] || Activity;
                  const link = eventLink(e);
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        disabled={!link}
                        onClick={() => link && navigate(link)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors enabled:hover:bg-muted/50 disabled:cursor-default"
                      >
                        <span className={`mt-0.5 rounded-lg p-1.5 ${EVENT_COLOURS[e.event_type] || 'text-primary bg-primary/10'}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm">{e.summary}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span>{new Date(e.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</span>
                            <span>· {e.actor_name || 'System'}</span>
                            {e.classroom_name && <span>· {e.classroom_name}</span>}
                            {showHub && e.hub_name && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{e.hub_name}</Badge>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
        {data.events.length >= 2000 && (
          <p className="mt-4 text-center text-xs text-muted-foreground">Showing the latest 2,000 events. Narrow the range or category to see older ones.</p>
        )}
      </section>
    </div>
  );
}
