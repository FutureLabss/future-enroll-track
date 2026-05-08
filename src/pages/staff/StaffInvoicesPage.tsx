import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function StaffInvoicesPage() {
  const { user } = useAuth();
  const [staffRow, setStaffRow] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', amount: '', file: null as File | null });

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      const { data: s } = await supabase.from('staff').select('*').ilike('email', user.email!).maybeSingle();
      setStaffRow(s);
      const { data } = await supabase.from('staff_invoices' as any).select('*').order('created_at', { ascending: false });
      setRows(data || []);
      setLoading(false);
    })();
  }, [user]);

  const submit = async () => {
    if (!user || !staffRow) return;
    const amt = parseFloat(form.amount);
    if (!form.title || isNaN(amt) || amt <= 0) { toast.error('Title and valid amount required'); return; }
    setSubmitting(true);
    try {
      let evidence_url: string | null = null;
      if (form.file) {
        const ext = form.file.name.split('.').pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('payment-evidence').upload(path, form.file);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('payment-evidence').getPublicUrl(path);
        evidence_url = pub.publicUrl;
      }
      const { error } = await supabase.from('staff_invoices' as any).insert({
        staff_id: staffRow.id,
        staff_name: staffRow.full_name,
        submitted_by: user.id,
        title: form.title,
        description: form.description || null,
        amount: amt,
        evidence_url,
      });
      if (error) throw error;
      toast.success('Invoice submitted for approval');
      setOpen(false);
      setForm({ title: '', description: '', amount: '', file: null });
      const { data } = await supabase.from('staff_invoices' as any).select('*').order('created_at', { ascending: false });
      setRows(data || []);
    } catch (e: any) { toast.error(e.message); } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!staffRow) return (
    <div>
      <PageHeader title="Staff Invoices" description="Submit invoices to the company" />
      <Card><CardContent className="py-12 text-center text-muted-foreground">
        Your account ({user?.email}) is not registered as staff. Ask the superadmin to add you under Payroll → Staff.
      </CardContent></Card>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="My Invoices to Company"
        description="Submit reimbursement / service invoices for superadmin approval"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New Invoice</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Submit Invoice</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label>Title *</Label>
                  <Input className="mt-1.5" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. October consultancy" />
                </div>
                <div>
                  <Label>Amount (₦) *</Label>
                  <Input className="mt-1.5" type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea className="mt-1.5" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div>
                  <Label>Attachment</Label>
                  <Input className="mt-1.5" type="file" accept="image/*,application/pdf" onChange={e => setForm({ ...form, file: e.target.files?.[0] || null })} />
                </div>
                <Button className="w-full" onClick={submit} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No invoices yet</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-base">{r.title}</CardTitle>
                  <Badge variant={r.status === 'pending' ? 'default' : r.status === 'approved' ? 'secondary' : 'destructive'}>{r.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p className="font-semibold">₦{Number(r.amount).toLocaleString()}</p>
                {r.description && <p className="text-muted-foreground">{r.description}</p>}
                {r.evidence_url && <a className="text-primary underline text-xs flex items-center gap-1" href={r.evidence_url} target="_blank" rel="noreferrer"><FileText className="h-3 w-3" /> Attachment</a>}
                {r.rejection_reason && <p className="text-xs text-destructive">Reason: {r.rejection_reason}</p>}
                <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
