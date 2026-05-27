import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Pencil, Trash2, Wallet, TrendingUp, Repeat, Check, Square, Mail, Phone, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { StatCard } from '@/components/shared/StatCard';

const CATEGORIES = ['workspace', 'rental', 'consulting', 'event', 'other'];
const fmt = (v: number) => `₦${Number(v).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const todayStr = () => new Date().toISOString().slice(0, 10);

const blankForm = {
  category: 'workspace',
  payer_name: '',
  payer_email: '',
  payer_phone: '',
  amount: '',
  payment_date: todayStr(),
  payment_method: '',
  payment_reference: '',
  notes: '',
  // recurring fields
  is_recurring: false,
  frequency: 'monthly',
  next_due_date: todayStr(),
  end_date: '',
};

export default function OtherIncomePage() {
  const { user } = useAuth();

  const [rows, setRows] = useState<any[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [recurring, setRecurring] = useState<any[]>([]);
  const [loadingRecurring, setLoadingRecurring] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<typeof blankForm>(blankForm);
  // null = creating new; string = editing existing one-off; 'recurring:id' = editing existing recurring
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const [recurringExpanded, setRecurringExpanded] = useState(true);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [sendingReminder, setSendingReminder] = useState(false);

  const fetchRows = async () => {
    setLoadingRows(true);
    const { data } = await supabase.from('other_income').select('*').order('payment_date', { ascending: false });
    setRows(data || []);
    setLoadingRows(false);
  };

  const fetchRecurring = async () => {
    setLoadingRecurring(true);
    const { data } = await (supabase as any).from('recurring_income').select('*').order('next_due_date', { ascending: true });
    setRecurring(data || []);
    setLoadingRecurring(false);
  };

  useEffect(() => { fetchRows(); fetchRecurring(); }, []);

  const openNew = () => {
    setEditingKey(null);
    setForm({ ...blankForm, payment_date: todayStr(), next_due_date: todayStr() });
    setDialogOpen(true);
  };

  const openEditIncome = (r: any) => {
    setEditingKey(r.id);
    setForm({
      category: r.category || 'workspace',
      payer_name: r.payer_name || '',
      payer_email: '',
      payer_phone: '',
      amount: r.amount != null ? String(r.amount) : '',
      payment_date: r.payment_date || todayStr(),
      payment_method: r.payment_method || '',
      payment_reference: r.payment_reference || '',
      notes: r.notes || '',
      is_recurring: false,
      frequency: 'monthly',
      next_due_date: todayStr(),
      end_date: '',
    });
    setDialogOpen(true);
  };

  const openEditRecurring = (r: any) => {
    setEditingKey(`recurring:${r.id}`);
    setForm({
      category: r.category,
      payer_name: r.payer_name || '',
      payer_email: r.payer_email || '',
      payer_phone: r.payer_phone || '',
      amount: String(r.amount),
      payment_date: todayStr(),
      payment_method: r.payment_method || '',
      payment_reference: '',
      notes: r.notes || '',
      is_recurring: true,
      frequency: r.frequency,
      next_due_date: r.next_due_date,
      end_date: r.end_date || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const amount = parseFloat(form.amount);
      if (!form.payer_name) throw new Error('Payer name is required');
      if (isNaN(amount) || amount <= 0) throw new Error('Valid amount is required');

      if (editingKey?.startsWith('recurring:')) {
        // Edit existing recurring template
        const id = editingKey.replace('recurring:', '');
        const { error } = await (supabase as any).from('recurring_income').update({
          category: form.category,
          payer_name: form.payer_name,
          payer_email: form.payer_email || null,
          payer_phone: form.payer_phone || null,
          amount,
          frequency: form.frequency,
          next_due_date: form.next_due_date,
          end_date: form.end_date || null,
          payment_method: form.payment_method || null,
          notes: form.notes || null,
        }).eq('id', id);
        if (error) throw error;
        toast.success('Recurring payment updated');
        fetchRecurring();
      } else if (editingKey) {
        // Edit existing one-off income
        const { error } = await supabase.from('other_income').update({
          category: form.category,
          payer_name: form.payer_name,
          amount,
          payment_date: form.payment_date,
          payment_method: form.payment_method || null,
          payment_reference: form.payment_reference || null,
          notes: form.notes || null,
        }).eq('id', editingKey);
        if (error) throw error;
        toast.success('Income updated');
        fetchRows();
      } else if (form.is_recurring) {
        // Create new recurring template
        const { error } = await (supabase as any).from('recurring_income').insert({
          category: form.category,
          payer_name: form.payer_name,
          payer_email: form.payer_email || null,
          payer_phone: form.payer_phone || null,
          amount,
          frequency: form.frequency,
          start_date: form.payment_date,
          next_due_date: form.next_due_date || form.payment_date,
          end_date: form.end_date || null,
          payment_method: form.payment_method || null,
          notes: form.notes || null,
          active: true,
          created_by: user?.id || null,
        });
        if (error) throw error;
        toast.success('Recurring payment set up');
        fetchRecurring();
      } else {
        // Create new one-off income
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
        fetchRows();
      }

      setDialogOpen(false);
    } catch (err: any) { toast.error(err.message); }
  };

  const removeIncome = async (id: string) => {
    const { error } = await supabase.from('other_income').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Deleted');
    fetchRows();
  };

  const markPaid = async (id: string) => {
    setMarkingPaid(id);
    try {
      const { error } = await (supabase as any).rpc('post_recurring_income', { p_id: id });
      if (error) throw error;
      toast.success('Marked paid — income recorded');
      fetchRows();
      fetchRecurring();
    } catch (err: any) { toast.error(err.message); }
    finally { setMarkingPaid(null); }
  };

  const stopRecurring = async (id: string) => {
    try {
      const { error } = await (supabase as any).rpc('stop_recurring_income', { p_id: id });
      if (error) throw error;
      toast.success('Recurring payment stopped');
      fetchRecurring();
    } catch (err: any) { toast.error(err.message); }
  };

  const sendReminders = async () => {
    setSendingReminder(true);
    try {
      const { error } = await supabase.functions.invoke('send-recurring-reminders');
      if (error) throw error;
      toast.success('Reminders sent to payers with due payments');
    } catch (err: any) { toast.error(err.message); }
    finally { setSendingReminder(false); }
  };

  const today = todayStr();
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const thisMonth = rows
    .filter(r => r.payment_date?.slice(0, 7) === today.slice(0, 7))
    .reduce((s, r) => s + Number(r.amount), 0);
  const activeRecurring = recurring.filter(r => r.active);
  const dueCount = activeRecurring.filter(r => r.next_due_date <= today).length;

  const isEditingRecurring = editingKey?.startsWith('recurring:');
  const isEditingIncome = editingKey && !isEditingRecurring;
  const showRecurringFields = form.is_recurring || isEditingRecurring;

  const dialogTitle = isEditingRecurring
    ? 'Edit Recurring Payment'
    : isEditingIncome
    ? 'Edit Income'
    : 'Record Income';

  const incomeColumns = [
    { key: 'payment_date', header: 'Date', render: (r: any) => new Date(r.payment_date).toLocaleDateString() },
    { key: 'category', header: 'Category', render: (r: any) => <span className="capitalize">{r.category}</span> },
    { key: 'payer_name', header: 'Payer' },
    { key: 'amount', header: 'Amount', render: (r: any) => fmt(Number(r.amount)) },
    { key: 'payment_method', header: 'Method', render: (r: any) => r.payment_method || '—' },
    { key: 'payment_reference', header: 'Reference', render: (r: any) => r.payment_reference || '—' },
    {
      key: 'actions', header: '', render: (r: any) => (
        <div className="flex gap-1 justify-end">
          <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); openEditIncome(r); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" onClick={e => e.stopPropagation()}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this income entry?</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => removeIncome(r.id)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Other Income"
        description="Workspace, rental, consulting and other revenue"
        actions={
          <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); }}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Record Income</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{dialogTitle}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-2 max-h-[75vh] overflow-y-auto pr-1">

                {/* Category */}
                <div>
                  <Label>Category *</Label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                {/* Payer */}
                <div>
                  <Label>Payer Name *</Label>
                  <Input className="mt-1.5" value={form.payer_name} onChange={e => setForm(f => ({ ...f, payer_name: e.target.value }))} />
                </div>

                {/* Contact */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Payer Email</Label>
                    <Input className="mt-1.5" type="email" placeholder="for reminders" value={form.payer_email} onChange={e => setForm(f => ({ ...f, payer_email: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Payer Phone</Label>
                    <Input className="mt-1.5" type="tel" placeholder="+234… (WhatsApp)" value={form.payer_phone} onChange={e => setForm(f => ({ ...f, payer_phone: e.target.value }))} />
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <Label>Amount (₦) *</Label>
                  <Input className="mt-1.5" type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>

                {/* Recurring toggle — hidden when editing an existing record */}
                {!editingKey && (
                  <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3 bg-muted/30">
                    <div>
                      <p className="text-sm font-medium flex items-center gap-2"><Repeat className="h-4 w-4 text-muted-foreground" /> Recurring payment</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Set up a repeating payment with automatic reminders</p>
                    </div>
                    <Switch
                      checked={form.is_recurring}
                      onCheckedChange={v => setForm(f => ({ ...f, is_recurring: v }))}
                    />
                  </div>
                )}

                {/* Recurring fields */}
                {showRecurringFields && (
                  <div className="space-y-3 rounded-lg border border-border p-3 bg-muted/20">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Frequency *</Label>
                        <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
                          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="yearly">Yearly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Next Due Date *</Label>
                        <Input className="mt-1.5" type="date" value={form.next_due_date} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <Label>End Date (optional)</Label>
                      <Input className="mt-1.5" type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                    </div>
                  </div>
                )}

                {/* Date — label changes based on mode */}
                <div>
                  <Label>{showRecurringFields ? 'Start Date *' : 'Payment Date *'}</Label>
                  <Input className="mt-1.5" type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
                </div>

                {/* Payment method */}
                <div>
                  <Label>Payment Method</Label>
                  <Select value={form.payment_method} onValueChange={v => setForm(f => ({ ...f, payment_method: v }))}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Reference — one-off only */}
                {!showRecurringFields && (
                  <div>
                    <Label>Reference</Label>
                    <Input className="mt-1.5" value={form.payment_reference} onChange={e => setForm(f => ({ ...f, payment_reference: e.target.value }))} placeholder="Transaction ref" />
                  </div>
                )}

                {/* Notes */}
                <div>
                  <Label>Notes</Label>
                  <Textarea className="mt-1.5" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>

                <Button className="w-full" onClick={handleSave}>
                  {isEditingRecurring ? 'Save Changes' : isEditingIncome ? 'Save Changes' : form.is_recurring ? 'Set Up Recurring Payment' : 'Record Income'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <StatCard title="Total Other Income" value={fmt(total)} icon={Wallet} />
        <StatCard title="This Month" value={fmt(thisMonth)} icon={TrendingUp} />
      </div>

      {/* Recurring Payments section */}
      <div className="mb-6">
        <button
          className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-muted/40 hover:bg-muted/60 transition-colors mb-3"
          onClick={() => setRecurringExpanded(v => !v)}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <Repeat className="h-4 w-4 text-muted-foreground" />
            Recurring Payments
            {activeRecurring.length > 0 && (
              <Badge variant="secondary" className="ml-1">{activeRecurring.length} active</Badge>
            )}
            {dueCount > 0 && (
              <Badge variant="destructive" className="ml-1">{dueCount} due</Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            {recurringExpanded && activeRecurring.some(r => r.payer_email || r.payer_phone) && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={sendingReminder}
                onClick={e => { e.stopPropagation(); sendReminders(); }}
              >
                <Mail className="h-3.5 w-3.5 mr-1.5" />
                {sendingReminder ? 'Sending…' : 'Send Reminders'}
              </Button>
            )}
            {recurringExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>

        {recurringExpanded && (
          loadingRecurring ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
          ) : recurring.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No recurring payments yet. Use <strong>Record Income</strong> and toggle <em>Recurring payment</em> to create one.
            </p>
          ) : (
            <div className="space-y-2">
              {recurring.map(r => {
                const isOverdue = r.active && r.next_due_date <= today;
                return (
                  <Card key={r.id} className={isOverdue ? 'border-destructive/40' : ''}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.active ? (isOverdue ? 'bg-destructive' : 'bg-green-500') : 'bg-muted-foreground'}`} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{r.payer_name}</span>
                            <span className="text-sm font-mono text-foreground">{fmt(Number(r.amount))}</span>
                            <Badge variant="outline" className="text-xs capitalize">{r.frequency}</Badge>
                            <span className="capitalize text-xs text-muted-foreground">{r.category}</span>
                            {!r.active && <Badge variant="secondary" className="text-xs">Stopped</Badge>}
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className={`text-xs ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                              {isOverdue ? 'Overdue: ' : 'Next due: '}
                              {new Date(r.next_due_date).toLocaleDateString()}
                            </span>
                            {r.payer_email && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />{r.payer_email}
                              </span>
                            )}
                            {r.payer_phone && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" />{r.payer_phone}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-1 flex-shrink-0">
                          {r.active && (
                            <Button
                              size="sm"
                              variant={isOverdue ? 'default' : 'outline'}
                              className="h-7 text-xs"
                              disabled={markingPaid === r.id}
                              onClick={() => markPaid(r.id)}
                            >
                              <Check className="h-3.5 w-3.5 mr-1" />
                              {markingPaid === r.id ? 'Saving…' : 'Mark Paid'}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => openEditRecurring(r)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {r.active && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" title="Stop recurring">
                                  <Square className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Stop recurring payment?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will stop future payments from <strong>{r.payer_name}</strong>. Past income records are kept.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => stopRecurring(r.id)}>
                                    Stop Recurring
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Income history */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Income History</h2>
        {loadingRows ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
        ) : (
          <DataTable columns={incomeColumns} data={rows} searchable emptyMessage="No income recorded yet." />
        )}
      </div>
    </div>
  );
}
