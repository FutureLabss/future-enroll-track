import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Download, Users, FileText, CreditCard, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const CHART_COLORS = [
  'hsl(250, 84%, 54%)',
  'hsl(165, 82%, 40%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)',
  'hsl(280, 65%, 60%)',
];

export default function ReportsPage() {
  const { data, isLoading: loading } = useQuery({
    queryKey: ['reports'],
    queryFn: async () => {
      const [p, c, o, e, cf] = await Promise.all([
        supabase.from('programs').select('id, program_name'),
        supabase.from('cohorts').select('id, cohort_label'),
        supabase.from('organizations').select('id, organization_name'),
        supabase.from('enrollments').select('*, programs(program_name), cohorts(cohort_label), organizations(organization_name)').order('first_payment_date', { ascending: false, nullsFirst: false }),
        supabase.from('custom_fields').select('id, key, label, sort_order').eq('active', true).order('sort_order'),
      ]);

      const enrollmentRows = e.data || [];
      const fields = cf.data || [];

      let valueMap = new Map<string, Record<string, string>>();
      if (enrollmentRows.length > 0 && fields.length > 0) {
        const fieldKeyById = new Map<string, string>(fields.map((f: any) => [f.id, f.key]));
        const ids = enrollmentRows.map((r: any) => r.id);
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

      return {
        programs: p.data || [],
        cohorts: c.data || [],
        organizations: o.data || [],
        enrollments: enrollmentRows,
        customFields: fields,
        valueMap,
      };
    },
    staleTime: 1000 * 60 * 5,
  });

  const programs = data?.programs ?? [];
  const cohorts = data?.cohorts ?? [];
  const organizations = data?.organizations ?? [];
  const enrollments = data?.enrollments ?? [];
  const customFields = data?.customFields ?? [];
  const valueMap = data?.valueMap ?? new Map<string, Record<string, string>>();

  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    program_id: 'all',
    cohort_id: 'all',
    organization_id: 'all',
    enrollment_status: 'all',
  });

  const [exportOpen, setExportOpen] = useState(false);
  const [exportForm, setExportForm] = useState({ dateFrom: '', dateTo: '', format: 'csv' });


  const filtered = useMemo(() => enrollments.filter(e => {
    if (filters.program_id !== 'all' && e.program_id !== filters.program_id) return false;
    if (filters.cohort_id !== 'all' && e.cohort_id !== filters.cohort_id) return false;
    if (filters.organization_id !== 'all' && e.organization_id !== filters.organization_id) return false;
    if (filters.enrollment_status !== 'all' && e.enrollment_status !== filters.enrollment_status) return false;
    if (filters.dateFrom && (!e.first_payment_date || e.first_payment_date < filters.dateFrom)) return false;
    if (filters.dateTo && (!e.first_payment_date || e.first_payment_date > filters.dateTo + 'T23:59:59')) return false;
    return true;
  }), [enrollments, filters]);

  const { totalRevenue, totalCollected, totalOutstanding, pieData, barData } = useMemo(() => {
    const totalRevenue = filtered.reduce((s, e) => s + Number(e.total_amount), 0);
    const totalCollected = filtered.reduce((s, e) => s + Number(e.amount_paid), 0);

    const statusCounts = filtered.reduce((acc: Record<string, number>, e) => {
      acc[e.enrollment_status] = (acc[e.enrollment_status] || 0) + 1;
      return acc;
    }, {});
    const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

    const programRevenue = filtered.reduce((acc: Record<string, number>, e) => {
      const name = e.programs?.program_name || 'Unknown';
      acc[name] = (acc[name] || 0) + Number(e.total_amount);
      return acc;
    }, {});
    const barData = Object.entries(programRevenue).map(([name, total]) => ({ name: name.length > 20 ? name.slice(0, 20) + '…' : name, total }));

    return { totalRevenue, totalCollected, totalOutstanding: totalRevenue - totalCollected, pieData, barData };
  }, [filtered]);

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

  const openExport = () => {
    setExportForm({ dateFrom: '', dateTo: '', format: 'csv' });
    setExportOpen(true);
  };

  const handleExport = () => {
    const exportFiltered = filtered;
    if (exportFiltered.length === 0) { toast.error('No records to export'); return; }

    // customFields and valueMap are loaded at page load — same pattern as EnrollmentsPage table
    const headers = [
      'Full Name', 'Email', 'Primary Phone Number', 'Program', 'Cohort',
      'Organization', 'Status', 'Total Amount (₦)', 'Amount Paid (₦)',
      'Outstanding (₦)', 'Enrolled Date',
      ...customFields.filter(f => f.key !== 'profile_photo').map((f: any) => f.label),
    ];

    const rows = exportFiltered.map(e => {
      const cv = valueMap.get(e.id) || {};
      return [
        e.full_name,
        e.email,
        e.phone || '',
        e.programs?.program_name || '',
        e.cohorts?.cohort_label || '',
        e.organizations?.organization_name || '',
        e.enrollment_status,
        Number(e.total_amount),
        Number(e.amount_paid),
        Number(e.outstanding_balance),
        e.created_at ? new Date(e.created_at).toLocaleDateString() : '',
        ...customFields.filter(f => f.key !== 'profile_photo').map((f: any) => cv[f.key] ?? ''),
      ];
    });

    const filename = `enrollments-${filters.dateFrom || 'all'}-to-${filters.dateTo || 'all'}-${new Date().toISOString().split('T')[0]}`;

    if (exportForm.format === 'xlsx') {
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
    toast.success(`Exported ${exportFiltered.length} records as ${exportForm.format.toUpperCase()}`);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        description="Visualize data and export enrollment reports"
        actions={
          <Button onClick={openExport}>
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6 items-end">
        <div>
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" className="mt-1 w-36" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" className="mt-1 w-36" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })} />
        </div>
        <Select value={filters.program_id} onValueChange={v => setFilters({ ...filters, program_id: v })}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Programs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Programs</SelectItem>
            {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.cohort_id} onValueChange={v => setFilters({ ...filters, cohort_id: v })}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Cohorts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cohorts</SelectItem>
            {cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.organization_id} onValueChange={v => setFilters({ ...filters, organization_id: v })}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Organizations" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Organizations</SelectItem>
            {organizations.map(o => <SelectItem key={o.id} value={o.id}>{o.organization_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.enrollment_status} onValueChange={v => setFilters({ ...filters, enrollment_status: v })}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground self-center">{filtered.length} records</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Enrollments" value={filtered.length} icon={Users} />
        <StatCard title="Total Revenue" value={formatCurrency(totalRevenue)} icon={TrendingUp} />
        <StatCard title="Collected" value={formatCurrency(totalCollected)} icon={CreditCard} />
        <StatCard title="Outstanding" value={formatCurrency(totalOutstanding)} icon={FileText} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card rounded-xl p-6">
          <h3 className="font-heading font-semibold mb-4">Enrollment Status</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                  {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-muted-foreground text-center py-12">No data</p>}
        </div>
        <div className="glass-card rounded-xl p-6">
          <h3 className="font-heading font-semibold mb-4">Revenue by Program</h3>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="total" fill="hsl(250, 84%, 54%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-muted-foreground text-center py-12">No data</p>}
        </div>
      </div>

      {/* Export dialog — format only, page filters already applied */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export {filtered.length} Records</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Format</Label>
              <Select value={exportForm.format} onValueChange={v => setExportForm(f => ({ ...f, format: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV (.csv)</SelectItem>
                  <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">All active page filters (date range, program, cohort, status) are applied to the export.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>Cancel</Button>
            <Button onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" /> Download {exportForm.format.toUpperCase()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
