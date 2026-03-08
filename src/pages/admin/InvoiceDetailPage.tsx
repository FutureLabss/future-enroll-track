import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<any>(null);
  const [installments, setInstallments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchData = async () => {
    if (!id) return;
    const [invRes, instRes] = await Promise.all([
      supabase.from('invoices').select('*, enrollments(full_name, email, program_id, programs(program_name))').eq('id', id).single(),
      supabase.from('installments').select('*').eq('invoice_id', id).order('due_date'),
    ]);
    setInvoice(invRes.data);
    setInstallments(instRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  const formatCurrency = (val: number) => `₦${Number(val).toLocaleString('en-NG')}`;

  const toggleInstallmentStatus = async (installment: any) => {
    setToggling(installment.id);
    const isPaid = installment.status === 'paid';
    const newStatus = isPaid ? 'pending' : 'paid';

    try {
      const { error } = await supabase.from('installments').update({
        status: newStatus,
        paid_at: isPaid ? null : new Date().toISOString(),
      }).eq('id', installment.id);
      if (error) throw error;

      // Recalculate enrollment amount_paid based on all paid installments
      if (invoice?.enrollment_id) {
        const { data: allInstallments } = await supabase
          .from('installments')
          .select('id, amount, status')
          .eq('invoice_id', id!);

        const adjustedPaid = (allInstallments || []).reduce((sum, i) => {
          const isPaidAfterToggle = i.id === installment.id ? newStatus === 'paid' : i.status === 'paid';
          return sum + (isPaidAfterToggle ? Number(i.amount) : 0);
        }, 0);

        await supabase.from('enrollments').update({
          amount_paid: adjustedPaid,
          last_payment_date: newStatus === 'paid' ? new Date().toISOString() : null,
        }).eq('id', invoice.enrollment_id);

        const allPaidAfter = (allInstallments || []).every(i =>
          i.id === installment.id ? newStatus === 'paid' : i.status === 'paid'
        );
        await supabase.from('invoices').update({ status: allPaidAfter ? 'paid' : 'active' }).eq('id', id!);
        await supabase.from('enrollments').update({ enrollment_status: allPaidAfter ? 'completed' : 'active' }).eq('id', invoice.enrollment_id);

        // Send notification to student
        if (newStatus === 'paid') {
          try {
            await supabase.functions.invoke('send-notification', {
              body: {
                type: allPaidAfter ? 'invoice_settled' : 'payment_received',
                channel: 'both',
                enrollment_id: invoice.enrollment_id,
                invoice_id: id,
                extra: { amount_paid: Number(installment.amount) },
              },
            });
          } catch (notifErr) {
            console.error('Notification failed:', notifErr);
          }
        }
      }

      toast.success(`Installment marked as ${newStatus}`);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!invoice) {
    return <div className="text-center py-12 text-muted-foreground">Invoice not found</div>;
  }

  const totalPaid = installments.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0);
  const totalDue = Number(invoice.total_amount) - totalPaid;

  return (
    <div>
      <PageHeader
        title={`Invoice ${invoice.invoice_number}`}
        description={`${invoice.enrollments?.full_name} — ${invoice.enrollments?.programs?.program_name || ''}`}
        actions={
          <Button variant="outline" onClick={() => navigate('/admin/invoices')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-xl font-bold font-heading text-foreground">{formatCurrency(Number(invoice.total_amount))}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">Paid</p>
          <p className="text-xl font-bold font-heading text-accent">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">Outstanding</p>
          <p className="text-xl font-bold font-heading text-destructive">{formatCurrency(totalDue)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">Status</p>
          <div className="mt-1"><StatusBadge status={invoice.status} /></div>
        </div>
      </div>

      {/* Installments */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="font-heading font-semibold text-foreground">Installments</h3>
        </div>
        <div className="divide-y divide-border">
          {installments.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No installments found</p>
          ) : (
            installments.map((inst, i) => (
              <div key={inst.id} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-muted-foreground w-6">{i + 1}.</span>
                  <div>
                    <p className="font-medium text-foreground">{formatCurrency(Number(inst.amount))}</p>
                    <p className="text-sm text-muted-foreground">
                      Due: {new Date(inst.due_date).toLocaleDateString()}
                      {inst.paid_at && ` · Paid: ${new Date(inst.paid_at).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={inst.status} />
                  <Button
                    variant={inst.status === 'paid' ? 'outline' : 'default'}
                    size="sm"
                    disabled={toggling === inst.id}
                    onClick={() => toggleInstallmentStatus(inst)}
                  >
                    {inst.status === 'paid' ? (
                      <><XCircle className="h-3.5 w-3.5 mr-1.5" /> Mark Unpaid</>
                    ) : (
                      <><CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Mark Paid</>
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
