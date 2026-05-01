import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export default function PendingPaymentsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('pending_payments')
      .select('*, invoices(invoice_number, enrollments(full_name, programs(program_name)))')
      .order('created_at', { ascending: false });
    setItems(data || []);
    setLoading(false);
  };
  useEffect(() => { fetchData(); }, []);

  const formatCurrency = (val: number) => `₦${Number(val).toLocaleString('en-NG')}`;

  const approve = async (p: any) => {
    setBusyId(p.id);
    try {
      const reference = p.payment_reference || `BANK-${Date.now()}-${p.id.slice(0, 6).toUpperCase()}`;
      const { error: pErr } = await supabase.from('payments').insert({
        invoice_id: p.invoice_id,
        installment_id: p.installment_id || null,
        amount: p.amount,
        payment_reference: reference,
        payment_method: 'bank_transfer',
        notes: p.notes ? `Bank transfer · ${p.notes}` : 'Bank transfer',
      });
      if (pErr) throw pErr;

      if (p.installment_id) {
        await supabase.from('installments').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', p.installment_id);
      }

      const { data: enr } = await supabase.from('enrollments').select('amount_paid, first_payment_date').eq('id', p.enrollment_id).single();
      if (enr) {
        const newPaid = Number(enr.amount_paid || 0) + Number(p.amount);
        const updates: any = { amount_paid: newPaid, last_payment_date: new Date().toISOString() };
        if (!enr.first_payment_date) { updates.first_payment_date = new Date().toISOString(); updates.enrollment_status = 'active'; }
        await supabase.from('enrollments').update(updates).eq('id', p.enrollment_id);
      }

      const { data: remaining } = await supabase.from('installments').select('id').eq('invoice_id', p.invoice_id).neq('status', 'paid');
      const fully = remaining && remaining.length === 0;
      if (fully) {
        await supabase.from('invoices').update({ status: 'paid' }).eq('id', p.invoice_id);
        await supabase.from('enrollments').update({ enrollment_status: 'completed' }).eq('id', p.enrollment_id);
      }

      await supabase.from('pending_payments').update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: (await supabase.auth.getUser()).data.user?.id,
        payment_reference: reference,
      }).eq('id', p.id);

      try {
        await supabase.functions.invoke('send-notification', {
          body: {
            type: fully ? 'invoice_settled' : 'payment_received',
            channel: 'both',
            enrollment_id: p.enrollment_id,
            invoice_id: p.invoice_id,
            extra: { amount_paid: Number(p.amount), payment_reference: reference, payment_method: 'bank_transfer' },
          },
        });
      } catch (e) { console.error(e); }

      toast.success('Payment approved & recorded');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Approve failed');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (p: any) => {
    setBusyId(p.id);
    try {
      await supabase.from('pending_payments').update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: (await supabase.auth.getUser()).data.user?.id,
      }).eq('id', p.id);
      toast.success('Marked as rejected');
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div>
      <PageHeader title="Pending Payments" description="Verify student bank transfers and record them" />
      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {items.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No submissions yet</p>
        ) : items.map(p => (
          <div key={p.id} className="p-5 grid gap-3 md:grid-cols-[1fr_auto] items-start">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <p className="font-semibold">{p.invoices?.enrollments?.full_name || '—'}</p>
                <StatusBadge status={p.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {p.invoices?.invoice_number} · {p.invoices?.enrollments?.programs?.program_name || ''}
              </p>
              <p className="mt-2 text-lg font-bold">{formatCurrency(Number(p.amount))}</p>
              <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                {p.payment_reference && <p>Ref: {p.payment_reference}</p>}
                {p.notes && <p>Notes: {p.notes}</p>}
                <p>Submitted {new Date(p.created_at).toLocaleString()}</p>
              </div>
              <a href={p.evidence_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-2 text-sm text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> View receipt
              </a>
            </div>
            {p.status === 'pending' && (
              <div className="flex gap-2">
                <Button size="sm" disabled={busyId === p.id} onClick={() => approve(p)}>
                  <CheckCircle className="h-4 w-4 mr-1.5" /> Approve
                </Button>
                <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => reject(p)}>
                  <XCircle className="h-4 w-4 mr-1.5" /> Reject
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
