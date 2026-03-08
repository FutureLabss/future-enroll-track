import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

export default function ReportsPage() {
  const [programs, setPrograms] = useState<any[]>([]);
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);

  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    program_id: 'all',
    cohort_id: 'all',
    organization_id: 'all',
    enrollment_status: 'all',
    invoice_status: 'all',
  });

  useEffect(() => {
    Promise.all([
      supabase.from('programs').select('id, program_name'),
      supabase.from('cohorts').select('id, cohort_label'),
      supabase.from('organizations').select('id, organization_name'),
    ]).then(([p, c, o]) => {
      setPrograms(p.data || []);
      setCohorts(c.data || []);
      setOrganizations(o.data || []);
    });
  }, []);

  const handleExport = async () => {
    let query = supabase.from('enrollments').select('*, programs(program_name), cohorts(cohort_label), organizations(organization_name)');

    if (filters.program_id !== 'all') query = query.eq('program_id', filters.program_id);
    if (filters.cohort_id !== 'all') query = query.eq('cohort_id', filters.cohort_id);
    if (filters.organization_id !== 'all') query = query.eq('organization_id', filters.organization_id);
    if (filters.enrollment_status !== 'all') query = query.eq('enrollment_status', filters.enrollment_status);
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59');

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) { toast.error(error.message); return; }
    if (!data || data.length === 0) { toast.error('No data to export'); return; }

    const headers = ['Full Name', 'Email', 'Phone', 'Program', 'Cohort', 'Organization', 'Status', 'Total Amount', 'Amount Paid', 'Outstanding Balance', 'Created At'];
    const rows = data.map(e => [
      e.full_name, e.email, e.phone || '', e.programs?.program_name || '', e.cohorts?.cohort_label || '',
      e.organizations?.organization_name || '', e.enrollment_status, e.total_amount, e.amount_paid,
      e.outstanding_balance, new Date(e.created_at).toLocaleDateString(),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enrollments-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${data.length} records`);
  };

  return (
    <div>
      <PageHeader title="Reports & Export" description="Filter and export enrollment data" />

      <div className="glass-card rounded-2xl p-8 max-w-3xl">
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

        <Button onClick={handleExport} size="lg">
          <Download className="h-4 w-4 mr-2" /> Export to CSV
        </Button>
      </div>
    </div>
  );
}
