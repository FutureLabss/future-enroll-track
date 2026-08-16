import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { usePaymentsAll } from '@/hooks/usePayments';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { PaymentReceipt } from '@/components/shared/PaymentReceipt';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [installments, setInstallments] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ invoice_id: '', installment_id: '', amount: '', payment_reference: '', payment_method: '', payment_date: new Date().toISOString().slice(0, 10) });
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);

  const { data: payments = [], isLoading: loading } = usePaymentsAll();

  // Only fetched when the dialog opens
  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices-unpaid'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices').select('id, invoice_number, status')
        .neq('status', 'paid').neq('status', 'cancelled');
      if (error) throw error;
      return data || [];
    },
    enabled: open,
    staleTime: 60_000,
  });

  const onInvoiceChange = async (invoiceId: string) => {
    setForm({ ...form, invoice_id: invoiceId, installment_id: '' });
    const { data } = await supabase.from('installments').select('*').eq('invoice_id', invoiceId).neq('status', 'paid').order('due_date');
    setInstallments(data || []);
  };

  const handleRecord = async () => {
    try {
      const amount = parseFloat(form.amount);
      if (!form.invoice_id || isNaN(amount) || amount <= 0 || !form.payment_reference) throw new Error('Fill required fields');

      if (!form.payment_date) throw new Error('Payment date is required');

      // payment_date isn't in the generated Supabase types yet (added directly via
      // migration 20260812000001, types not regenerated — see CLAUDE.md typegen note)
      const { error } = await supabase.from('payments').insert({
        invoice_id: form.invoice_id,
        installment_id: form.installment_id || null,
        amount,
        payment_reference: form.payment_reference,
        payment_method: form.payment_method || null,
        payment_date: form.payment_date,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      if (error) throw error;

      if (form.installment_id) {
        await supabase.from('installments').update({ status: 'paid', paid_at: `${form.payment_date}T00:00:00.000Z` }).eq('id', form.installment_id);
      }

      const { data: invoice } = await supabase.from('invoices').select('enrollment_id').eq('id', form.invoice_id).single();
      if (invoice) {
        const { data: enrollment } = await supabase.from('enrollments').select('amount_paid, first_payment_date').eq('id', invoice.enrollment_id).single();
        if (enrollment) {
          const newPaid = Number(enrollment.amount_paid) + amount;
          const paymentTimestamp = `${form.payment_date}T00:00:00.000Z`;
          await supabase.from('enrollments').update({
            amount_paid: newPaid,
            last_payment_date: paymentTimestamp,
            // first_payment_date is set once, on the actual first payment — not
            // overwritten by every later payment (that used to happen when this
            // read a static due_date instead of the real date being recorded here)
            ...(!enrollment.first_payment_date ? { first_payment_date: paymentTimestamp } : {}),
            ...(!enrollment.amount_paid || Number(enrollment.amount_paid) === 0 ? { enrollment_status: 'active' } : {}),
          }).eq('id', invoice.enrollment_id);
        }
      }

      const { data: remaining } = await supabase.from('installments').select('id').eq('invoice_id', form.invoice_id).neq('status', 'paid');
      const isFullyPaid = remaining && remaining.length === 0;
      if (isFullyPaid) {
        await supabase.from('invoices').update({ status: 'paid' }).eq('id', form.invoice_id);
        if (invoice) {
          await supabase.from('enrollments').update({ enrollment_status: 'completed' }).eq('id', invoice.enrollment_id);
        }
      }

      if (invoice) {
        const { data: enrollmentData } = await supabase
          .from('enrollments')
          .select('programs(program_name)')
          .eq('id', invoice.enrollment_id)
          .single();

        try {
          await supabase.functions.invoke('send-notification', {
            body: {
              type: isFullyPaid ? 'invoice_settled' : 'payment_received',
              channel: 'both',
              enrollment_id: invoice.enrollment_id,
              invoice_id: form.invoice_id,
              extra: {
                amount_paid: amount,
                payment_reference: form.payment_reference,
                payment_method: form.payment_method || null,
                program_name: (enrollmentData as any)?.programs?.program_name || '',
              },
            },
          });
        } catch (_notifErr) { }
      }

      toast.success('Payment recorded');
      setOpen(false);
      setForm({ invoice_id: '', installment_id: '', amount: '', payment_reference: '', payment_method: '', payment_date: new Date().toISOString().slice(0, 10) });
      queryClient.invalidateQueries({ queryKey: ['payments-all'] });
      queryClient.invalidateQueries({ queryKey: ['invoices-unpaid'] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

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
    { key: 'type', header: 'Type', render: (r: any) => r._kind === 'other'
      ? <span className="text-xs px-2 py-0.5 rounded bg-accent/15 text-accent-foreground">Other Income</span>
      : r._kind === 'invoice'
      ? <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">Invoice</span>
      : <span className="text-xs px-2 py-0.5 rounded bg-primary/15 text-primary">Tuition</span> },
    { key: 'payment_reference', header: 'Reference' },
    { key: 'student', header: 'Student / Payer', render: (r: any) => r.invoices?.enrollments?.full_name || '—' },
    { key: 'invoice', header: 'Invoice / Category', render: (r: any) => r.invoices?.invoice_number || '—' },
    { key: 'amount', header: 'Amount', render: (r: any) => formatCurrency(Number(r.amount)) },
    { key: 'payment_method', header: 'Method', render: (r: any) => r.payment_method || '—' },
    { key: 'created_at', header: 'Date', render: (r: any) => new Date(r._date || r.created_at).toLocaleDateString('en-NG') },
    { key: 'receipt', header: '', render: (r: any) => r._kind === 'tuition' ? (
      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openReceipt(r); }}>
        <FileText className="h-4 w-4 mr-1" /> Receipt
      </Button>
    ) : null },
  ], [openReceipt]);

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Track and record payments"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Record Payment</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Invoice *</Label>
                  <Select value={form.invoice_id} onValueChange={onInvoiceChange}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select invoice" /></SelectTrigger>
                    <SelectContent>
                      {invoices.map(i => <SelectItem key={i.id} value={i.id}>{i.invoice_number}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {installments.length > 0 && (
                  <div>
                    <Label>Installment</Label>
                    <Select value={form.installment_id} onValueChange={v => setForm({ ...form, installment_id: v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select installment" /></SelectTrigger>
                      <SelectContent>
                        {installments.map(inst => (
                          <SelectItem key={inst.id} value={inst.id}>
                            ₦{Number(inst.amount).toLocaleString()} — Due {new Date(inst.due_date).toLocaleDateString('en-NG')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Amount *</Label>
                  <Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="mt-1.5" />
                </div>
                <div>
                  <Label>Payment Reference *</Label>
                  <Input value={form.payment_reference} onChange={e => setForm({ ...form, payment_reference: e.target.value })} className="mt-1.5" placeholder="e.g. TXN-123456" />
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Payment Date *</Label>
                  <Input type="date" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} className="mt-1.5" />
                  <p className="text-xs text-muted-foreground mt-1">When the payment actually happened — not today's date if you're recording it late.</p>
                </div>
                <Button onClick={handleRecord} className="w-full">Record Payment</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : (
        <DataTable columns={columns} data={payments} />
      )}

      <PaymentReceipt open={receiptOpen} onOpenChange={setReceiptOpen} receipt={selectedReceipt} />
    </div>
  );
}
