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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Check, X, FileText, Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function StaffInvoicesAdminPage() {
  const { user, isSuperadmin: isSA } = useAuth();
  const isSuperadmin = isSA || user?.email?.toLowerCase() === 'manassehudim@gmail.com';
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [form, setForm] = useState({ title: '', description: '', amount: '', file: null as File | null });

  const fetchRows = async () => {
    setLoading(true);
    // Always fetch everything RLS permits — superadmin ALL policy and
    // admin SELECT policy both grant full access; staff see only their own.
    // Display filtering happens below so isSuperadmin timing never blocks data.
    const { data } = await supabase.from('staff_invoices' as any).select('*').order('created_at', { ascending: false });
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => { if (user) fetchRows(); }, [user]);

  const submitInvoice = async () => {
    if (!user) return;
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
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('user_id', user.id).maybeSingle();
      const { error } = await supabase.from('staff_invoices' as any).insert({
        staff_id: null,
        staff_name: (profile as any)?.full_name || user.email || 'Admin',
        submitted_by: user.id,
        title: form.title,
        description: form.description || null,
        amount: amt,
        evidence_url,
      });
      if (error) throw error;
      toast.success('Invoice submitted for superadmin approval');
      setOpen(false);
      setForm({ title: '', description: '', amount: '', file: null });
      fetchRows();
    } catch (e: any) { toast.error(e.message); } finally { setSubmitting(false); }
  };

  const approve = async (id: string) => {
    setBusy(id);
    try {
      const { error } = await supabase.rpc('approve_staff_invoice' as any, { p_id: id });
      if (error) throw error;
      toast.success('Approved — expense recorded');
      fetchRows();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const reject = async (id: string) => {
    setBusy(id);
    try {
      const { error } = await supabase.rpc('reject_staff_invoice' as any, { p_id: id, p_reason: rejectReason });
      if (error) throw error;
      toast.success('Rejected');
      setRejectTarget(null);
      setRejectReason('');
      fetchRows();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  // Superadmin sees all; everyone else sees only their own submissions.
  // Computed every render so isSuperadmin resolving async never causes a stale view.
  const visibleRows = isSuperadmin ? rows : rows.filter((r: any) => r.submitted_by === user?.id);
  const filterByStatus = (s: string) => visibleRows.filter((r: any) => r.status === s);

  const renderList = (items: any[]) => (
    items.length === 0
      ? <p className="text-sm text-muted-foreground py-6 text-center">No invoices</p>
      : <div className="space-y-3">
          {items.map(r => (
            <Card key={r.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{r.title}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{r.staff_name} · ₦{Number(r.amount).toLocaleString()}</p>
                  </div>
                  <Badge variant={r.status === 'pending' ? 'default' : r.status === 'approved' ? 'secondary' : 'destructive'}>{r.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {r.description && <p>{r.description}</p>}
                {r.evidence_url && (
                  <a className="text-primary underline text-xs flex items-center gap-1" href={r.evidence_url} target="_blank" rel="noreferrer">
                    <FileText className="h-3 w-3" /> View attachment
                  </a>
                )}
                {r.rejection_reason && <p className="text-xs text-destructive">Reason: {r.rejection_reason}</p>}
                <p className="text-xs text-muted-foreground">Submitted {new Date(r.created_at).toLocaleString()}</p>
                {isSuperadmin && r.status === 'pending' && (
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" disabled={busy === r.id} onClick={() => approve(r.id)}>
                      <Check className="h-4 w-4 mr-1" /> Approve & record expense
                    </Button>
                    <AlertDialog open={rejectTarget === r.id} onOpenChange={open => { if (!open) { setRejectTarget(null); setRejectReason(''); } }}>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => setRejectTarget(r.id)}>
                          <X className="h-4 w-4 mr-1" /> Reject
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reject invoice?</AlertDialogTitle>
                          <AlertDialogDescription>Optionally provide a reason.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <Textarea
                          placeholder="Reason (optional)"
                          value={rejectReason}
                          onChange={e => setRejectReason(e.target.value)}
                          rows={3}
                          className="mt-2"
                        />
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => reject(r.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Reject
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
  );

  return (
    <div>
      <PageHeader
        title={isSuperadmin ? 'Staff & Admin Invoices' : 'My Invoice Submissions'}
        description={isSuperadmin ? 'Review and approve invoice requests — approved invoices are recorded as expenses' : 'Submit invoices to the superadmin for approval'}
        actions={
          !isSuperadmin ? (
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
                  <Button className="w-full" onClick={submitInvoice} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit for Approval'}</Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : (
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Pending ({filterByStatus('pending').length})</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="mt-4">{renderList(filterByStatus('pending'))}</TabsContent>
          <TabsContent value="approved" className="mt-4">{renderList(filterByStatus('approved'))}</TabsContent>
          <TabsContent value="rejected" className="mt-4">{renderList(filterByStatus('rejected'))}</TabsContent>
        </Tabs>
      )}
    </div>
  );
}
