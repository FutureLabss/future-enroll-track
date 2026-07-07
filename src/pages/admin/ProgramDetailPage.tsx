import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  GraduationCap,
  Layers,
  School,
  Users,
} from 'lucide-react';

const formatCurrency = (value: number) => `₦${value.toLocaleString('en-NG')}`;

const cohortStatus = (cohort: any) => {
  if (cohort.status) return cohort.status;
  const today = new Date();
  if (cohort.start_date && new Date(cohort.start_date) > today) return 'upcoming';
  if (cohort.end_date && new Date(cohort.end_date) < today) return 'completed';
  if (cohort.start_date) return 'active';
  return 'unscheduled';
};

const statusClass: Record<string, string> = {
  active: 'bg-success/15 text-success border-success/30',
  upcoming: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  completed: 'bg-muted text-muted-foreground border-muted',
  archived: 'bg-muted/50 text-muted-foreground/60 border-muted',
  unscheduled: 'bg-warning/15 text-warning border-warning/30',
};

export default function ProgramDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading: loading } = useQuery({
    queryKey: ['program-detail', id],
    queryFn: async () => {
      const [programRes, classroomRes, cohortRes, enrollmentRes] = await Promise.all([
        supabase.from('programs').select('*').eq('id', id!).single(),
        supabase
          .from('classrooms')
          .select('*, cohorts(id, cohort_label, status), classroom_staff(id, status), classroom_students(id)')
          .eq('program_id', id!)
          .order('created_at', { ascending: false }),
        supabase
          .from('cohorts')
          .select('*, classrooms(id, name), cohort_students(count)')
          .eq('program_id', id!)
          .order('created_at', { ascending: false }),
        supabase
          .from('enrollments')
          .select('id, full_name, email, enrollment_status, total_amount, amount_paid, outstanding_balance, created_at')
          .eq('program_id', id!)
          .order('created_at', { ascending: false }),
      ]);

      const classroomRows = classroomRes.data || [];
      const classroomIds = classroomRows.map((row: any) => row.id);
      const curriculumRes = classroomIds.length
        ? await supabase
            .from('curricula')
            .select('id, title, classroom_id, created_at')
            .in('classroom_id', classroomIds)
            .order('created_at', { ascending: false })
        : { data: [] };

      return {
        program: programRes.data,
        classrooms: classroomRows,
        cohorts: cohortRes.data || [],
        enrollments: enrollmentRes.data || [],
        curricula: curriculumRes.data || [],
      };
    },
    enabled: !!id,
  });

  const program = data?.program ?? null;
  const classrooms = data?.classrooms ?? [];
  const cohorts = data?.cohorts ?? [];
  const enrollments = data?.enrollments ?? [];
  const curricula = data?.curricula ?? [];

  const stats = useMemo(() => {
    const activeCohorts = cohorts.filter(c => cohortStatus(c) === 'active').length;
    const students = enrollments.length;
    const paid = enrollments.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);
    const outstanding = enrollments.reduce((sum, row) => sum + Number(row.outstanding_balance || 0), 0);

    return [
      { label: 'Classrooms', value: classrooms.length, icon: School },
      { label: 'Cohorts', value: cohorts.length, icon: Layers },
      { label: 'Active Cohorts', value: activeCohorts, icon: CalendarDays },
      { label: 'Learners', value: students, icon: Users },
      { label: 'Collected', value: formatCurrency(paid), icon: GraduationCap },
      { label: 'Outstanding', value: formatCurrency(outstanding), icon: BookOpen },
    ];
  }, [classrooms, cohorts, enrollments]);

  const curriculaByClassroom = useMemo(() => {
    return curricula.reduce((map, row) => {
      map.set(row.classroom_id, (map.get(row.classroom_id) || 0) + 1);
      return map;
    }, new Map<string, number>());
  }, [curricula]);

  const classroomColumns = useMemo(() => [
    { key: 'name', header: 'Classroom', render: (row: any) => <span className="font-medium">{row.name}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (row: any) => (
        <Badge variant="outline" className={row.status === 'active' ? statusClass.active : statusClass.archived}>
          {row.status}
        </Badge>
      ),
    },
    { key: 'cohorts', header: 'Cohorts', render: (row: any) => row.cohorts?.length || 0 },
    {
      key: 'students',
      header: 'Students',
      render: (row: any) => row.classroom_students?.length || 0,
    },
    {
      key: 'curricula',
      header: 'Curricula',
      render: (row: any) => curriculaByClassroom.get(row.id) || 0,
    },
    {
      key: 'staff',
      header: 'Staff',
      render: (row: any) => (row.classroom_staff || []).filter((staff: any) => staff.status === 'active').length,
    },
  ], []);

  const cohortColumns = useMemo(() => [
    { key: 'cohort_label', header: 'Cohort', render: (row: any) => <span className="font-medium">{row.cohort_label}</span> },
    { key: 'classroom', header: 'Classroom', render: (row: any) => row.classrooms?.name || 'Unassigned' },
    {
      key: 'status',
      header: 'Status',
      render: (row: any) => {
        const status = cohortStatus(row);
        return <Badge variant="outline" className={statusClass[status] || ''}>{status}</Badge>;
      },
    },
    { key: 'students', header: 'Students', render: (row: any) => row.cohort_students?.[0]?.count ?? 0 },
    { key: 'start_date', header: 'Start', render: (row: any) => row.start_date ? new Date(row.start_date).toLocaleDateString() : '—' },
    { key: 'end_date', header: 'End', render: (row: any) => row.end_date ? new Date(row.end_date).toLocaleDateString() : '—' },
  ], []);

  const enrollmentColumns = useMemo(() => [
    { key: 'full_name', header: 'Student', render: (row: any) => <span className="font-medium">{row.full_name}</span> },
    { key: 'email', header: 'Email' },
    {
      key: 'enrollment_status',
      header: 'Status',
      render: (row: any) => <Badge variant="outline" className="capitalize">{row.enrollment_status}</Badge>,
    },
    { key: 'amount_paid', header: 'Paid', render: (row: any) => formatCurrency(Number(row.amount_paid || 0)) },
    { key: 'outstanding_balance', header: 'Outstanding', render: (row: any) => formatCurrency(Number(row.outstanding_balance || 0)) },
  ], []);

  // Early returns must stay below every hook — returning during loading with
  // the columns memoized above changes the hook count between renders
  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!program) {
    return <div className="text-center py-20 text-muted-foreground">Program not found.</div>;
  }

  return (
    <div>
      <PageHeader
        title={program.program_name}
        description={program.description || 'Program workspace'}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate('/admin/programs')}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Programs
            </Button>
            <Button onClick={() => navigate('/admin/classrooms')}>
              <School className="h-4 w-4 mr-2" /> Manage Classrooms
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6 mb-8">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="glass-card rounded-xl p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <p className="text-xl font-heading font-bold mt-2">{value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="classrooms">
        <TabsList className="mb-6">
          <TabsTrigger value="classrooms">Classrooms ({classrooms.length})</TabsTrigger>
          <TabsTrigger value="cohorts">Cohorts ({cohorts.length})</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments ({enrollments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="classrooms">
          <DataTable
            columns={classroomColumns}
            data={classrooms}
            searchable
            searchPlaceholder="Search classrooms..."
            emptyMessage="No classrooms have been created for this program."
            onRowClick={(row) => navigate(`/admin/classrooms/${row.id}`)}
          />
        </TabsContent>

        <TabsContent value="cohorts">
          <DataTable
            columns={cohortColumns}
            data={cohorts}
            searchable
            searchPlaceholder="Search cohorts..."
            emptyMessage="No cohorts have been created for this program."
            onRowClick={(row) => navigate(`/admin/cohorts/${row.id}`)}
          />
        </TabsContent>

        <TabsContent value="enrollments">
          <DataTable
            columns={enrollmentColumns}
            data={enrollments}
            searchable
            searchPlaceholder="Search learners..."
            emptyMessage="No enrollments have been recorded for this program."
            onRowClick={(row) => navigate(`/admin/enrollments/${row.id}`)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
