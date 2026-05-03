import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { StatCard } from '@/components/shared/StatCard';
import { Wallet, TrendingUp } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RecurringManager } from '@/components/shared/RecurringManager';

const CATEGORIES = ['workspace', 'rental', 'consulting', 'event', 'other'];

export default function OtherIncomePage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: 'workspace',
    payer_name: '',
    amount: '',
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: '',
    payment_reference: '',
    notes: '',
  });

  const fetchRows = async () => {
    const { data } = await supabase.from('other_income').select('*').order('payment_date', { ascending: false });
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, []);

  const handleSave = async () => {
    try {
      const amount = parseFloat(form.amount);
      if (!form.payer_name || isNaN(amount) || amount <= 0) throw new Error('Fill required fields');
      const { error } = await supabase.from('other_income').insert({
        category: form.category,
        payer_name: form.payer_name,
        amount,
        payment_date: form.payment_date,
        payment_method: form.payment_method || null,
        payment_reference: form.payment_reference || null,
        notes: form.notes || null,
        recorded_by: user?.id || null,
      });
      if (error) throw error;
      toast.success('Income recorded');
      setOpen(false);
      setForm({ category: 'workspace', payer_name: '', amount: '', payment_date: new Date().toISOString().slice(0, 10), payment_method: '', payment_reference: '', notes: '' });
      fetchRows();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const thisMonth = rows.filter(r => r.payment_date?.slice(0, 7) === new Date().toISOString().slice(0, 7))
    .reduce((s, r) => s + Number(r.amount), 0);

  const columns = [
    { key: 'payment_date', header: 'Date', render: (r: any) => new Date(r.payment_date).toLocaleDateString() },
    { key: 'category', header: 'Category', render: (r: any) => <span className="capitalize">{r.category}</span> },
    { key: 'payer_name', header: 'Payer' },
    { key: 'amount', header: 'Amount', render: (r: any) => formatCurrency(Number(r.amount)) },
    { key: 'payment_method', header: 'Method', render: (r: any) => r.payment_method || '—' },
    { key: 'payment_reference', header: 'Reference', render: (r: any) => r.payment_reference || '—' },
  ];

  return (
    <div>
      <PageHeader
        title="Other Income"
        description="Workspace, rental, consulting and other revenue"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Record Income</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Income</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Category *</Label>
                  <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Payer Name *</Label>
                  <Input value={form.payer_name} onChange={e => setForm({ ...form, payer_name: e.target.value })} className="mt-1.5" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Amount (₦) *</Label>
                    <Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Payment Date *</Label>
                    <Input type="date" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} className="mt-1.5" />
                  </div>
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
                  <Label>Reference</Label>
                  <Input value={form.payment_reference} onChange={e => setForm({ ...form, payment_reference: e.target.value })} className="mt-1.5" placeholder="Transaction ref" />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1.5" />
                </div>
                <Button onClick={handleSave} className="w-full">Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <StatCard title="Total Other Income" value={formatCurrency(total)} icon={Wallet} />
        <StatCard title="This Month" value={formatCurrency(thisMonth)} icon={TrendingUp} />
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All Income</TabsTrigger>
          <TabsTrigger value="recurring">Recurring</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : (
            <DataTable columns={columns} data={rows} />
          )}
        </TabsContent>
        <TabsContent value="recurring" className="mt-4">
          <RecurringManager kind="income" categories={CATEGORIES} onPosted={fetchRows} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
