import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';

export default function EnrollmentsPage() {
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [groupByPayment, setGroupByPayment] = useState(false);

  useEffect(() => {
    const fetchEnrollments = async () => {
      let query = supabase.from('enrollments')
        .select('*, programs(program_name), cohorts(cohort_label), organizations(organization_name)')
        .order('created_at', { ascending: false });
      if (statusFilter !== 'all') query = query.eq('enrollment_status', statusFilter);
      const { data } = await query;
      setEnrollments(data || []);
      setLoading(false);
    };
    fetchEnrollments();
  }, [statusFilter]);

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

  const columns = [
    { key: 'full_name', header: 'Student' },
    { key: 'email', header: 'Email' },
    { key: 'program', header: 'Program', render: (r: any) => r.programs?.program_name || '—' },
    { key: 'cohort', header: 'Cohort', render: (r: any) => r.cohorts?.cohort_label || '—' },
    { key: 'organization', header: 'Sponsor', render: (r: any) => r.organizations?.organization_name || '—' },
    { key: 'total_amount', header: 'Total', render: (r: any) => formatCurrency(Number(r.total_amount)) },
    { key: 'verification_status', header: 'Verification', render: (r: any) => {
      const s = r.verification_status;
      if (!s || s === 'pending') return r.payment_evidence_url
        ? <span className="text-warning font-medium text-sm">Needs Review</span>
        : <span className="text-muted-foreground text-sm">—</span>;
      return <StatusBadge status={s === 'approved' ? 'active' : 'cancelled'} />;
    }},
    { key: 'enrollment_status', header: 'Status', render: (r: any) => <StatusBadge status={r.enrollment_status} /> },
    { key: 'actions', header: '', render: (r: any) => (
      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/admin/enrollments/${r.id}`); }}>
        <Eye className="h-4 w-4" />
      </Button>
    )},
  ];

  return (
    <div>
      <PageHeader title="Enrollments" description="Manage all student enrollments" />

      <div className="flex gap-3 mb-6">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : (
        <DataTable
          columns={columns}
          data={enrollments}
          onRowClick={(r) => navigate(`/admin/enrollments/${r.id}`)}
          emptyMessage="No enrollments found"
          searchable
          searchPlaceholder="Search by name or email..."
          exportable
          exportFilename="enrollments"
        />
      )}
    </div>
  );
}
