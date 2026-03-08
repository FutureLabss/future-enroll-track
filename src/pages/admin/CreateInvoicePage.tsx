import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';

interface Installment {
  amount: string;
  due_date: string;
}

const INSTALLMENT_OPTIONS = [2, 3, 4, 6, 12];

export default function CreateInvoicePage() {
  const navigate = useNavigate();
  const [programs, setPrograms] = useState<any[]>([]);
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    program_id: '',
    cohort_id: '',
    organization_id: '',
    total_amount: '',
    currency: 'NGN',
    payment_plan_type: 'single' as 'single' | 'installment',
  });

  const [installments, setInstallments] = useState<Installment[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from('programs').select('*').eq('active', true),
      supabase.from('cohorts').select('*'),
      supabase.from('organizations').select('*').eq('active', true),
    ]).then(([p, c, o]) => {
      setPrograms(p.data || []);
      setCohorts(c.data || []);
      setOrganizations(o.data || []);
    });
  }, []);

  const filteredCohorts = cohorts.filter(c => c.program_id === form.program_id);

  const addInstallment = () => {
    setInstallments([...installments, { amount: '', due_date: '' }]);
  };

  const removeInstallment = (i: number) => {
    setInstallments(installments.filter((_, idx) => idx !== i));
  };

  const updateInstallment = (i: number, field: keyof Installment, value: string) => {
    const updated = [...installments];
    updated[i] = { ...updated[i], [field]: value };
    setInstallments(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const totalAmount = parseFloat(form.total_amount);
      if (isNaN(totalAmount) || totalAmount <= 0) throw new Error('Invalid amount');

      if (form.payment_plan_type === 'installment') {
        const installmentTotal = installments.reduce((s, inst) => s + parseFloat(inst.amount || '0'), 0);
        if (Math.abs(installmentTotal - totalAmount) > 0.01) {
          throw new Error(`Installments total (₦${installmentTotal}) doesn't match invoice total (₦${totalAmount})`);
        }
      }

      // Create enrollment
      const { data: enrollment, error: enrollError } = await supabase
        .from('enrollments')
        .insert({
          full_name: form.full_name,
          email: form.email,
          phone: form.phone || null,
          program_id: form.program_id,
          cohort_id: form.cohort_id || null,
          organization_id: form.organization_id || null,
          total_amount: totalAmount,
        })
        .select()
        .single();

      if (enrollError) throw enrollError;

      // Create invoice
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .insert({
          enrollment_id: enrollment.id,
          invoice_number: '',
          total_amount: totalAmount,
          currency: form.currency,
          payment_plan_type: form.payment_plan_type,
          status: 'active',
        } as any)
        .select()
        .single();

      if (invError) throw invError;

      // Create installments
      if (form.payment_plan_type === 'installment' && installments.length > 0) {
        const { error: instError } = await supabase.from('installments').insert(
          installments.map(inst => ({
            invoice_id: invoice.id,
            amount: parseFloat(inst.amount),
            due_date: inst.due_date,
          }))
        );
        if (instError) throw instError;
      } else {
        // Single payment - create one installment
        const { error: instError } = await supabase.from('installments').insert({
          invoice_id: invoice.id,
          amount: totalAmount,
          due_date: new Date().toISOString().split('T')[0],
        });
        if (instError) throw instError;
      }

      // Send invoice created notification
      try {
        await supabase.functions.invoke('send-notification', {
          body: {
            type: 'invoice_created',
            channel: 'both',
            enrollment_id: enrollment.id,
            invoice_id: invoice.id,
          },
        });
      } catch (notifErr) {
        console.error('Notification failed:', notifErr);
      }

      toast.success(`Invoice ${invoice.invoice_number} created!`);
      navigate('/admin/invoices');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Create Invoice" description="Create a new invoice and enrollment" />

      <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-8 max-w-2xl space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Full Name *</Label>
            <Input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="mt-1.5" />
          </div>
          <div>
            <Label>Email *</Label>
            <Input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-1.5" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="mt-1.5" />
          </div>
          <div>
            <Label>Program *</Label>
            <Select value={form.program_id} onValueChange={v => setForm({ ...form, program_id: v, cohort_id: '' })}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select program" /></SelectTrigger>
              <SelectContent>
                {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Cohort</Label>
            <Select value={form.cohort_id} onValueChange={v => setForm({ ...form, cohort_id: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select cohort" /></SelectTrigger>
              <SelectContent>
                {filteredCohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Organization (Sponsor)</Label>
            <Select value={form.organization_id} onValueChange={v => setForm({ ...form, organization_id: v })}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {organizations.map(o => <SelectItem key={o.id} value={o.id}>{o.organization_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <h3 className="font-heading font-semibold text-lg mb-4">Payment Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Total Amount *</Label>
              <Input required type="number" step="0.01" min="0" value={form.total_amount} onChange={e => setForm({ ...form, total_amount: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NGN">NGN (₦)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment Plan</Label>
              <Select value={form.payment_plan_type} onValueChange={(v: 'single' | 'installment') => { setForm({ ...form, payment_plan_type: v }); if (v === 'single') setInstallments([]); }}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single Payment</SelectItem>
                  <SelectItem value="installment">Installments</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {form.payment_plan_type === 'installment' && (
          <div className="border-t border-border pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-semibold">Installments</h3>
              <Button type="button" variant="outline" size="sm" onClick={addInstallment}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
            {installments.map((inst, i) => (
              <div key={i} className="flex gap-3 mb-3 items-end">
                <div className="flex-1">
                  <Label>Amount</Label>
                  <Input type="number" step="0.01" value={inst.amount} onChange={e => updateInstallment(i, 'amount', e.target.value)} className="mt-1" />
                </div>
                <div className="flex-1">
                  <Label>Due Date</Label>
                  <Input type="date" value={inst.due_date} onChange={e => updateInstallment(i, 'due_date', e.target.value)} className="mt-1" />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeInstallment(i)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            {installments.length === 0 && (
              <p className="text-sm text-muted-foreground">Add installments to define the payment schedule.</p>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create Invoice'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
