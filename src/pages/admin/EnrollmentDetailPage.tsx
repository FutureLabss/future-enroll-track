import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface FieldValue {
  id: string;
  value: string | null;
  custom_fields: { label: string; key: string; sort_order: number; field_type: string };
}

export default function EnrollmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [enrollment, setEnrollment] = useState<any>(null);
  const [fieldValues, setFieldValues] = useState<FieldValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('enrollments')
        .select('*, programs(program_name), cohorts(cohort_label), organizations(organization_name)')
        .eq('id', id).single(),
      supabase.from('field_values')
        .select('id, value, custom_fields(label, key, sort_order, field_type)')
        .eq('enrollment_id', id)
        .order('field_id'),
    ]).then(([eRes, fRes]) => {
      setEnrollment(eRes.data);
      setFieldValues((fRes.data as any[]) || []);
      setLoading(false);
    });
  }, [id]);

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
        updates.first_payment_date = new Date().toISOString();
        updates.last_payment_date = new Date().toISOString();
      }
      const { error } = await supabase.from('enrollments').update(updates).eq('id', enrollment.id);
      if (error) throw error;

      try {
        await supabase.functions.invoke('send-notification', {
          body: { type: action === 'approved' ? 'invoice_settled' : 'overdue', channel: 'both', enrollment_id: enrollment.id, extra: { verification_action: action } },
        });
      } catch {}

      toast.success(`Enrollment ${action}`);
      setEnrollment({ ...enrollment, ...updates });
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
          <Button variant="ghost" onClick={() => navigate('/admin/enrollments')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
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
            ['Payment Type', enrollment.payment_type],
            ['Sponsor', enrollment.organizations?.organization_name || '—'],
            ['Verification', enrollment.verification_status || 'pending'],
            ['Amount Paid', formatCurrency(Number(enrollment.amount_paid))],
            ['Outstanding', formatCurrency(Number(enrollment.outstanding_balance || 0))],
            ['Enrolled', new Date(enrollment.created_at).toLocaleDateString()],
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
            {group.fields.map(fv => (
              <div key={fv.id}>
                <p className="text-xs text-muted-foreground">{fv.custom_fields?.label}</p>
                <p className="font-medium mt-0.5">{fv.value || '—'}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

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
    </div>
  );
}
