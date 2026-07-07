import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ArrowLeft, CheckCircle, XCircle, ExternalLink, Trash2, Pencil, ArrowLeftRight, Eye } from 'lucide-react';
import { toast } from 'sonner';

interface FieldValue {
  id: string;
  value: string | null;
  custom_fields: { label: string; key: string; sort_order: number; field_type: string };
}

export default function EnrollmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isSuperadmin } = useAuth();
  const queryClient = useQueryClient();
  const [verifying, setVerifying] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: '', email: '', phone: '', address: '', guardian_name: '', guardian_phone: '' });
  const [saving, setSaving] = useState(false);

  const openEdit = () => {
    setEditForm({ full_name: enrollment.full_name || '', email: enrollment.email || '', phone: enrollment.phone || '', address: (enrollment as any).address || '', guardian_name: (enrollment as any).guardian_name || '', guardian_phone: (enrollment as any).guardian_phone || '' });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editForm.full_name.trim() || !editForm.email.trim()) { toast.error('Name and email are required'); return; }
    setSaving(true);
    try {
      const { error: enrErr } = await supabase.from('enrollments').update({
        full_name: editForm.full_name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim() || null,
        address: editForm.address.trim() || null,
        guardian_name: editForm.guardian_name.trim() || null,
        guardian_phone: editForm.guardian_phone.trim() || null,
      }).eq('id', enrollment.id);
      if (enrErr) throw enrErr;

      if (enrollment.user_id) {
        await supabase.from('profiles').update({
          full_name: editForm.full_name.trim(),
          email: editForm.email.trim(),
          phone: editForm.phone.trim() || null,
        }).eq('user_id', enrollment.user_id);
      }

      queryClient.invalidateQueries({ queryKey: ['enrollment-detail', id] });
      toast.success('Student details updated');
      setEditOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!enrollment) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-user-account', {
        body: { account_type: 'enrollment', id: enrollment.id },
      });
      if (error) throw new Error((data as any)?.error || error.message);
      toast.success('Enrollment and login account deleted');
      navigate('/admin/enrollments');
    } catch (err: any) {
      toast.error(err.message);
      setDeleting(false);
    }
  };

  const handlePreview = async () => {
    if (!enrollment?.user_id) return;
    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke('impersonate-user', {
        body: { user_id: enrollment.user_id },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      window.open(data.action_link, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast.error('Could not generate preview link: ' + err.message);
    } finally {
      setPreviewing(false);
    }
  };

  const { data: pageData, isLoading: loading } = useQuery({
    queryKey: ['enrollment-detail', id],
    queryFn: async () => {
      const [eRes, fRes] = await Promise.all([
        supabase.from('enrollments')
          .select('*, programs(program_name), cohorts(cohort_label), organizations(organization_name)')
          .eq('id', id!).single(),
        supabase.from('field_values')
          .select('id, value, custom_fields(label, key, sort_order, field_type)')
          .eq('enrollment_id', id!)
          .order('field_id'),
      ]);
      if (eRes.error) throw eRes.error;
      let switchHistory: any[] = [];
      if (eRes.data?.user_id) {
        const { data: history } = await supabase
          .from('audit_logs')
          .select('id, details, created_at, user_id')
          .eq('action', 'switch_classroom')
          .filter('details->>student_id', 'eq', eRes.data.user_id)
          .order('created_at', { ascending: false });
        if (history && history.length > 0) {
          const adminIds = [...new Set(history.map((h: any) => h.user_id).filter(Boolean))];
          const { data: admins } = await supabase.from('profiles').select('user_id, full_name, email').in('user_id', adminIds);
          const adminMap = new Map((admins || []).map((a: any) => [a.user_id, a]));
          switchHistory = history.map((h: any) => ({ ...h, admin: adminMap.get(h.user_id) }));
        }
      }
      return { enrollment: eRes.data, fieldValues: (fRes.data as FieldValue[]) || [], switchHistory };
    },
    enabled: !!id,
    staleTime: 30_000,
  });
  const enrollment = pageData?.enrollment ?? null;
  const fieldValues = pageData?.fieldValues ?? [];
  const switchHistory = pageData?.switchHistory ?? [];

  const getEnrollmentDate = async () => {
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('enrollment_id', enrollment.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!invoice?.id) return new Date().toISOString();
    const { data: installment } = await supabase
      .from('installments')
      .select('due_date')
      .eq('invoice_id', invoice.id)
      .order('due_date', { ascending: true })
      .limit(1)
      .maybeSingle();
    return installment?.due_date ? new Date(`${installment.due_date}T00:00:00`).toISOString() : new Date().toISOString();
  };

  const handleVerify = async (action: 'approved' | 'rejected') => {
    if (!enrollment) return;
    setVerifying(true);
    try {
      const updates: any = {
        verification_status: action,
        enrollment_status: action === 'approved' ? 'active' : 'cancelled',
      };
      if (action === 'approved') {
        updates.amount_paid = enrollment.total_amount;
        updates.first_payment_date = await getEnrollmentDate();
        updates.last_payment_date = new Date().toISOString();
      }
      const { error } = await supabase.from('enrollments').update(updates).eq('id', enrollment.id);
      if (error) throw error;

      // When approving, reconcile invoice and installment statuses to match.
      // The verify flow sets amount_paid directly on the enrollment without going
      // through the normal payment recording path, so invoices/installments stay
      // unpaid unless we update them here.
      if (action === 'approved') {
        const { data: invoices } = await supabase
          .from('invoices')
          .select('id')
          .eq('enrollment_id', enrollment.id)
          .neq('status', 'paid');
        if (invoices?.length) {
          const invoiceIds = invoices.map((i: any) => i.id);
          const now = new Date().toISOString();
          await supabase
            .from('installments')
            .update({ status: 'paid', paid_at: now })
            .in('invoice_id', invoiceIds)
            .neq('status', 'paid');
          await supabase
            .from('invoices')
            .update({ status: 'paid' })
            .in('id', invoiceIds);
        }
      }

      // Only send completion email on the first approval — not on re-approval.
      // No email on rejection: send-notification has no rejection template, and
      // reusing a payment type would tell a cancelled student their payment is overdue.
      if (action === 'approved' && enrollment.verification_status !== 'approved') {
        try {
          await supabase.functions.invoke('send-notification', {
            body: { type: 'invoice_settled', channel: 'both', enrollment_id: enrollment.id, extra: { verification_action: action } },
          });
        } catch {}
      }

      toast.success(`Enrollment ${action}`);
      queryClient.invalidateQueries({ queryKey: ['enrollment-detail', id] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

  // Group fields by category based on sort_order ranges
  const groupFields = (fields: FieldValue[]) => {
    const sorted = [...fields].sort((a, b) => (a.custom_fields?.sort_order || 0) - (b.custom_fields?.sort_order || 0));
    const groups: { title: string; fields: FieldValue[] }[] = [
      { title: 'Personal Information', fields: sorted.filter(f => (f.custom_fields?.sort_order || 0) <= 10) },
      { title: 'Education Background', fields: sorted.filter(f => { const s = f.custom_fields?.sort_order || 0; return s > 10 && s <= 20; }) },
      { title: 'Employment Status', fields: sorted.filter(f => { const s = f.custom_fields?.sort_order || 0; return s > 20 && s <= 30; }) },
      { title: 'Training Program', fields: sorted.filter(f => { const s = f.custom_fields?.sort_order || 0; return s > 30 && s <= 40; }) },
      { title: 'Demographics', fields: sorted.filter(f => { const s = f.custom_fields?.sort_order || 0; return s > 40; }) },
    ];
    return groups.filter(g => g.fields.length > 0);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!enrollment) return <div className="text-center py-20 text-muted-foreground">Enrollment not found</div>;

  const isPending = !enrollment.verification_status || enrollment.verification_status === 'pending';

  return (
    <div>
      <PageHeader
        title={enrollment.full_name}
        description={`Enrollment details — ${enrollment.email}`}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate('/admin/enrollments')}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
            {isSuperadmin && (
              <Button variant="outline" onClick={openEdit}>
                <Pencil className="h-4 w-4 mr-2" /> Edit Student
              </Button>
            )}
            {isSuperadmin && enrollment?.user_id && (
              <Button variant="outline" onClick={handlePreview} disabled={previewing}>
                <Eye className="h-4 w-4 mr-2" />
                {previewing ? 'Generating...' : 'Preview as Student'}
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleting}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this enrollment?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes the enrollment along with its invoices, payments, installments, custom field values, and notifications. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="glass-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Program</p>
          <p className="font-semibold mt-1">{enrollment.programs?.program_name || '—'}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Cohort</p>
          <p className="font-semibold mt-1">{enrollment.cohorts?.cohort_label || '—'}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total Amount</p>
          <p className="font-semibold mt-1">{formatCurrency(Number(enrollment.total_amount))}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Status</p>
          <div className="mt-1"><StatusBadge status={enrollment.enrollment_status} /></div>
        </div>
      </div>

      {/* Verification banner */}
      {isPending && enrollment.payment_evidence_url && (
        <div className="glass-card rounded-xl p-6 mb-8 border-warning/30 bg-warning/5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="font-heading font-semibold">Payment Verification Required</p>
              <p className="text-sm text-muted-foreground mt-1">This student uploaded payment evidence that needs review.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowEvidence(true)}>
                <ExternalLink className="h-4 w-4 mr-2" /> View Evidence
              </Button>
              <Button onClick={() => handleVerify('approved')} disabled={verifying}>
                <CheckCircle className="h-4 w-4 mr-2" /> Approve
              </Button>
              <Button variant="destructive" onClick={() => handleVerify('rejected')} disabled={verifying}>
                <XCircle className="h-4 w-4 mr-2" /> Reject
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Core Info */}
      <div className="glass-card rounded-xl p-6 mb-8">
        <h3 className="font-heading font-semibold text-lg mb-4">Core Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            ['Full Name', enrollment.full_name],
            ['Email', enrollment.email],
            ['Phone', enrollment.phone || '—'],
            ['Address', (enrollment as any).address || '—'],
            ['Guardian Name', (enrollment as any).guardian_name || '—'],
            ['Guardian Phone', (enrollment as any).guardian_phone || '—'],
            ['Payment Type', enrollment.payment_type],
            ['Sponsor', enrollment.organizations?.organization_name || '—'],
            ['Verification', enrollment.verification_status || 'pending'],
            ['Amount Paid', formatCurrency(Number(enrollment.amount_paid))],
            ['Outstanding', formatCurrency(Number(enrollment.outstanding_balance || 0))],
            ['Enrolled', enrollment.first_payment_date ? new Date(enrollment.first_payment_date).toLocaleDateString('en-NG') : '—'],
          ].map(([label, value]) => (
            <div key={label as string}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-medium mt-0.5 capitalize">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Field Values */}
      {fieldValues.length > 0 && groupFields(fieldValues).map(group => (
        <div key={group.title} className="glass-card rounded-xl p-6 mb-6">
          <h3 className="font-heading font-semibold text-lg mb-4">{group.title}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.fields.map(fv => {
              const val = fv.value || '';
              const isImage = fv.custom_fields?.field_type === 'image' || /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(val) || (val.startsWith('http') && /\/storage\/v1\/object\//i.test(val));
              return (
                <div key={fv.id}>
                  <p className="text-xs text-muted-foreground">{fv.custom_fields?.label}</p>
                  {isImage && val ? (
                    <a href={val} target="_blank" rel="noopener noreferrer" className="mt-1 block">
                      <img src={val} alt={fv.custom_fields?.label} className="mt-1 h-32 w-32 object-cover rounded-lg border border-border bg-muted" />
                    </a>
                  ) : (
                    <p className="font-medium mt-0.5 break-words">{val || '—'}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Classroom Switch History */}
      {switchHistory.length > 0 && (
        <div className="glass-card rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-heading font-semibold text-lg">Classroom Switch History</h3>
          </div>
          <div className="space-y-3">
            {switchHistory.map((h: any) => (
              <div key={h.id} className="flex items-start gap-3 rounded-lg border border-border px-4 py-3 text-sm">
                <div className="mt-0.5 flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <ArrowLeftRight className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">
                    <span className="text-muted-foreground">{h.details.from_classroom_name || 'Unknown'}</span>
                    {' → '}
                    <span>{h.details.to_classroom_name || 'Unknown'}</span>
                  </p>
                  {h.details.reason && (
                    <p className="text-muted-foreground mt-0.5 italic">"{h.details.reason}"</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    By <span className="font-medium text-foreground">{h.admin?.full_name || h.admin?.email || 'Admin'}</span>
                    {' · '}{new Date(h.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evidence Dialog */}
      <Dialog open={showEvidence} onOpenChange={setShowEvidence}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Payment Evidence</DialogTitle></DialogHeader>
          {enrollment.payment_evidence_url && (
            <div className="border border-border rounded-xl overflow-hidden">
              <img src={enrollment.payment_evidence_url} alt="Payment evidence" className="w-full max-h-96 object-contain bg-muted" />
              <a href={enrollment.payment_evidence_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 text-sm text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> Open full image
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Student Dialog (superadmin only) */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Student Details</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Full Name *</Label>
              <Input value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} className="mt-1.5" />
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="mt-1.5" />
              {enrollment.user_id && (
                <p className="text-xs text-muted-foreground mt-1">Updates display email in profile. Login email (auth) is unchanged.</p>
              )}
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} placeholder="+234..." className="mt-1.5" />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} placeholder="Street, city, state" className="mt-1.5" />
            </div>
            <div>
              <Label>Guardian Name</Label>
              <Input value={editForm.guardian_name} onChange={e => setEditForm({ ...editForm, guardian_name: e.target.value })} placeholder="Parent or guardian" className="mt-1.5" />
            </div>
            <div>
              <Label>Guardian Phone</Label>
              <Input value={editForm.guardian_phone} onChange={e => setEditForm({ ...editForm, guardian_phone: e.target.value })} placeholder="+234..." className="mt-1.5" />
            </div>
            <Button onClick={handleEditSave} disabled={saving} className="w-full">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
