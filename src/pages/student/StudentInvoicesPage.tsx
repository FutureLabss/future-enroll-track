import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, CreditCard, FileText } from 'lucide-react';

export default function StudentInvoicesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('invoices')
      .select('*, enrollments!inner(full_name, user_id, programs(program_name)), installments(*), payments(amount)')
      .eq('enrollments.user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setInvoices(data || []); setLoading(false); });
  }, [user]);

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;
  const getPaid = (invoice: any) => {
    const installmentPaid = (invoice.installments || [])
      .filter((installment: any) => installment.status === 'paid')
      .reduce((sum: number, installment: any) => sum + Number(installment.amount || 0), 0);
    const paymentPaid = (invoice.payments || []).reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0);
    return Math.max(installmentPaid, paymentPaid);
  };
  const getOutstanding = (invoice: any) => Math.max(Number(invoice.total_amount || 0) - getPaid(invoice), 0);
  const getNextInstallment = (invoice: any) => [...(invoice.installments || [])]
    .filter((installment: any) => installment.status !== 'paid')
    .sort((a: any, b: any) => String(a.due_date).localeCompare(String(b.due_date)))[0];
  const totalInvoiced = invoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0);
  const totalPaid = invoices.reduce((sum, invoice) => sum + getPaid(invoice), 0);
  const totalOutstanding = invoices.reduce((sum, invoice) => sum + getOutstanding(invoice), 0);
  const overdueInvoices = invoices.filter((invoice) => invoice.status === 'overdue' || getNextInstallment(invoice)?.status === 'overdue');
  const nextDueInvoice = [...invoices]
    .filter((invoice) => getOutstanding(invoice) > 0)
    .sort((a, b) => String(getNextInstallment(a)?.due_date || a.created_at).localeCompare(String(getNextInstallment(b)?.due_date || b.created_at)))[0];
  const nextDue = nextDueInvoice ? getNextInstallment(nextDueInvoice) : null;

  const columns = [
    { key: 'invoice_number', header: 'Invoice #' },
    { key: 'program', header: 'Program', render: (r: any) => r.enrollments?.programs?.program_name || '—' },
    { key: 'total_amount', header: 'Amount', render: (r: any) => formatCurrency(Number(r.total_amount)) },
    { key: 'paid', header: 'Paid', render: (r: any) => formatCurrency(getPaid(r)) },
    { key: 'outstanding', header: 'Balance', render: (r: any) => (
      <span className={getOutstanding(r) > 0 ? 'font-medium text-destructive' : 'font-medium text-success'}>
        {formatCurrency(getOutstanding(r))}
      </span>
    ) },
    { key: 'payment_plan_type', header: 'Plan', render: (r: any) => <span className="capitalize">{r.payment_plan_type}</span> },
    { key: 'next_due', header: 'Next Due', render: (r: any) => {
      const next = getNextInstallment(r);
      if (!next) return <span className="text-muted-foreground">—</span>;
      const overdue = next.status === 'overdue' || new Date(`${next.due_date}T00:00:00`) < new Date();
      return <span className={overdue ? 'text-destructive' : ''}>{new Date(`${next.due_date}T00:00:00`).toLocaleDateString()}</span>;
    } },
    { key: 'status', header: 'Status', render: (r: any) => <StatusBadge status={r.status} /> },
    { key: 'action', header: '', render: (r: any) => (
      <Button variant="ghost" size="sm">
        View <ArrowRight className="ml-1.5 h-4 w-4" />
      </Button>
    ) },
  ];

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <PageHeader title="My Invoices" description="View your invoices and installment plans" />

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Total Invoiced</p>
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-semibold">{formatCurrency(totalInvoiced)}</p>
          <p className="text-xs text-muted-foreground">{invoices.length} invoice{invoices.length === 1 ? '' : 's'}</p>
        </div>
        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Paid</p>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </div>
          <p className="mt-2 text-2xl font-semibold text-success">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-muted-foreground">Confirmed payments</p>
        </div>
        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Outstanding</p>
            <CreditCard className="h-4 w-4 text-primary" />
          </div>
          <p className={`mt-2 text-2xl font-semibold ${totalOutstanding > 0 ? 'text-destructive' : 'text-success'}`}>{formatCurrency(totalOutstanding)}</p>
          <p className="text-xs text-muted-foreground">{overdueInvoices.length} overdue invoice{overdueInvoices.length === 1 ? '' : 's'}</p>
        </div>
        <div className="glass-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Next Payment</p>
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-semibold">{nextDue ? formatCurrency(Number(nextDue.amount || 0)) : '—'}</p>
          <p className="text-xs text-muted-foreground">{nextDue ? `Due ${new Date(`${nextDue.due_date}T00:00:00`).toLocaleDateString()}` : 'No payment due'}</p>
        </div>
      </div>

      {totalOutstanding > 0 && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            {overdueInvoices.length > 0 ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <CreditCard className="h-4 w-4 text-primary" />}
            <span>
              {overdueInvoices.length > 0
                ? `${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? ' is' : 's are'} overdue.`
                : 'You have an outstanding balance.'}
            </span>
            {nextDueInvoice && <Badge variant="outline">{nextDueInvoice.invoice_number}</Badge>}
          </div>
          {nextDueInvoice && (
            <Button size="sm" onClick={() => navigate(`/student/invoices/${nextDueInvoice.id}`)}>
              Pay Now <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      <DataTable
        columns={columns}
        data={invoices}
        onRowClick={(r: any) => navigate(`/student/invoices/${r.id}`)}
        searchable
        searchPlaceholder="Search invoices..."
        emptyMessage="No invoices yet"
      />
    </div>
  );
}
