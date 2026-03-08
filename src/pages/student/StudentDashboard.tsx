import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { CompleteProfileBanner } from '@/components/enrollment/CompleteProfileBanner';
import { FileText, CreditCard, AlertTriangle } from 'lucide-react';

export default function StudentDashboard() {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('enrollments').select('*, programs(program_name), cohorts(cohort_label)')
      .eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => { setEnrollments(data || []); setLoading(false); });
  }, [user]);

  const totalOwed = enrollments.reduce((s, e) => s + Number(e.total_amount), 0);
  const totalPaid = enrollments.reduce((s, e) => s + Number(e.amount_paid), 0);
  const overdue = enrollments.filter(e => e.enrollment_status === 'overdue').length;

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

  const columns = [
    { key: 'program', header: 'Program', render: (r: any) => r.programs?.program_name || '—' },
    { key: 'cohort', header: 'Cohort', render: (r: any) => r.cohorts?.cohort_label || '—' },
    { key: 'total_amount', header: 'Total', render: (r: any) => formatCurrency(Number(r.total_amount)) },
    { key: 'amount_paid', header: 'Paid', render: (r: any) => formatCurrency(Number(r.amount_paid)) },
    { key: 'outstanding_balance', header: 'Balance', render: (r: any) => formatCurrency(Number(r.outstanding_balance)) },
    { key: 'enrollment_status', header: 'Status', render: (r: any) => <StatusBadge status={r.enrollment_status} /> },
  ];

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <PageHeader title="My Dashboard" description="Overview of your enrollments and payments" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard title="Total Owed" value={formatCurrency(totalOwed)} icon={FileText} />
        <StatCard title="Total Paid" value={formatCurrency(totalPaid)} icon={CreditCard} />
        <StatCard title="Overdue" value={overdue} icon={AlertTriangle} />
      </div>
      <h2 className="text-lg font-heading font-semibold mb-4">My Enrollments</h2>
      <DataTable columns={columns} data={enrollments} />
    </div>
  );
}
