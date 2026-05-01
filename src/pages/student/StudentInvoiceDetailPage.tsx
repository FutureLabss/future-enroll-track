import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, CreditCard, Building2, Upload, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function StudentInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [invoice, setInvoice] = useState<any>(null);
  const [installments, setInstallments] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bankForm, setBankForm] = useState<{ amount: string; reference: string; notes: string; file: File | null; installment_id: string }>({
    amount: '', reference: '', notes: '', file: null, installment_id: '',
  });

  const fetchData = async () => {
    if (!id || !user) return;
    const [invRes, instRes, pendRes] = await Promise.all([
      supabase.from('invoices').select('*, enrollments!inner(user_id, full_name, programs(program_name))').eq('id', id).single(),
      supabase.from('installments').select('*').eq('invoice_id', id).order('due_date'),
      supabase.from('pending_payments').select('*').eq('invoice_id', id).order('created_at', { ascending: false }),
    ]);
    if (invRes.data && (invRes.data.enrollments as any)?.user_id !== user.id) {
      toast.error('Invoice not found');
      navigate('/student/invoices');
      return;
    }
    setInvoice(invRes.data);
    setInstallments(instRes.data || []);
    setPending(pendRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id, user]);

  const formatCurrency = (val: number) => `₦${Number(val).toLocaleString('en-NG')}`;

  const totalPaid = installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0);
  const outstanding = invoice ? Number(invoice.total_amount) - totalPaid : 0;
  const nextInstallment = installments.find(i => i.status !== 'paid');
  const defaultPayAmount = nextInstallment ? Number(nextInstallment.amount) : outstanding;

  const handlePaystack = async (amount: number, installment_id?: string) => {
    if (!amount || amount <= 0) { toast.error('Nothing to pay'); return; }
    setPaying(true);
    try {
      const callback_url = `${window.location.origin}/student/invoices/${id}/payment-callback`;
      const { data, error } = await supabase.functions.invoke('paystack-init', {
        body: { invoice_id: id, installment_id: installment_id || null, amount, callback_url },
      });
      if (error) throw error;
      if (!data?.authorization_url) throw new Error('No checkout URL returned');
      window.location.href = data.authorization_url;
    } catch (err: any) {
      toast.error(err.message || 'Could not start payment');
      setPaying(false);
    }
  };

  const openBankDialog = (amount: number, installment_id?: string) => {
    setBankForm({ amount: String(amount), reference: '', notes: '', file: null, installment_id: installment_id || '' });
    setBankOpen(true);
  };

  const handleBankSubmit = async () => {
    if (!user || !invoice) return;
    const amount = parseFloat(bankForm.amount);
    if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (!bankForm.file) { toast.error('Upload payment receipt'); return; }
    setSubmitting(true);
    try {
      const ext = bankForm.file.name.split('.').pop();
      const path = `${user.id}/${id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('payment-receipts').upload(path, bankForm.file);
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('payment-receipts').getPublicUrl(path);

      const { error } = await supabase.from('pending_payments').insert({
        invoice_id: id,
        enrollment_id: invoice.enrollment_id,
        installment_id: bankForm.installment_id || null,
        amount,
        payment_reference: bankForm.reference || null,
        evidence_url: pub.publicUrl,
        notes: bankForm.notes || null,
        submitted_by: user.id,
      });
      if (error) throw error;

      toast.success('Payment submitted. Admin will verify shortly.');
      setBankOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const copyAccount = () => {
    navigator.clipboard.writeText('8288339819');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!invoice) return <div className="text-center py-12 text-muted-foreground">Invoice not found</div>;

  return (
    <div>
      <PageHeader
        title={`Invoice ${invoice.invoice_number}`}
        description={(invoice.enrollments as any)?.programs?.program_name || ''}
        actions={
          <Button variant="outline" onClick={() => navigate('/student/invoices')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-xl font-bold font-heading">{formatCurrency(Number(invoice.total_amount))}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">Paid</p>
          <p className="text-xl font-bold font-heading text-accent">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">Outstanding</p>
          <p className="text-xl font-bold font-heading text-destructive">{formatCurrency(outstanding)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <div className="mt-1"><StatusBadge status={invoice.status} /></div>
        </div>
      </div>

      {outstanding > 0 && (
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <h3 className="font-heading font-semibold mb-1">Pay this invoice</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {nextInstallment
              ? `Next installment: ${formatCurrency(defaultPayAmount)} due ${new Date(nextInstallment.due_date).toLocaleDateString()}`
              : `Outstanding balance: ${formatCurrency(outstanding)}`}
          </p>

          <Tabs defaultValue="paystack">
            <TabsList>
              <TabsTrigger value="paystack"><CreditCard className="h-4 w-4 mr-2" /> Pay with Paystack</TabsTrigger>
              <TabsTrigger value="bank"><Building2 className="h-4 w-4 mr-2" /> Bank transfer</TabsTrigger>
            </TabsList>
            <TabsContent value="paystack" className="mt-4">
              <p className="text-sm text-muted-foreground mb-3">Pay instantly with card, bank, USSD, or transfer via Paystack.</p>
              <Button
                disabled={paying}
                onClick={() => handlePaystack(defaultPayAmount, nextInstallment?.id)}
              >
                {paying ? 'Redirecting…' : `Pay ${formatCurrency(defaultPayAmount)} now`}
              </Button>
            </TabsContent>
            <TabsContent value="bank" className="mt-4">
              <div className="bg-muted/50 rounded-lg p-4 mb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Send transfer to</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Account name</span><span className="font-medium">Future Labs Ltd</span></div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Account number</span>
                    <button onClick={copyAccount} className="font-mono font-semibold flex items-center gap-2 hover:text-primary">
                      8288339819 {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span className="font-medium">Moniepoint MFB</span></div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">After transferring, upload your receipt below. Your payment will be credited once verified by an admin.</p>
              </div>
              <Button onClick={() => openBankDialog(defaultPayAmount, nextInstallment?.id)}>
                <Upload className="h-4 w-4 mr-2" /> Upload payment receipt
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {pending.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="font-heading font-semibold">Submitted bank transfers</h3>
          </div>
          <div className="divide-y divide-border">
            {pending.map(p => (
              <div key={p.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{formatCurrency(Number(p.amount))} {p.payment_reference && <span className="text-muted-foreground font-normal">· {p.payment_reference}</span>}</p>
                  <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</p>
                </div>
                <StatusBadge status={p.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="font-heading font-semibold">Installments</h3>
        </div>
        <div className="divide-y divide-border">
          {installments.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Single payment invoice</p>
          ) : installments.map((inst, i) => (
            <div key={inst.id} className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground w-6">{i + 1}.</span>
                <div>
                  <p className="font-medium">{formatCurrency(Number(inst.amount))}</p>
                  <p className="text-sm text-muted-foreground">Due {new Date(inst.due_date).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={inst.status} />
                {inst.status !== 'paid' && (
                  <Button size="sm" disabled={paying} onClick={() => handlePaystack(Number(inst.amount), inst.id)}>
                    Pay {formatCurrency(Number(inst.amount))}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={bankOpen} onOpenChange={setBankOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit bank transfer</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Amount paid (₦) *</Label>
              <Input type="number" step="0.01" value={bankForm.amount} onChange={e => setBankForm({ ...bankForm, amount: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label>Transaction reference</Label>
              <Input value={bankForm.reference} onChange={e => setBankForm({ ...bankForm, reference: e.target.value })} className="mt-1.5" placeholder="From your bank app" />
            </div>
            <div>
              <Label>Receipt / proof of payment *</Label>
              <Input type="file" accept="image/*,application/pdf" onChange={e => setBankForm({ ...bankForm, file: e.target.files?.[0] || null })} className="mt-1.5" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={bankForm.notes} onChange={e => setBankForm({ ...bankForm, notes: e.target.value })} className="mt-1.5" rows={2} />
            </div>
            <Button onClick={handleBankSubmit} disabled={submitting} className="w-full">
              {submitting ? 'Submitting…' : 'Submit for verification'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
