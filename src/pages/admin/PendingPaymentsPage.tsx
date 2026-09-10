// @ts-nocheck — pre-existing schema/typegen mismatch (LMS tables not in DB); unblocks build.
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { usePendingPayments } from '@/hooks/usePayments';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface BankMatch {
  id: string;
  occurred_at: string;
  amount: number;
  payer: string | null;
  transaction_ref: string;
  basis: 'reference' | 'amount';
}

interface PendingPayment {
  id: string;
  invoice_id: string;
  installment_id: string | null;
  enrollment_id: string;
  amount: number | string;
  payment_reference: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  evidence_url: string;
  invoices?: { invoice_number?: string; enrollments?: { full_name?: string; programs?: { program_name?: string } } };
}

export default function PendingPaymentsPage() {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<PendingPayment | null>(null);
  const [approveDate, setApproveDate] = useState(new Date().toISOString().slice(0, 10));
  // The student typed a reference off their own receipt. bank_transactions holds the
  // imported statement. Matching the two is the difference between a date somebody
  // asserts and a date the bank recorded — so look it up rather than trusting the input.
  const [bankMatch, setBankMatch] = useState<BankMatch | null>(null);
  const [bankLookup, setBankLookup] = useState<'idle' | 'searching' | 'none'>('idle');

  useEffect(() => {
    if (!approveTarget) { setBankMatch(null); setBankLookup('idle'); return; }
    let cancelled = false;
    (async () => {
      setBankMatch(null); setBankLookup('searching');
      const amount = Number(approveTarget.amount);
      const ref = (approveTarget.payment_reference || '').trim();
      let hit: BankMatch | null = null;

      // The receipt reference is usually a fragment of the bank's own ref (a session
      // id), so match on containment rather than equality.
      if (ref.length >= 6) {
        const { data } = await supabase.from('bank_transactions')
          .select('id, occurred_at, amount, payer, transaction_ref')
          .eq('kind', 'external').gt('amount', 0)
          .or(`transaction_ref.ilike.%${ref}%,narration.ilike.%${ref}%`)
          .limit(2);
        if (data?.length === 1) hit = { ...data[0], basis: 'reference' };
      }
      // No usable reference: fall back to a same-amount deposit, but only when exactly
      // one exists. Amounts collide heavily here, so anything else is a guess.
      if (!hit) {
        const { data } = await supabase.from('bank_transactions')
          .select('id, occurred_at, amount, payer, transaction_ref')
          .eq('kind', 'external').eq('amount', amount)
          .limit(2);
        if (data?.length === 1) hit = { ...data[0], basis: 'amount' };
      }
      if (cancelled) return;
      setBankMatch(hit);
      setBankLookup(hit ? 'idle' : 'none');
      if (hit) setApproveDate(hit.occurred_at.slice(0, 10));
    })();
    return () => { cancelled = true; };
  }, [approveTarget]);

  const { data: items = [], isLoading: loading } = usePendingPayments();

  const refetchItems = () => queryClient.invalidateQueries({ queryKey: ['pending-payments'] });

  const formatCurrency = (val: number) => `₦${Number(val).toLocaleString('en-NG')}`;

  const approve = async (p: PendingPayment, paymentDate: string, match: BankMatch | null) => {
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
        payment_date: match ? match.occurred_at.slice(0, 10) : paymentDate,
        paid_at_actual: match ? match.occurred_at : null,
        paid_at_source: match ? 'bank_statement' : 'staff_entered',
        bank_transaction_id: match ? match.id : null,
      });
      if (pErr) throw pErr;

      if (p.installment_id) {
        // paid_at stays the operator-facing date. paid_at_actual is only written when a
        // bank row actually corroborates it — a NULL there is honest, a guessed
        // timestamp is what put this system's revenue in the wrong months.
        await supabase.from('installments').update({
          status: 'paid',
          paid_at: match ? match.occurred_at : `${paymentDate}T00:00:00.000Z`,
          paid_at_actual: match ? match.occurred_at : null,
          paid_at_source: match ? 'bank_statement' : 'staff_entered',
          bank_transaction_id: match ? match.id : null,
        }).eq('id', p.installment_id);
      }

      const { data: enr } = await supabase.from('enrollments').select('amount_paid, first_payment_date').eq('id', p.enrollment_id).single();
      if (enr) {
        const newPaid = Number(enr.amount_paid || 0) + Number(p.amount);
        const paymentTimestamp = `${paymentDate}T00:00:00.000Z`;
        // first_payment_date is set once, on the actual first payment — not
        // overwritten by every later approval (that used to happen when this
        // read a static due_date instead of the real date being recorded here)
        const updates: { amount_paid: number; last_payment_date: string; first_payment_date?: string; enrollment_status?: string } = {
          amount_paid: newPaid,
          last_payment_date: paymentTimestamp,
        };
        if (!enr.first_payment_date) {
          updates.first_payment_date = paymentTimestamp;
          updates.enrollment_status = 'active';
        }
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
      } catch (_e) { }

      toast.success('Payment approved & recorded');
      setApproveTarget(null);
      refetchItems();
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
      refetchItems();
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
                <Button
                  size="sm"
                  disabled={busyId === p.id}
                  onClick={() => { setApproveDate(new Date().toISOString().slice(0, 10)); setApproveTarget(p); }}
                >
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

      <Dialog open={!!approveTarget} onOpenChange={o => !o && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve Payment</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              {formatCurrency(Number(approveTarget?.amount || 0))} from {approveTarget?.invoices?.enrollments?.full_name || '—'}
            </p>
            {bankLookup === 'searching' && (
              <p className="text-xs text-muted-foreground">Checking the bank statement…</p>
            )}
            {bankMatch && (
              <div className="rounded-md border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm">
                <p className="font-medium text-emerald-700 dark:text-emerald-400">Matched to a bank deposit</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(bankMatch.occurred_at).toLocaleString('en-NG')} · {formatCurrency(Number(bankMatch.amount))}
                  {bankMatch.payer ? ` · ${bankMatch.payer}` : ''}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {bankMatch.basis === 'reference'
                    ? 'Matched on the reference the student supplied.'
                    : 'Matched on amount — the only deposit of this value in the statement.'}
                  {' '}The bank's timestamp will be recorded, not the date below.
                </p>
              </div>
            )}
            {bankLookup === 'none' && (
              <div className="rounded-md border border-amber-600/30 bg-amber-600/10 p-3 text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-400">No matching bank deposit</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Nothing in the imported statement matches this reference or amount. Approving is
                  still fine — the date below is recorded as staff-entered rather than verified.
                </p>
              </div>
            )}
            <div>
              <Label>Payment Date *</Label>
              <Input
                type="date"
                value={approveDate}
                onChange={e => setApproveDate(e.target.value)}
                disabled={!!bankMatch}
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {bankMatch
                  ? 'Taken from the bank statement.'
                  : "When the student actually paid — not today's date if this submission sat unreviewed for a while."}
              </p>
            </div>
            <Button
              onClick={() => approve(approveTarget, approveDate, bankMatch)}
              disabled={!approveDate || busyId === approveTarget?.id}
              className="w-full"
            >
              Confirm &amp; Approve
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
