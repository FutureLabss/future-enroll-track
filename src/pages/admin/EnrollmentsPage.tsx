import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Eye, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export default function EnrollmentsPage() {
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedEnrollment, setSelectedEnrollment] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);

  const fetchEnrollments = async () => {
    let query = supabase.from('enrollments').select('*, programs(program_name), cohorts(cohort_label), organizations(organization_name)').order('created_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('enrollment_status', statusFilter);
    const { data } = await query;
    setEnrollments(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchEnrollments();
  }, [statusFilter]);

  const handleVerify = async (enrollmentId: string, action: 'approved' | 'rejected') => {
    setVerifying(true);
    try {
      const updates: any = {
        verification_status: action,
        enrollment_status: action === 'approved' ? 'active' : 'cancelled',
      };

      if (action === 'approved') {
        const enrollment = enrollments.find(e => e.id === enrollmentId);
        if (enrollment) {
          updates.amount_paid = enrollment.total_amount;
          updates.first_payment_date = new Date().toISOString();
          updates.last_payment_date = new Date().toISOString();
        }
      }

      const { error } = await supabase.from('enrollments').update(updates).eq('id', enrollmentId);
      if (error) throw error;

      // Send notification
      try {
        await supabase.functions.invoke('send-notification', {
          body: {
            type: action === 'approved' ? 'invoice_settled' : 'overdue',
            channel: 'both',
            enrollment_id: enrollmentId,
            extra: {
              verification_action: action,
            },
          },
        });
      } catch (notifErr) {
        console.error('Notification failed:', notifErr);
      }

      toast.success(`Enrollment ${action === 'approved' ? 'approved' : 'rejected'}`);
      setSelectedEnrollment(null);
      fetchEnrollments();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const filtered = enrollments.filter(e =>
    e.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.email?.toLowerCase().includes(search.toLowerCase())
  );

  const formatCurrency = (val: number) => `₦${val.toLocaleString('en-NG')}`;

  const columns = [
    { key: 'full_name', header: 'Student' },
    { key: 'email', header: 'Email' },
    { key: 'program', header: 'Program', render: (r: any) => r.programs?.program_name || '—' },
    { key: 'cohort', header: 'Cohort', render: (r: any) => r.cohorts?.cohort_label || '—' },
    { key: 'organization', header: 'Sponsor', render: (r: any) => r.organizations?.organization_name || '—' },
    { key: 'total_amount', header: 'Total', render: (r: any) => formatCurrency(Number(r.total_amount)) },
    { key: 'payment_type', header: 'Payment', render: (r: any) => (
      <span className="capitalize text-sm">{(r as any).payment_type || 'admin'}</span>
    )},
    { key: 'verification', header: 'Verification', render: (r: any) => {
      const status = (r as any).verification_status;
      if (!status || status === 'pending') {
        return (r as any).payment_evidence_url ? (
          <Button variant="outline" size="sm" onClick={() => setSelectedEnrollment(r)}>
            <Eye className="h-3.5 w-3.5 mr-1" /> Review
          </Button>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        );
      }
      return <StatusBadge status={status === 'approved' ? 'active' : 'cancelled'} />;
    }},
    { key: 'enrollment_status', header: 'Status', render: (r: any) => <StatusBadge status={r.enrollment_status} /> },
  ];

  return (
    <div>
      <PageHeader title="Enrollments" description="Manage all student enrollments" />

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : (
        <DataTable columns={columns} data={filtered} emptyMessage="No enrollments found" />
      )}

      {/* Verification Dialog */}
      <Dialog open={!!selectedEnrollment} onOpenChange={() => setSelectedEnrollment(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Verify Payment Evidence</DialogTitle>
          </DialogHeader>
          {selectedEnrollment && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Student:</span>
                  <p className="font-medium">{selectedEnrollment.full_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Email:</span>
                  <p className="font-medium">{selectedEnrollment.email}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Program:</span>
                  <p className="font-medium">{selectedEnrollment.programs?.program_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Amount:</span>
                  <p className="font-medium">{formatCurrency(Number(selectedEnrollment.total_amount))}</p>
                </div>
              </div>

              {selectedEnrollment.payment_evidence_url && (
                <div>
                  <Label className="text-muted-foreground text-sm">Payment Receipt</Label>
                  <div className="mt-2 border border-border rounded-xl overflow-hidden">
                    <img 
                      src={selectedEnrollment.payment_evidence_url} 
                      alt="Payment evidence" 
                      className="w-full max-h-64 object-contain bg-muted"
                    />
                    <a 
                      href={selectedEnrollment.payment_evidence_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open full image
                    </a>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button 
                  className="flex-1" 
                  onClick={() => handleVerify(selectedEnrollment.id, 'approved')}
                  disabled={verifying}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve
                </Button>
                <Button 
                  variant="destructive" 
                  className="flex-1"
                  onClick={() => handleVerify(selectedEnrollment.id, 'rejected')}
                  disabled={verifying}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
