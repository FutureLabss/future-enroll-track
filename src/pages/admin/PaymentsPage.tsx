import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
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
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [installments, setInstallments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ invoice_id: '', installment_id: '', amount: '', payment_reference: '', payment_method: '' });
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);

  const fetchPayments = async () => {
    const { data } = await supabase
      .from('payments')
      .select('*, invoices(invoice_number, enrollments(full_name, programs(program_name)))')
      .order('created_at', { ascending: false });
    setPayments(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchPayments();
    supabase.from('invoices').select('id, invoice_number, status').neq('status', 'paid').neq('status', 'cancelled').then(({ data }) => setInvoices(data || []));
  }, []);

  const onInvoiceChange = async (invoiceId: string) => {
    setForm({ ...form, invoice_id: invoiceId, installment_id: '' });
    const { data } = await supabase.from('installments').select('*').eq('invoice_id', invoiceId).neq('status', 'paid').order('due_date');
    setInstallments(data || []);
  };

  const handleRecord = async () => {
    try {
      const amount = parseFloat(form.amount);
      if (!form.invoice_id || isNaN(amount) || amount <= 0 || !form.payment_reference) throw new Error('Fill required fields');

      const { error } = await supabase.from('payments').insert({
        invoice_id: form.invoice_id,
        installment_id: form.installment_id || null,
        amount,
        payment_reference: form.payment_reference,
        payment_method: form.payment_method || null,
      });
      if (error) throw error;

      if (form.installment_id) {
        await supabase.from('installments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', form.installment_id);
      }

      const { data: invoice } = await supabase.from('invoices').select('enrollment_id').eq('id', form.invoice_id).single();
      if (invoice) {
        const { data: enrollment } = await supabase.from('enrollments').select('amount_paid').eq('id', invoice.enrollment_id).single();
        if (enrollment) {
          const newPaid = Number(enrollment.amount_paid) + amount;
          await supabase.from('enrollments').update({
            amount_paid: newPaid,
            last_payment_date: new Date().toISOString(),
            ...(!enrollment.amount_paid || Number(enrollment.amount_paid) === 0 ? { first_payment_date: new Date().toISOString(), enrollment_status: 'active' } : {}),
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
        // Fetch enrollment to get program name for receipt
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
        } catch (notifErr) {
          console.error('Notification failed:', notifErr);
        }
      }

      toast.success('Payment recorded');
      setOpen(false);
      setForm({ invoice_id: '', installment_id: '', amount: '', payment_reference: '', payment_method: '' });
      fetchPayments();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

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
    { key: 'student', header: 'Student', render: (r: any) => r.invoices?.enrollments?.full_name || '—' },
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
                            ₦{Number(inst.amount).toLocaleString()} — Due {new Date(inst.due_date).toLocaleDateString()}
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
