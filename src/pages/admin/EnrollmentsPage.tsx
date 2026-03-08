import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Eye, LayoutGrid, List } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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

  const getPaymentStatus = (r: any) => {
    const paid = Number(r.amount_paid);
    const total = Number(r.total_amount);
    if (total <= 0) return 'N/A';
    if (paid >= total) return 'Fully Paid';
    if (paid > 0) return 'Partially Paid';
    return 'Unpaid';
  };

  const filteredEnrollments = useMemo(() => {
    if (paymentFilter === 'all') return enrollments;
    return enrollments.filter(e => getPaymentStatus(e) === paymentFilter);
  }, [enrollments, paymentFilter]);

  const groupedEnrollments = useMemo(() => {
    if (!groupByPayment) return null;
    const groups: Record<string, any[]> = {};
    filteredEnrollments.forEach(e => {
      const status = getPaymentStatus(e);
      if (!groups[status]) groups[status] = [];
      groups[status].push(e);
    });
    return groups;
  }, [filteredEnrollments, groupByPayment]);

  const paymentBadgeStyle: Record<string, string> = {
    'Fully Paid': 'bg-success/15 text-success border-success/30',
    'Partially Paid': 'bg-warning/15 text-warning border-warning/30',
    'Unpaid': 'bg-destructive/15 text-destructive border-destructive/30',
    'N/A': 'bg-muted text-muted-foreground border-muted',
  };

  const columns = [
    { key: 'full_name', header: 'Student' },
    { key: 'email', header: 'Email' },
    { key: 'program', header: 'Program', render: (r: any) => r.programs?.program_name || '—' },
    { key: 'cohort', header: 'Cohort', render: (r: any) => r.cohorts?.cohort_label || '—' },
    { key: 'organization', header: 'Sponsor', render: (r: any) => r.organizations?.organization_name || '—' },
    { key: 'total_amount', header: 'Total', render: (r: any) => formatCurrency(Number(r.total_amount)) },
    { key: 'payment_status', header: 'Payment', render: (r: any) => {
      const ps = getPaymentStatus(r);
      return <Badge variant="outline" className={`font-medium ${paymentBadgeStyle[ps] || ''}`}>{ps}</Badge>;
    }},
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

  const renderTable = (data: any[]) => (
    <DataTable
      columns={columns}
      data={data}
      onRowClick={(r) => navigate(`/admin/enrollments/${r.id}`)}
      emptyMessage="No enrollments found"
      searchable
      searchPlaceholder="Search by name or email..."
      exportable
      exportFilename="enrollments"
    />
  );

  return (
    <div>
      <PageHeader title="Enrollments" description="Manage all student enrollments" />

      <div className="flex flex-wrap gap-3 mb-6 items-end">
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

        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Payment Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="Fully Paid">Fully Paid</SelectItem>
            <SelectItem value="Partially Paid">Partially Paid</SelectItem>
            <SelectItem value="Unpaid">Unpaid</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={groupByPayment ? 'default' : 'outline'}
          size="sm"
          onClick={() => setGroupByPayment(!groupByPayment)}
          className="h-10"
        >
          {groupByPayment ? <List className="h-4 w-4 mr-2" /> : <LayoutGrid className="h-4 w-4 mr-2" />}
          {groupByPayment ? 'Flat View' : 'Group by Payment'}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : groupByPayment && groupedEnrollments ? (
        <div className="space-y-8">
          {['Fully Paid', 'Partially Paid', 'Unpaid', 'N/A'].map(status => {
            const items = groupedEnrollments[status];
            if (!items || items.length === 0) return null;
            return (
              <div key={status}>
                <div className="flex items-center gap-3 mb-3">
                  <Badge variant="outline" className={`text-sm px-3 py-1 ${paymentBadgeStyle[status]}`}>{status}</Badge>
                  <span className="text-sm text-muted-foreground">{items.length} student{items.length !== 1 ? 's' : ''}</span>
                </div>
                {renderTable(items)}
              </div>
            );
          })}
        </div>
      ) : (
        renderTable(filteredEnrollments)
      )}
    </div>
  );
}
