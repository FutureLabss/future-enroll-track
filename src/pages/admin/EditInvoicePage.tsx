import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';

type Inst = { id?: string; amount: string; due_date: string; status: 'pending' | 'paid'; paid_at?: string | null };

export default function EditInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoice, setInvoice] = useState<any>(null);
  const [total, setTotal] = useState('');
  const [installments, setInstallments] = useState<Inst[]>([]);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('invoices').select('*, enrollments(full_name)').eq('id', id).single(),
      supabase.from('installments').select('*').eq('invoice_id', id).order('due_date'),
    ]).then(([inv, ins]) => {
      setInvoice(inv.data);
      setTotal(String(inv.data?.total_amount ?? ''));
      setInstallments(
        (ins.data || []).map(i => ({
          id: i.id,
          amount: String(i.amount),
          due_date: i.due_date,
          status: i.status as 'pending' | 'paid',
          paid_at: i.paid_at,
        })),
      );
      setLoading(false);
    });
  }, [id]);

  const updateInst = (idx: number, patch: Partial<Inst>) => {
    setInstallments(prev => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const addInst = () => {
    setInstallments(prev => [...prev, { amount: '0', due_date: new Date().toISOString().slice(0, 10), status: 'pending' }]);
  };

  const removeInst = (idx: number) => {
    setInstallments(prev => prev.filter((_, i) => i !== idx));
  };

  const installmentSum = installments.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalNum = Number(total) || 0;
  const mismatch = installments.length > 0 && Math.abs(totalNum - installmentSum) > 0.01;

  const handleSave = async () => {
    if (!id) return;
    if (totalNum <= 0) { toast.error('Total must be greater than 0'); return; }
    if (mismatch) {
      if (!confirm(`Installments sum (₦${installmentSum.toLocaleString()}) doesn't match total (₦${totalNum.toLocaleString()}). Save anyway?`)) return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('admin_update_invoice' as any, {
        p_invoice_id: id,
        p_total_amount: totalNum,
        p_installments: installments.map(i => ({
          amount: Number(i.amount),
          due_date: i.due_date,
          status: i.status,
          paid_at: i.status === 'paid' ? (i.paid_at || new Date().toISOString()) : null,
        })),
      });
      if (error) throw error;
      toast.success('Invoice updated');
      navigate(`/admin/invoices/${id}`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) return <div className="text-center py-12 text-muted-foreground">Admin access required</div>;
  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!invoice) return <div className="text-center py-12 text-muted-foreground">Invoice not found</div>;

  return (
    <div>
      <PageHeader
        title={`Edit ${invoice.invoice_number}`}
        description={invoice.enrollments?.full_name}
        actions={
          <Button variant="outline" onClick={() => navigate(`/admin/invoices/${id}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        }
      />

      <Card className="mb-6">
        <CardHeader><CardTitle>Total</CardTitle></CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Label>Total amount (₦)</Label>
            <Input type="number" value={total} onChange={e => setTotal(e.target.value)} className="mt-1.5" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Installments</CardTitle>
          <Button size="sm" onClick={addInst}><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </CardHeader>
        <CardContent>
          {installments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No installments. Add one or save to leave the invoice without a schedule.</p>
          ) : (
            <div className="space-y-3">
              {installments.map((inst, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg bg-muted/30 border border-border">
                  <div className="col-span-12 sm:col-span-1 text-sm font-medium text-muted-foreground">{idx + 1}.</div>
                  <div className="col-span-6 sm:col-span-3">
                    <Label className="text-xs">Amount</Label>
                    <Input type="number" value={inst.amount} onChange={e => updateInst(idx, { amount: e.target.value })} className="mt-1" />
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <Label className="text-xs">Due date</Label>
                    <Input type="date" value={inst.due_date} onChange={e => updateInst(idx, { due_date: e.target.value })} className="mt-1" />
                  </div>
                  <div className="col-span-8 sm:col-span-3">
                    <Label className="text-xs">Status</Label>
                    <Select value={inst.status} onValueChange={(v: 'pending' | 'paid') => updateInst(idx, { status: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4 sm:col-span-2 flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => removeInst(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className={`text-sm flex justify-between p-3 rounded-lg ${mismatch ? 'bg-destructive/10 text-destructive' : 'bg-accent/10 text-accent-foreground'}`}>
                <span>Installments sum</span>
                <span className="font-semibold">₦{installmentSum.toLocaleString('en-NG')} {mismatch && `(off by ₦${Math.abs(totalNum - installmentSum).toLocaleString('en-NG')})`}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex gap-3">
        <Button onClick={handleSave} disabled={saving} size="lg">
          <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving…' : 'Save changes'}
        </Button>
        <Button variant="outline" onClick={() => navigate(`/admin/invoices/${id}`)}>Cancel</Button>
      </div>
    </div>
  );
}
