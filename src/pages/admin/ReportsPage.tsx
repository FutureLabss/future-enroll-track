import { useEffect, useState } from 'react';
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
  const [programs, setPrograms] = useState<any[]>([]);
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    Promise.all([
      supabase.from('programs').select('id, program_name'),
      supabase.from('cohorts').select('id, cohort_label'),
      supabase.from('organizations').select('id, organization_name'),
      supabase.from('enrollments').select('*, programs(program_name), cohorts(cohort_label), organizations(organization_name)').order('first_payment_date', { ascending: false, nullsFirst: false }),
    ]).then(([p, c, o, e]) => {
      setPrograms(p.data || []);
      setCohorts(c.data || []);
      setOrganizations(o.data || []);
      setEnrollments(e.data || []);
      setLoading(false);
    });
  }, []);

  const filtered = enrollments.filter(e => {
    if (filters.program_id !== 'all' && e.program_id !== filters.program_id) return false;
    if (filters.cohort_id !== 'all' && e.cohort_id !== filters.cohort_id) return false;
    if (filters.organization_id !== 'all' && e.organization_id !== filters.organization_id) return false;
    if (filters.enrollment_status !== 'all' && e.enrollment_status !== filters.enrollment_status) return false;
    if (filters.dateFrom && (!e.first_payment_date || e.first_payment_date < filters.dateFrom)) return false;
    if (filters.dateTo && (!e.first_payment_date || e.first_payment_date > filters.dateTo + 'T23:59:59')) return false;
    return true;
  });

  // Stats
  const totalRevenue = filtered.reduce((s, e) => s + Number(e.total_amount), 0);
  const totalCollected = filtered.reduce((s, e) => s + Number(e.amount_paid), 0);
  const totalOutstanding = totalRevenue - totalCollected;

  // Charts data
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

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

  const openExport = () => {
    setExportForm({ dateFrom: filters.dateFrom, dateTo: filters.dateTo, format: 'csv' });
    setExportOpen(true);
  };

  const handleExport = () => {
    // Start from `filtered` (page filters already applied), then narrow by the
    // export date range. Date is bucketed by created_at — always populated,
    // unlike first_payment_date which is null for manually-added enrollments.
    const exportFiltered = filtered.filter(e => {
      if (exportForm.dateFrom && e.created_at < exportForm.dateFrom) return false;
      if (exportForm.dateTo && e.created_at > exportForm.dateTo + 'T23:59:59') return false;
      return true;
    });

    if (exportFiltered.length === 0) { toast.error('No records match the selected date range'); return; }

    const headers = ['Full Name', 'Email', 'Phone', 'Program', 'Cohort', 'Organization', 'Status', 'Total Amount', 'Amount Paid', 'Outstanding Balance', 'Enrollment Date'];
    const rows = exportFiltered.map(e => [
      e.full_name, e.email, e.phone || '', e.programs?.program_name || '', e.cohorts?.cohort_label || '',
      e.organizations?.organization_name || '', e.enrollment_status, Number(e.total_amount), Number(e.amount_paid),
      Number(e.outstanding_balance), e.first_payment_date ? new Date(e.first_payment_date).toLocaleDateString() : '',
    ]);

    const filename = `enrollments-${exportForm.dateFrom || 'all'}-to-${exportForm.dateTo || 'all'}-${new Date().toISOString().split('T')[0]}`;

    if (exportForm.format === 'xlsx') {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Enrollments');
      XLSX.writeFile(wb, `${filename}.xlsx`);
    } else {
      const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
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
      <PageHeader title="Reports & Analytics" description="Visualize data and export enrollment reports" />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Enrollments" value={filtered.length} icon={Users} />
        <StatCard title="Total Revenue" value={formatCurrency(totalRevenue)} icon={TrendingUp} />
        <StatCard title="Collected" value={formatCurrency(totalCollected)} icon={CreditCard} />
        <StatCard title="Outstanding" value={formatCurrency(totalOutstanding)} icon={FileText} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
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

      {/* Filters & Export */}
      <div className="glass-card rounded-2xl p-8">
        <h3 className="font-heading font-semibold text-lg mb-6">Export Filters</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div><Label>From Date</Label><Input type="date" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })} className="mt-1.5" /></div>
          <div><Label>To Date</Label><Input type="date" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })} className="mt-1.5" /></div>
          <div>
            <Label>Program</Label>
            <Select value={filters.program_id} onValueChange={v => setFilters({ ...filters, program_id: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Programs</SelectItem>
                {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Cohort</Label>
            <Select value={filters.cohort_id} onValueChange={v => setFilters({ ...filters, cohort_id: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cohorts</SelectItem>
                {cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Organization</Label>
            <Select value={filters.organization_id} onValueChange={v => setFilters({ ...filters, organization_id: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Organizations</SelectItem>
                {organizations.map(o => <SelectItem key={o.id} value={o.id}>{o.organization_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Enrollment Status</Label>
            <Select value={filters.enrollment_status} onValueChange={v => setFilters({ ...filters, enrollment_status: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button onClick={openExport} size="lg">
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
          <span className="text-sm text-muted-foreground">{filtered.length} records match filters</span>
        </div>
      </div>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Enrollments</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Enrolled From</Label>
                <Input type="date" className="mt-1.5" value={exportForm.dateFrom} onChange={e => setExportForm(f => ({ ...f, dateFrom: e.target.value }))} />
              </div>
              <div>
                <Label>Enrolled To</Label>
                <Input type="date" className="mt-1.5" value={exportForm.dateTo} onChange={e => setExportForm(f => ({ ...f, dateTo: e.target.value }))} />
              </div>
            </div>
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
            <p className="text-xs text-muted-foreground">Other active filters (program, cohort, status) are applied on top of the date range.</p>
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
