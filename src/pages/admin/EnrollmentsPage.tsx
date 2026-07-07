import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, subMonths, startOfMonth } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { CalendarIcon, ChevronLeft, ChevronRight, Download, Eye, LayoutGrid, List } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

export default function EnrollmentsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState('all');
  const [groupByPayment, setGroupByPayment] = useState(false);
  const [dateMode, setDateMode] = useState('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');

  const { data: staticData } = useQuery({
    queryKey: ['enrollments-static'],
    queryFn: async () => {
      const [programsRes, fieldsRes] = await Promise.all([
        supabase.from('programs').select('id, program_name').eq('active', true).order('program_name'),
        supabase.from('custom_fields').select('id, key, label, sort_order').eq('active', true).order('sort_order'),
      ]);
      return { programs: (programsRes.data || []) as any[], customFields: (fieldsRes.data || []) as any[] };
    },
    staleTime: 5 * 60_000,
  });
  const programs = staticData?.programs ?? [];
  const customFields = staticData?.customFields ?? [];

  // Compute server-side date bounds so date filtering hits the DB, not the client
  const { dbDateFrom, dbDateTo } = useMemo(() => {
    if (dateMode === 'custom') {
      return {
        dbDateFrom: dateFrom ? dateFrom.toISOString() : null,
        dbDateTo: dateTo ? new Date(dateTo.getTime() + 86400000).toISOString() : null,
      };
    }
    if (dateMode !== 'all') {
      return {
        dbDateFrom: startOfMonth(subMonths(new Date(), Number(dateMode) - 1)).toISOString(),
        dbDateTo: null,
      };
    }
    return { dbDateFrom: null, dbDateTo: null };
  }, [dateMode, dateFrom, dateTo]);

  // Map UI labels to DB generated column values
  const dbPaymentFilter = paymentFilter === 'Fully Paid' ? 'paid'
    : paymentFilter === 'Partially Paid' ? 'partial'
    : paymentFilter === 'Unpaid' ? 'unpaid'
    : null;

  const { data: enrollmentsData, isLoading: loading } = useQuery({
    queryKey: ['enrollments-list', statusFilter, programFilter, dbDateFrom, dbDateTo, dbPaymentFilter, page],
    queryFn: async () => {
      let query = supabase.from('enrollments')
        .select('*, programs(program_name), cohorts(cohort_label), organizations(organization_name)', { count: 'exact' })
        .order('first_payment_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (statusFilter !== 'all') query = query.eq('enrollment_status', statusFilter);
      if (programFilter !== 'all') query = query.eq('program_id', programFilter);
      if (dbPaymentFilter) query = query.eq('payment_status', dbPaymentFilter);
      if (dbDateFrom) query = query.gte('created_at', dbDateFrom);
      if (dbDateTo) query = query.lte('created_at', dbDateTo);

      const { data, count } = await query;
      const rows = data || [];

      let valueMap = new Map<string, Record<string, string>>();
      if (rows.length > 0 && customFields.length > 0) {
        const fieldKeyById = new Map<string, string>(customFields.map((f: any) => [f.id, f.key]));
        const ids = rows.map((e: any) => e.id);
        const CHUNK = 100;
        let allFv: any[] = [];
        for (let i = 0; i < ids.length; i += CHUNK) {
          const { data: fv } = await supabase
            .from('field_values')
            .select('enrollment_id, field_id, value')
            .in('enrollment_id', ids.slice(i, i + CHUNK));
          allFv = allFv.concat(fv || []);
        }
        for (const fv of allFv) {
          const key = fieldKeyById.get(fv.field_id);
          if (!key) continue;
          if (!valueMap.has(fv.enrollment_id)) valueMap.set(fv.enrollment_id, {});
          valueMap.get(fv.enrollment_id)![key] = fv.value ?? '';
        }
      }
      return { rows, valueMap, total: count ?? 0 };
    },
    staleTime: 30_000,
  });
  const enrollments = enrollmentsData?.rows ?? [];
  const valueMap = enrollmentsData?.valueMap ?? new Map();
  const total = enrollmentsData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

  const getPaymentStatus = (r: any) => {
    const paid = Number(r.amount_paid);
    const tot = Number(r.total_amount);
    if (tot <= 0) return 'N/A';
    if (paid >= tot) return 'Fully Paid';
    if (paid > 0) return 'Partially Paid';
    return 'Unpaid';
  };

  const filteredEnrollments = enrollments;

  const groupedEnrollments = useMemo(() => {
    if (!groupByPayment) return null;
    const groups: Record<string, any[]> = {};
    enrollments.forEach(e => {
      const status = getPaymentStatus(e);
      if (!groups[status]) groups[status] = [];
      groups[status].push(e);
    });
    return groups;
  }, [enrollments, groupByPayment]);

  const paymentBadgeStyle: Record<string, string> = {
    'Fully Paid': 'bg-success/15 text-success border-success/30',
    'Partially Paid': 'bg-warning/15 text-warning border-warning/30',
    'Unpaid': 'bg-destructive/15 text-destructive border-destructive/30',
    'N/A': 'bg-muted text-muted-foreground border-muted',
  };

  const formatEnrollmentDate = (r: any) => r.first_payment_date
    ? new Date(r.first_payment_date).toLocaleDateString('en-NG')
    : '—';

  const handleExport = async () => {
    const exportRows = groupByPayment && groupedEnrollments
      ? Object.values(groupedEnrollments).flat()
      : filteredEnrollments;
    if (exportRows.length === 0) { toast.error('No records to export'); return; }

    const exportCustomFields = customFields.filter(f => f.key !== 'profile_photo');
    const headers = [
      'Full Name', 'Email', 'Primary Phone Number', 'Program', 'Cohort',
      'Organization', 'Enrollment Status', 'Payment Status',
      'Total Amount (₦)', 'Amount Paid (₦)', 'Outstanding (₦)', 'Enrolled Date',
      ...exportCustomFields.map((f: any) => f.label),
    ];
    const rows = exportRows.map(e => {
      const cv = valueMap.get(e.id) || {};
      return [
        e.full_name, e.email, e.phone || '',
        e.programs?.program_name || '', e.cohorts?.cohort_label || '',
        e.organizations?.organization_name || '',
        e.enrollment_status, getPaymentStatus(e),
        Number(e.total_amount), Number(e.amount_paid), Number(e.outstanding_balance),
        e.created_at ? new Date(e.created_at).toLocaleDateString('en-NG') : '',
        ...exportCustomFields.map((f: any) => (cv[f.key] ?? '')),
      ];
    });

    const filename = `enrollments-${new Date().toISOString().split('T')[0]}`;
    if (exportFormat === 'xlsx') {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Enrollments');
      XLSX.writeFile(wb, `${filename}.xlsx`);
    } else {
      const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${filename}.csv`; a.click();
      URL.revokeObjectURL(url);
    }
    setExportOpen(false);
    toast.success(`Exported ${exportRows.length} records as ${exportFormat.toUpperCase()}`);
  };

  const resetPage = () => setPage(0);

  const columns = useMemo(() => [
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
  ], [navigate, valueMap]);

  const renderTable = (data: any[]) => (
    <DataTable
      columns={columns}
      data={data}
      onRowClick={(r) => navigate(`/admin/enrollments/${r.id}`)}
      emptyMessage="No enrollments found"
      searchable
      searchPlaceholder="Search by name or email..."
    />
  );

  return (
    <div>
      <PageHeader
        title="Enrollments"
        description={`${total.toLocaleString()} total`}
        actions={
          <Button onClick={() => setExportOpen(true)}>
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
        }
      />

      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <Label className="text-xs text-muted-foreground">Period</Label>
          <Select value={dateMode} onValueChange={v => { setDateMode(v); resetPage(); if (v !== 'custom') { setDateFrom(undefined); setDateTo(undefined); } }}>
            <SelectTrigger className="w-40 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="1">This month</SelectItem>
              <SelectItem value="3">Last 3 months</SelectItem>
              <SelectItem value="6">Last 6 months</SelectItem>
              <SelectItem value="12">Last 12 months</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {dateMode === 'custom' && (
          <>
            <div>
              <Label className="text-xs text-muted-foreground">From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-36 mt-1 justify-start text-left font-normal', !dateFrom && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, 'dd MMM yyyy') : 'Start date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={d => { setDateFrom(d); resetPage(); }} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">To</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-36 mt-1 justify-start text-left font-normal', !dateTo && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, 'dd MMM yyyy') : 'End date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={d => { setDateTo(d); resetPage(); }} disabled={d => (dateFrom ? d < dateFrom : false)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </>
        )}

        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); resetPage(); }}>
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

        <Select value={programFilter} onValueChange={v => { setProgramFilter(v); resetPage(); }}>
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
        <>
          {renderTable(filteredEnrollments)}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} · {total.toLocaleString()} records
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export {filteredEnrollments.length} Records (this page)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Format</Label>
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV (.csv)</SelectItem>
                  <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">All active filters (period, status, program, payment) are applied to the export.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>Cancel</Button>
            <Button onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" /> Download {exportFormat.toUpperCase()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
