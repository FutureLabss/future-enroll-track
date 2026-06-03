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
  const [programs, setPrograms] = useState<any[]>([]);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [valueMap, setValueMap] = useState<Map<string, Record<string, string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState('all');
  const [groupByPayment, setGroupByPayment] = useState(false);

  useEffect(() => {
    supabase.from('programs').select('id, program_name').eq('active', true).order('program_name')
      .then(({ data }) => setPrograms(data || []));

    supabase.from('custom_fields').select('id, key, label, sort_order').eq('active', true).order('sort_order')
      .then(({ data }) => setCustomFields(data || []));
  }, []);

  useEffect(() => {
    const fetchEnrollments = async () => {
      setLoading(true);
      let query = supabase.from('enrollments')
        .select('*, programs(program_name), cohorts(cohort_label), organizations(organization_name)')
        .order('first_payment_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (statusFilter !== 'all') query = query.eq('enrollment_status', statusFilter);
      if (programFilter !== 'all') query = query.eq('program_id', programFilter);
      const { data } = await query;
      const rows = data || [];
      setEnrollments(rows);

      // Fetch custom field values for all loaded enrollments
      if (rows.length > 0 && customFields.length > 0) {
        const fieldKeyById = new Map<string, string>(customFields.map(f => [f.id, f.key]));
        const ids = rows.map(e => e.id);
        const CHUNK = 100;
        let allFv: any[] = [];
        for (let i = 0; i < ids.length; i += CHUNK) {
          const { data: fv } = await supabase
            .from('field_values')
            .select('enrollment_id, field_id, value')
            .in('enrollment_id', ids.slice(i, i + CHUNK));
          allFv = allFv.concat(fv || []);
        }
        const map = new Map<string, Record<string, string>>();
        for (const fv of allFv) {
          const key = fieldKeyById.get(fv.field_id);
          if (!key) continue;
          if (!map.has(fv.enrollment_id)) map.set(fv.enrollment_id, {});
          map.get(fv.enrollment_id)![key] = fv.value ?? '';
        }
        setValueMap(map);
      }

      setLoading(false);
    };
    fetchEnrollments();
  }, [statusFilter, programFilter, customFields]);

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

  const formatEnrollmentDate = (r: any) => r.first_payment_date
    ? new Date(r.first_payment_date).toLocaleDateString()
    : '—';

  const columns = [
    { key: 'full_name', header: 'Student' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone', render: (r: any) => r.phone || '—' },
    { key: 'enrollment_date', header: 'Enrolled', render: formatEnrollmentDate },
    { key: 'program', header: 'Program', render: (r: any) => r.programs?.program_name || '—' },
    { key: 'cohort', header: 'Cohort', render: (r: any) => r.cohorts?.cohort_label || '—' },
    { key: 'organization', header: 'Sponsor', render: (r: any) => r.organizations?.organization_name || '—' },
    { key: 'total_amount', header: 'Total', render: (r: any) => formatCurrency(Number(r.total_amount)) },
    { key: 'payment_status', header: 'Payment', render: (r: any) => {
      const ps = getPaymentStatus(r);
      return <Badge variant="outline" className={`font-medium ${paymentBadgeStyle[ps] || ''}`}>{ps}</Badge>;
    }},
    { key: 'enrollment_status', header: 'Status', render: (r: any) => <StatusBadge status={r.enrollment_status} /> },
    // Custom profile fields
    ...customFields.map(f => ({
      key: `cf_${f.key}`,
      header: f.label,
      render: (r: any) => {
        const val = valueMap.get(r.id)?.[f.key];
        if (!val) return <span className="text-muted-foreground">—</span>;
        if (f.key === 'profile_photo') {
          return <img src={val} alt="Photo" className="h-8 w-8 rounded-full object-cover border border-border" />;
        }
        return <span>{val}</span>;
      },
    })),
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

        <Select value={programFilter} onValueChange={setProgramFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Programs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Programs</SelectItem>
            {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>)}
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
