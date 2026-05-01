import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';

export default function StudentInvoicesPage() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('invoices')
      .select('*, enrollments!inner(full_name, user_id), installments(*)')
      .eq('enrollments.user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setInvoices(data || []); setLoading(false); });
  }, [user]);

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

  const columns = [
    { key: 'invoice_number', header: 'Invoice #' },
    { key: 'total_amount', header: 'Amount', render: (r: any) => formatCurrency(Number(r.total_amount)) },
    { key: 'payment_plan_type', header: 'Plan', render: (r: any) => <span className="capitalize">{r.payment_plan_type}</span> },
    { key: 'installments_count', header: 'Installments', render: (r: any) => r.installments?.length || 0 },
    { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
    { key: 'created_at', header: 'Date', render: (r: any) => new Date(r.created_at).toLocaleDateString() },
  ];

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <PageHeader title="My Invoices" description="View your invoices and installment plans" />
      <DataTable columns={columns} data={invoices} />
    </div>
  );
}
