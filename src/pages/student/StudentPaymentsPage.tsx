import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { PaymentReceipt } from '@/components/shared/PaymentReceipt';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, CreditCard, FileText, ReceiptText } from 'lucide-react';

export default function StudentPaymentsPage() {
  const { user } = useAuth();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);

  const { data: payments = [], isLoading: loading } = useQuery({
    queryKey: ['student-payments', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, invoices!inner(invoice_number, enrollments!inner(user_id, full_name, programs(program_name)))')
        .eq('invoices.enrollments.user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;
  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const latestPayment = payments[0];
  const methodCounts = payments.reduce((acc: Record<string, number>, payment) => {
    const method = payment.payment_method || 'unknown';
    acc[method] = (acc[method] || 0) + 1;
    return acc;
  }, {});
  const mostUsedMethod = Object.entries(methodCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  const openReceipt = useCallback((r: any) => {
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
  }, []);

  const columns = useMemo(() => [
    { key: 'payment_reference', header: 'Reference' },
    { key: 'invoice', header: 'Invoice', render: (r: any) => r.invoices?.invoice_number || '—' },
    { key: 'amount', header: 'Amount', render: (r: any) => formatCurrency(Number(r.amount)) },
    { key: 'program', header: 'Program', render: (r: any) => r.invoices?.enrollments?.programs?.program_name || '—' },
    { key: 'payment_method', header: 'Method', render: (r: any) => (
      <Badge variant="outline" className="capitalize">{r.payment_method?.replace('_', ' ') || '—'}</Badge>
    ) },
    { key: 'created_at', header: 'Date', render: (r: any) => new Date(r.created_at).toLocaleDateString('en-NG') },
    { key: 'receipt', header: '', render: (r: any) => (
      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openReceipt(r); }}>
        <FileText className="h-4 w-4 mr-1" /> Receipt
      </Button>
    )},
  ], [openReceipt]);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <PageHeader title="Payment History" description="View all your payment records" />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Total Paid</p>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </div>
          <p className="mt-2 text-2xl font-semibold text-success">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-muted-foreground">{payments.length} confirmed payment{payments.length === 1 ? '' : 's'}</p>
        </div>
        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Latest Payment</p>
            <ReceiptText className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-semibold">{latestPayment ? formatCurrency(Number(latestPayment.amount || 0)) : '—'}</p>
          <p className="text-xs text-muted-foreground">{latestPayment ? new Date(latestPayment.created_at).toLocaleDateString('en-NG') : 'No payments yet'}</p>
        </div>
        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Common Method</p>
            <CreditCard className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-semibold capitalize">{mostUsedMethod?.replace('_', ' ') || '—'}</p>
          <p className="text-xs text-muted-foreground">Based on confirmed receipts</p>
        </div>
      </div>

      {latestPayment && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-success/20 bg-success/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Latest receipt: {latestPayment.payment_reference}</p>
            <p className="text-xs text-muted-foreground">
              {latestPayment.invoices?.invoice_number || 'Invoice'} · {formatCurrency(Number(latestPayment.amount || 0))}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => openReceipt(latestPayment)}>
            <FileText className="mr-1.5 h-4 w-4" /> View Receipt
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={payments}
        searchable
        searchPlaceholder="Search payment references..."
        emptyMessage="No payments recorded yet"
      />
      <PaymentReceipt open={receiptOpen} onOpenChange={setReceiptOpen} receipt={selectedReceipt} />
    </div>
  );
}
