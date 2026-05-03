import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, PlayCircle, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';

type Kind = 'expense' | 'income';

interface Props {
  kind: Kind;
  categories: string[];
  onPosted?: () => void;
}

const formatCurrency = (val: number) => `₦${Number(val).toLocaleString('en-NG')}`;

export function RecurringManager({ kind, categories, onPosted }: Props) {
  const { user } = useAuth();
  const table = kind === 'expense' ? 'recurring_expenses' : 'recurring_income';
  const partyLabel = kind === 'expense' ? 'Vendor / Payee' : 'Payer Name';
  const partyKey = kind === 'expense' ? 'vendor_name' : 'payer_name';
  const postFn = kind === 'expense' ? 'post_recurring_expense' : 'post_recurring_income';

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const blank: any = {
    category: categories[0],
    [partyKey]: '',
    amount: '',
    frequency: 'monthly',
    start_date: new Date().toISOString().slice(0, 10),
    next_due_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    payment_method: '',
    notes: '',
    active: true,
  };
  const [form, setForm] = useState<any>(blank);

  const fetchRows = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from(table).select('*').order('next_due_date', { ascending: true });
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { fetchRows(); }, []);

  const reset = () => { setEditingId(null); setForm(blank); };

  const openEdit = (r: any) => {
    setEditingId(r.id);
    setForm({
      category: r.category,
      [partyKey]: r[partyKey] || '',
      amount: String(r.amount),
      frequency: r.frequency,
      start_date: r.start_date,
      next_due_date: r.next_due_date,
      end_date: r.end_date || '',
      payment_method: r.payment_method || '',
      notes: r.notes || '',
      active: r.active,
    });
    setOpen(true);
  };

  const save = async () => {
    try {
      const amount = parseFloat(form.amount);
      if (isNaN(amount) || amount <= 0) throw new Error('Valid amount required');
      if (kind === 'income' && !form.payer_name) throw new Error('Payer name required');
      const payload: any = {
        category: form.category,
        [partyKey]: form[partyKey] || null,
        amount,
        frequency: form.frequency,
        start_date: form.start_date,
        next_due_date: form.next_due_date || form.start_date,
        end_date: form.end_date || null,
        payment_method: form.payment_method || null,
        notes: form.notes || null,
        active: form.active,
      };
      if (!editingId) payload.created_by = user?.id || null;
      const { error } = editingId
        ? await (supabase as any).from(table).update(payload).eq('id', editingId)
        : await (supabase as any).from(table).insert(payload);
      if (error) throw error;
      toast.success(editingId ? 'Updated' : 'Recurring item created');
      setOpen(false);
      reset();
      fetchRows();
    } catch (err: any) { toast.error(err.message); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this recurring template?')) return;
    const { error } = await (supabase as any).from(table).delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Deleted');
    fetchRows();
  };

  const post = async (id: string) => {
    if (!confirm('Post this period now? It will create a new record.')) return;
    const { error } = await (supabase as any).rpc(postFn, { p_id: id });
    if (error) return toast.error(error.message);
    toast.success('Posted');
    fetchRows();
    onPosted?.();
  };

  const today = new Date().toISOString().slice(0, 10);

  const columns = [
    { key: 'category', header: 'Category', render: (r: any) => <span className="capitalize">{r.category}</span> },
    { key: partyKey, header: kind === 'expense' ? 'Vendor' : 'Payer', render: (r: any) => r[partyKey] || '—' },
    { key: 'amount', header: 'Amount', render: (r: any) => formatCurrency(r.amount) },
    { key: 'frequency', header: 'Frequency', render: (r: any) => <span className="capitalize">{r.frequency}</span> },
    { key: 'next_due_date', header: 'Next Due', render: (r: any) => (
      <div className="flex items-center gap-2">
        {new Date(r.next_due_date).toLocaleDateString()}
        {r.next_due_date <= today && r.active && <Badge variant="destructive">Due</Badge>}
      </div>
    )},
    { key: 'active', header: 'Status', render: (r: any) => r.active ? <Badge>Active</Badge> : <Badge variant="secondary">Paused</Badge> },
    { key: 'actions', header: '', render: (r: any) => (
      <div className="flex gap-1 justify-end">
        {r.active && (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); post(r.id); }} title="Post next period">
            <PlayCircle className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(r); }}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); remove(r.id); }}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    )},
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Repeat className="h-4 w-4" /> Standing orders — click <PlayCircle className="h-3.5 w-3.5 inline" /> to post the next period.
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button onClick={reset}><Plus className="h-4 w-4 mr-2" /> New Recurring</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingId ? 'Edit Recurring' : 'New Recurring'} {kind === 'expense' ? 'Expense' : 'Income'}</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{partyLabel}{kind === 'income' ? ' *' : ''}</Label>
                <Input value={form[partyKey]} onChange={e => setForm({ ...form, [partyKey]: e.target.value })} className="mt-1.5" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Amount (₦) *</Label>
                  <Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="mt-1.5" />
                </div>
                <div>
                  <Label>Frequency *</Label>
                  <Select value={form.frequency} onValueChange={v => setForm({ ...form, frequency: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start Date *</Label>
                  <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value, next_due_date: form.next_due_date || e.target.value })} className="mt-1.5" />
                </div>
                <div>
                  <Label>Next Due *</Label>
                  <Input type="date" value={form.next_due_date} onChange={e => setForm({ ...form, next_due_date: e.target.value })} className="mt-1.5" />
                </div>
              </div>
              <div>
                <Label>End Date (optional)</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="mt-1.5" />
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
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1.5" />
              </div>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} />
              </div>
              <Button onClick={save} className="w-full">{editingId ? 'Save Changes' : 'Create'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No recurring items yet.</div>
      ) : (
        <DataTable columns={columns} data={rows} />
      )}
    </div>
  );
}
