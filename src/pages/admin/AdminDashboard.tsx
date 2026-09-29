import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { StatCard } from '@/components/shared/StatCard';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { FileText, Users, CreditCard, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

const RECENT_COLS = 'id, full_name, email, total_amount, amount_paid, enrollment_status, first_payment_date';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isAdmin, rolesReady } = useAuth();

  const { data, isLoading: loading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const [statsRes, recentEnrollRes] = await Promise.all([
        supabase.rpc('get_dashboard_stats' as any),
        supabase
          .from('enrollments')
          .select(RECENT_COLS)
          .order('first_payment_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(5),
      ]);
      if (statsRes.error) throw new Error(statsRes.error.message);
      return {
        stats: statsRes.data as {
          total_invoiced: number;
          total_collected: number;
          outstanding: number;
          overdue_count: number;
          total_enrollments: number;
        },
        recentEnrollments: recentEnrollRes.data || [],
      };
    },
    // isAdmin starts false and resolves async; rolesReady is the readiness signal
    enabled: rolesReady && isAdmin,
    staleTime: 1000 * 60 * 5,
  });

  const stats = data?.stats;
  const recentEnrollments = data?.recentEnrollments ?? [];

  const columns = useMemo(() => [
    { key: 'full_name', header: 'Student' },
    { key: 'email', header: 'Email' },
    { key: 'total_amount', header: 'Total', render: (r: any) => formatCurrency(Number(r.total_amount)) },
    { key: 'amount_paid', header: 'Paid', render: (r: any) => formatCurrency(Number(r.amount_paid)) },
    { key: 'enrollment_status', header: 'Status', render: (r: any) => <StatusBadge status={r.enrollment_status} /> },
  ], []);

  if (loading || !rolesReady) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of enrollments, invoices and payments"
        actions={
          <Button onClick={() => navigate('/admin/invoices/new')}>
            <FileText className="h-4 w-4 mr-2" />
            New Invoice
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Invoiced" value={formatCurrency(Number(stats?.total_invoiced ?? 0))} icon={FileText} />
        <StatCard title="Total Collected" value={formatCurrency(Number(stats?.total_collected ?? 0))} icon={CreditCard} />
        <StatCard title="Outstanding" value={formatCurrency(Number(stats?.outstanding ?? 0))} icon={Users} />
        <StatCard title="Overdue" value={Number(stats?.overdue_count ?? 0)} icon={AlertTriangle} />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-heading font-semibold">Recent Enrollments</h2>
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/enrollments')}>
          View All
        </Button>
      </div>
      <DataTable columns={columns} data={recentEnrollments} onRowClick={(r) => navigate(`/admin/enrollments/${r.id}`)} />
    </div>
  );
}
