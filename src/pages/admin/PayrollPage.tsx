import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Check, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { StatCard } from '@/components/shared/StatCard';
import { Wallet, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const monthOptions = () => {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < 18; i++) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({
      value: dt.toISOString().slice(0, 10),
      label: dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    });
  }
  return out;
};

export default function PayrollPage() {
  const [staff, setStaff] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(true);

  // Staff dialog
  const [staffOpen, setStaffOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState({ full_name: '', role_title: '', base_salary: '', email: '', phone: '', bank_name: '', account_number: '' });

  // Run dialog
  const [runOpen, setRunOpen] = useState(false);
  const [runForm, setRunForm] = useState({ staff_id: '', amount: '', notes: '' });

  const months = monthOptions();

  const fetchAll = async () => {
    const [s, r] = await Promise.all([
      supabase.from('staff').select('*').order('full_name'),
      supabase.from('payroll_runs').select('*, staff(full_name, role_title)').eq('pay_month', selectedMonth).order('created_at', { ascending: false }),
    ]);
    setStaff(s.data || []);
    setRuns(r.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [selectedMonth]);

  const resetStaffForm = () => {
    setEditingStaffId(null);
    setStaffForm({ full_name: '', role_title: '', base_salary: '', email: '', phone: '', bank_name: '', account_number: '' });
  };

  const openEditStaff = (s: any) => {
    setEditingStaffId(s.id);
    setStaffForm({
      full_name: s.full_name || '',
      role_title: s.role_title || '',
      base_salary: s.base_salary != null ? String(s.base_salary) : '',
      email: s.email || '',
      phone: s.phone || '',
      bank_name: s.bank_name || '',
      account_number: s.account_number || '',
    });
    setStaffOpen(true);
  };

  const saveStaff = async () => {
    try {
      const base = parseFloat(staffForm.base_salary || '0');
      if (!staffForm.full_name) throw new Error('Name is required');
      const payload = {
        full_name: staffForm.full_name,
        role_title: staffForm.role_title || null,
        base_salary: isNaN(base) ? 0 : base,
        email: staffForm.email || null,
        phone: staffForm.phone || null,
        bank_name: staffForm.bank_name || null,
        account_number: staffForm.account_number || null,
      };
      const { error } = editingStaffId
        ? await supabase.from('staff').update(payload).eq('id', editingStaffId)
        : await supabase.from('staff').insert(payload);
      if (error) throw error;
      toast.success(editingStaffId ? 'Staff updated' : 'Staff added');
      setStaffOpen(false);
      resetStaffForm();
      fetchAll();
    } catch (err: any) { toast.error(err.message); }
  };

  const removeStaff = async (id: string) => {
    if (!confirm('Remove this staff member? Their payroll history will be deleted too.')) return;
    const { error } = await supabase.from('staff').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Removed');
    fetchAll();
  };

  const recordRun = async () => {
    try {
      const amount = parseFloat(runForm.amount);
      if (!runForm.staff_id || isNaN(amount) || amount <= 0) throw new Error('Pick staff and enter amount');
      const { error } = await supabase.from('payroll_runs').upsert({
        staff_id: runForm.staff_id,
        pay_month: selectedMonth,
        amount,
        status: 'pending',
        notes: runForm.notes || null,
      }, { onConflict: 'staff_id,pay_month' });
      if (error) throw error;
      toast.success('Payroll entry saved');
      setRunOpen(false);
      setRunForm({ staff_id: '', amount: '', notes: '' });
      fetchAll();
    } catch (err: any) { toast.error(err.message); }
  };

  const markPaid = async (id: string) => {
    const { error } = await supabase.from('payroll_runs').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Marked as paid');
    fetchAll();
  };

  const deleteRun = async (id: string) => {
    if (!confirm('Delete this payroll entry?')) return;
    const { error } = await supabase.from('payroll_runs').delete().eq('id', id);
    if (error) return toast.error(error.message);
    fetchAll();
  };

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;
  const monthTotal = runs.reduce((s, r) => s + Number(r.amount), 0);
  const monthPaid = runs.filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.amount), 0);

  const runColumns = [
    { key: 'staff', header: 'Staff', render: (r: any) => (
      <div>
        <div className="font-medium">{r.staff?.full_name || '—'}</div>
        <div className="text-xs text-muted-foreground">{r.staff?.role_title || ''}</div>
      </div>
    )},
    { key: 'amount', header: 'Amount', render: (r: any) => formatCurrency(Number(r.amount)) },
    { key: 'status', header: 'Status', render: (r: any) => (
      <Badge variant={r.status === 'paid' ? 'default' : 'secondary'} className="capitalize">{r.status}</Badge>
    )},
    { key: 'paid_at', header: 'Paid On', render: (r: any) => r.paid_at ? new Date(r.paid_at).toLocaleDateString() : '—' },
    { key: 'notes', header: 'Notes', render: (r: any) => r.notes || '—' },
    { key: 'actions', header: '', render: (r: any) => (
      <div className="flex gap-1 justify-end">
        {r.status !== 'paid' && (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); markPaid(r.id); }}>
            <Check className="h-4 w-4 mr-1" /> Mark Paid
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); deleteRun(r.id); }}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    )},
  ];

  const staffColumns = [
    { key: 'full_name', header: 'Name' },
    { key: 'role_title', header: 'Role', render: (r: any) => r.role_title || '—' },
    { key: 'base_salary', header: 'Base Salary', render: (r: any) => formatCurrency(Number(r.base_salary)) },
    { key: 'email', header: 'Email', render: (r: any) => r.email || '—' },
    { key: 'phone', header: 'Phone', render: (r: any) => r.phone || '—' },
    { key: 'bank_name', header: 'Bank', render: (r: any) => r.bank_name || '—' },
    { key: 'account_number', header: 'Account #', render: (r: any) => r.account_number || '—' },
    { key: 'active', header: 'Status', render: (r: any) => <Badge variant={r.active ? 'default' : 'secondary'}>{r.active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', header: '', render: (r: any) => (
      <div className="flex gap-1 justify-end">
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEditStaff(r); }}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); removeStaff(r.id); }}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader title="Payroll" description="Manage staff and monthly payroll runs" />

      <Tabs defaultValue="runs" className="space-y-6">
        <TabsList>
          <TabsTrigger value="runs">Monthly Payroll</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px]">
              <Label>Pay Month</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Dialog open={runOpen} onOpenChange={setRunOpen}>
              <DialogTrigger asChild>
                <Button disabled={staff.length === 0}>
                  <Plus className="h-4 w-4 mr-2" /> Add Entry
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Payroll Entry</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label>Staff *</Label>
                    <Select value={runForm.staff_id} onValueChange={v => {
                      const s = staff.find(x => x.id === v);
                      setRunForm({ ...runForm, staff_id: v, amount: s?.base_salary ? String(s.base_salary) : runForm.amount });
                    }}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select staff" /></SelectTrigger>
                      <SelectContent>
                        {staff.filter(s => s.active).map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.full_name} {s.role_title ? `— ${s.role_title}` : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Amount (₦) *</Label>
                    <Input type="number" step="0.01" value={runForm.amount} onChange={e => setRunForm({ ...runForm, amount: e.target.value })} className="mt-1.5" />
                    <p className="text-xs text-muted-foreground mt-1">Defaults to base salary; override for this month if needed.</p>
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea value={runForm.notes} onChange={e => setRunForm({ ...runForm, notes: e.target.value })} className="mt-1.5" placeholder="Bonus, deductions, etc." />
                  </div>
                  <Button onClick={recordRun} className="w-full">Save Entry</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard title="Month Total" value={formatCurrency(monthTotal)} icon={Wallet} />
            <StatCard title="Already Paid" value={formatCurrency(monthPaid)} icon={Check} />
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : runs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg">
              No payroll entries for this month yet.
            </div>
          ) : (
            <DataTable columns={runColumns} data={runs} />
          )}
        </TabsContent>

        <TabsContent value="staff" className="space-y-4">
          <div className="flex justify-between items-center">
            <StatCard title="Total Staff" value={staff.length} icon={Users} />
            <Dialog open={staffOpen} onOpenChange={(o) => { setStaffOpen(o); if (!o) resetStaffForm(); }}>
              <DialogTrigger asChild>
                <Button onClick={() => resetStaffForm()}><Plus className="h-4 w-4 mr-2" /> Add Staff</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingStaffId ? 'Edit Staff Member' : 'Add Staff Member'}</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label>Full Name *</Label>
                    <Input value={staffForm.full_name} onChange={e => setStaffForm({ ...staffForm, full_name: e.target.value })} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Role / Title</Label>
                    <Input value={staffForm.role_title} onChange={e => setStaffForm({ ...staffForm, role_title: e.target.value })} className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Base Salary (₦)</Label>
                    <Input type="number" step="0.01" value={staffForm.base_salary} onChange={e => setStaffForm({ ...staffForm, base_salary: e.target.value })} className="mt-1.5" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Email</Label>
                      <Input type="email" value={staffForm.email} onChange={e => setStaffForm({ ...staffForm, email: e.target.value })} className="mt-1.5" />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input value={staffForm.phone} onChange={e => setStaffForm({ ...staffForm, phone: e.target.value })} className="mt-1.5" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Bank Name</Label>
                      <Input value={staffForm.bank_name} onChange={e => setStaffForm({ ...staffForm, bank_name: e.target.value })} className="mt-1.5" placeholder="e.g. GTBank" />
                    </div>
                    <div>
                      <Label>Account Number</Label>
                      <Input value={staffForm.account_number} onChange={e => setStaffForm({ ...staffForm, account_number: e.target.value })} className="mt-1.5" placeholder="10-digit NUBAN" />
                    </div>
                  </div>
                  <Button onClick={saveStaff} className="w-full">{editingStaffId ? 'Save Changes' : 'Add Staff'}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : staff.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg">
              No staff yet. Add staff before recording payroll.
            </div>
          ) : (
            <DataTable columns={staffColumns} data={staff} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
