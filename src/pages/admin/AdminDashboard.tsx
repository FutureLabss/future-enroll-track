import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StatCard } from '@/components/shared/StatCard';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { FileText, Users, CreditCard, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalInvoiced: 0,
    totalCollected: 0,
    outstanding: 0,
    overdueCount: 0,
    totalEnrollments: 0,
  });
  const [recentEnrollments, setRecentEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [allEnrollRes, recentEnrollRes, invoiceRes, otherIncomeRes] = await Promise.all([
        supabase.from('enrollments').select('total_amount, amount_paid, enrollment_status'),
        supabase.from('enrollments').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('invoices').select('total_amount, status'),
        supabase.from('other_income').select('amount'),
      ]);

      const allEnrollments = allEnrollRes.data || [];
      const invoices = invoiceRes.data || [];
      const otherIncome = otherIncomeRes.data || [];

      const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total_amount), 0);
      const enrollmentCollected = allEnrollments.reduce((s, e) => s + Number(e.amount_paid), 0);
      const otherCollected = otherIncome.reduce((s, o) => s + Number(o.amount), 0);
      const totalCollected = enrollmentCollected + otherCollected;
      const outstanding = allEnrollments.reduce((s, e) => s + (Number(e.total_amount) - Number(e.amount_paid)), 0);
      const overdueCount = allEnrollments.filter(e => e.enrollment_status === 'overdue').length;

      setStats({ totalInvoiced, totalCollected, outstanding, overdueCount, totalEnrollments: allEnrollments.length });
      setRecentEnrollments(recentEnrollRes.data || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

  const columns = [
    { key: 'full_name', header: 'Student' },
    { key: 'email', header: 'Email' },
    { key: 'total_amount', header: 'Total', render: (r: any) => formatCurrency(Number(r.total_amount)) },
    { key: 'amount_paid', header: 'Paid', render: (r: any) => formatCurrency(Number(r.amount_paid)) },
    { key: 'enrollment_status', header: 'Status', render: (r: any) => <StatusBadge status={r.enrollment_status} /> },
  ];

  if (loading) {
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
        <StatCard title="Total Invoiced" value={formatCurrency(stats.totalInvoiced)} icon={FileText} />
        <StatCard title="Total Collected" value={formatCurrency(stats.totalCollected)} icon={CreditCard} />
        <StatCard title="Outstanding" value={formatCurrency(stats.outstanding)} icon={Users} />
        <StatCard title="Overdue" value={stats.overdueCount} icon={AlertTriangle} />
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
