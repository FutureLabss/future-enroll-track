import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, GraduationCap, School, Loader2 } from 'lucide-react';

const STATUS_COLOURS: Record<string, string> = {
  upcoming: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  active: 'bg-success/15 text-success border-success/30',
  completed: 'bg-muted text-muted-foreground border-muted',
  archived: 'bg-muted/50 text-muted-foreground/60 border-muted',
};

const ENROLL_COLOURS: Record<string, string> = {
  active: 'bg-success/15 text-success border-success/30',
  pending: 'bg-warning/15 text-warning border-warning/30',
  cancelled: 'bg-destructive/15 text-destructive border-destructive/30',
  completed: 'bg-muted text-muted-foreground border-muted',
};

function derivedStatus(cohort: any): string | null {
  if (cohort.status) return cohort.status;
  const now = new Date();
  if (cohort.start_date && new Date(cohort.start_date) > now) return 'upcoming';
  if (cohort.end_date && new Date(cohort.end_date) < now) return 'completed';
  if (cohort.start_date) return 'active';
  return null;
}

const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

export default function CohortDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [cohort, setCohort] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      const [cRes, mRes] = await Promise.all([
        supabase.from('cohorts').select('*, programs(program_name), classrooms(id, name, location)').eq('id', id).single(),
        supabase.from('cohort_students').select('id, student_id, enrollment_id, enrollments(enrollment_status, total_amount, amount_paid, outstanding_balance)').eq('cohort_id', id),
      ]);
      setCohort(cRes.data);
      const rows = mRes.data || [];

      // Two-step profile lookup: student_id → auth.users, not profiles directly
      const studentIds = [...new Set(rows.map((r: any) => r.student_id).filter(Boolean))];
      const { data: profiles } = studentIds.length
        ? await supabase.from('profiles').select('user_id, full_name, email').in('user_id', studentIds)
        : { data: [] };
      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

      setMembers(rows.map((r: any) => ({ ...r, profile: profileMap.get(r.student_id) || null })));
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  if (!cohort) return <div className="text-center py-20 text-muted-foreground">Cohort not found.</div>;

  const status = derivedStatus(cohort);
  const totalPaid = members.reduce((sum, m) => sum + Number(m.enrollments?.amount_paid || 0), 0);
  const totalOutstanding = members.reduce((sum, m) => sum + Number(m.enrollments?.outstanding_balance || 0), 0);

  const studentColumns = [
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
  ];

  return (
    <div>
      <PageHeader
        title={cohort.cohort_label}
        description={cohort.programs?.program_name || 'No program'}
        actions={
          <Button variant="ghost" onClick={() => navigate('/admin/cohorts')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        {status && (
          <Badge variant="outline" className={`capitalize ${STATUS_COLOURS[status] || ''}`}>{status}</Badge>
        )}
        {cohort.scope_type && (
          <Badge variant="outline" className="capitalize text-primary/80">Scope: {cohort.scope_type}</Badge>
        )}
        {cohort.start_date && (
          <span className="text-sm text-muted-foreground">
            {new Date(cohort.start_date).toLocaleDateString()} – {cohort.end_date ? new Date(cohort.end_date).toLocaleDateString() : 'ongoing'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Students', value: members.length },
          { label: 'Active', value: members.filter(m => m.enrollments?.enrollment_status === 'active').length },
          { label: 'Total Paid', value: formatCurrency(totalPaid) },
          { label: 'Outstanding', value: formatCurrency(totalOutstanding) },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-xl p-4 text-center">
            <div className="text-2xl font-bold font-heading">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="students">
        <TabsList className="mb-6">
          <TabsTrigger value="students">
            <GraduationCap className="h-4 w-4 mr-1.5" />Students ({members.length})
          </TabsTrigger>
          {cohort.classrooms && (
            <TabsTrigger value="classroom">
              <School className="h-4 w-4 mr-1.5" />Classroom
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="students">
          <DataTable
            columns={studentColumns}
            data={members}
            searchable
            searchPlaceholder="Search students..."
            emptyMessage="No students in this cohort"
          />
        </TabsContent>

        {cohort.classrooms && (
          <TabsContent value="classroom">
            <div className="glass-card rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{cohort.classrooms.name}</p>
                  {cohort.classrooms.location && (
                    <p className="text-sm text-muted-foreground mt-0.5">{cohort.classrooms.location}</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/admin/classrooms/${cohort.classrooms.id}`)}
                >
                  <School className="h-3.5 w-3.5 mr-1.5" />View Classroom
                </Button>
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
