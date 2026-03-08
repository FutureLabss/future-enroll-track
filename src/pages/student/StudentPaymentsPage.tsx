import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { PaymentReceipt } from '@/components/shared/PaymentReceipt';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

export default function StudentPaymentsPage() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('payments')
      .select('*, invoices!inner(invoice_number, enrollments!inner(user_id, full_name, programs(program_name)))')
      .eq('invoices.enrollments.user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setPayments(data || []); setLoading(false); });
  }, [user]);

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

  const openReceipt = (r: any) => {
    setSelectedReceipt({
      payment_reference: r.payment_reference,
      amount: Number(r.amount),
      payment_method: r.payment_method,
      created_at: r.created_at,
      invoice_number: r.invoices?.invoice_number || '—',
      student_name: r.invoices?.enrollments?.full_name || '—',
      program_name: r.invoices?.enrollments?.programs?.program_name || '',
    });
    setReceiptOpen(true);
  };

  const columns = [
    { key: 'payment_reference', header: 'Reference' },
    { key: 'invoice', header: 'Invoice', render: (r: any) => r.invoices?.invoice_number || '—' },
    { key: 'amount', header: 'Amount', render: (r: any) => formatCurrency(Number(r.amount)) },
    { key: 'payment_method', header: 'Method', render: (r: any) => r.payment_method || '—' },
    { key: 'created_at', header: 'Date', render: (r: any) => new Date(r.created_at).toLocaleDateString() },
    { key: 'receipt', header: '', render: (r: any) => (
      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openReceipt(r); }}>
        <FileText className="h-4 w-4 mr-1" /> Receipt
      </Button>
    )},
  ];

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <PageHeader title="Payment History" description="View all your payment records" />
      <DataTable columns={columns} data={payments} />
      <PaymentReceipt open={receiptOpen} onOpenChange={setReceiptOpen} receipt={selectedReceipt} />
    </div>
  );
}
