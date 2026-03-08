import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

  useEffect(() => {
    Promise.all([
      supabase.from('programs').select('id, program_name'),
      supabase.from('cohorts').select('id, cohort_label'),
      supabase.from('organizations').select('id, organization_name'),
      supabase.from('enrollments').select('*, programs(program_name), cohorts(cohort_label), organizations(organization_name)').order('created_at', { ascending: false }),
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
    if (filters.dateFrom && e.created_at < filters.dateFrom) return false;
    if (filters.dateTo && e.created_at > filters.dateTo + 'T23:59:59') return false;
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

  const handleExport = () => {
    if (filtered.length === 0) { toast.error('No data to export'); return; }
    const headers = ['Full Name', 'Email', 'Phone', 'Program', 'Cohort', 'Organization', 'Status', 'Total Amount', 'Amount Paid', 'Outstanding Balance', 'Created At'];
    const rows = filtered.map(e => [
      e.full_name, e.email, e.phone || '', e.programs?.program_name || '', e.cohorts?.cohort_label || '',
      e.organizations?.organization_name || '', e.enrollment_status, e.total_amount, e.amount_paid,
      e.outstanding_balance, new Date(e.created_at).toLocaleDateString(),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `enrollments-report-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} records`);
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
          <Button onClick={handleExport} size="lg">
            <Download className="h-4 w-4 mr-2" /> Export to CSV
          </Button>
          <span className="text-sm text-muted-foreground">{filtered.length} records match filters</span>
        </div>
      </div>
    </div>
  );
}
