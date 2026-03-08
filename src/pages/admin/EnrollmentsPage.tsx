import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';

export default function EnrollmentsPage() {
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const fetch = async () => {
      let query = supabase.from('enrollments').select('*, programs(program_name), cohorts(cohort_label), organizations(organization_name)').order('created_at', { ascending: false });
      if (statusFilter !== 'all') query = query.eq('enrollment_status', statusFilter);
      const { data } = await query;
      setEnrollments(data || []);
      setLoading(false);
    };
    fetch();
  }, [statusFilter]);

  const filtered = enrollments.filter(e =>
    e.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.email?.toLowerCase().includes(search.toLowerCase())
  );

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

  const columns = [
    { key: 'full_name', header: 'Student' },
    { key: 'email', header: 'Email' },
    { key: 'program', header: 'Program', render: (r: any) => r.programs?.program_name || '—' },
    { key: 'cohort', header: 'Cohort', render: (r: any) => r.cohorts?.cohort_label || '—' },
    { key: 'organization', header: 'Sponsor', render: (r: any) => r.organizations?.organization_name || '—' },
    { key: 'total_amount', header: 'Total', render: (r: any) => formatCurrency(Number(r.total_amount)) },
    { key: 'outstanding_balance', header: 'Balance', render: (r: any) => formatCurrency(Number(r.outstanding_balance)) },
    { key: 'enrollment_status', header: 'Status', render: (r: any) => <StatusBadge status={r.enrollment_status} /> },
  ];

  return (
    <div>
      <PageHeader title="Enrollments" description="Manage all student enrollments" />

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
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
        <DataTable columns={columns} data={filtered} emptyMessage="No enrollments found" />
      )}
    </div>
  );
}
