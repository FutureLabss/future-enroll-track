import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

export default function OrgEnrollmentsPage() {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('user_id', user.id).single();
      if (!profile?.organization_id) { setLoading(false); return; }
      const { data } = await supabase.from('enrollments')
        .select('*, programs(program_name), cohorts(cohort_label)')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false });
      setEnrollments(data || []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

  const handleExport = () => {
    if (enrollments.length === 0) { toast.error('No data'); return; }
    const headers = ['Full Name', 'Email', 'Program', 'Cohort', 'Status', 'Total', 'Paid', 'Balance'];
    const rows = enrollments.map(e => [
      e.full_name, e.email, e.programs?.program_name || '', e.cohorts?.cohort_label || '',
      e.enrollment_status, e.total_amount, e.amount_paid, e.outstanding_balance,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sponsored-enrollments-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${enrollments.length} records`);
  };

  const columns = [
    { key: 'full_name', header: 'Student' },
    { key: 'email', header: 'Email' },
    { key: 'program', header: 'Program', render: (r: any) => r.programs?.program_name || '—' },
    { key: 'cohort', header: 'Cohort', render: (r: any) => r.cohorts?.cohort_label || '—' },
    { key: 'total_amount', header: 'Total', render: (r: any) => formatCurrency(Number(r.total_amount)) },
    { key: 'enrollment_status', header: 'Status', render: (r: any) => <StatusBadge status={r.enrollment_status} /> },
  ];

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <PageHeader
        title="Sponsored Learners"
        description="View enrollments sponsored by your organization"
        actions={<Button onClick={handleExport}><Download className="h-4 w-4 mr-2" /> Export CSV</Button>}
      />
      <DataTable columns={columns} data={enrollments} />
    </div>
  );
}
