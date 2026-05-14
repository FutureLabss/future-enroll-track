import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Mail, CheckCircle2, XCircle, Clock } from 'lucide-react';

export default function StaffInvitationsAdminPage() {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInvitations = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('staff_invitations')
      .select('*, staff(full_name, email), classrooms(name)')
      .order('created_at', { ascending: false });
    setInvitations(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchInvitations();
  }, []);

  const handleRevoke = async (id: string) => {
    const { error } = await supabase
      .from('staff_invitations')
      .update({ status: 'revoked' })
      .eq('id', id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Invitation revoked');
      fetchInvitations();
    }
  };

  const handleResend = async (invitation: any) => {
    try {
      const { error } = await supabase.functions.invoke('send-staff-invitation', {
        body: {
          email: invitation.staff?.email,
          name: invitation.staff?.full_name,
          classroom: invitation.classrooms?.name,
          token: invitation.token,
          staffType: invitation.staff_type
        }
      });
      if (error) throw error;
      toast.success('Invitation email resent!');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const columns = [
    { key: 'staff', header: 'Staff', render: (r: any) => (
      <div>
        <p className="font-medium">{r.staff?.full_name}</p>
        <p className="text-xs text-muted-foreground">{r.staff?.email}</p>
      </div>
    )},
    { key: 'classroom', header: 'Classroom', render: (r: any) => r.classrooms?.name },
    { key: 'role', header: 'Role', render: (r: any) => <Badge variant="outline">{r.staff_type === 'teaching' ? 'Teaching' : 'Non-Teaching'}</Badge> },
    { key: 'status', header: 'Status', render: (r: any) => {
      switch (r.status) {
        case 'pending': return <Badge variant="secondary" className="text-blue-500 bg-blue-500/10"><Clock className="h-3 w-3 mr-1"/> Pending</Badge>;
        case 'accepted': return <Badge variant="default" className="text-success bg-success/10"><CheckCircle2 className="h-3 w-3 mr-1"/> Accepted</Badge>;
        case 'expired': return <Badge variant="secondary" className="text-muted-foreground bg-muted"><XCircle className="h-3 w-3 mr-1"/> Expired</Badge>;
        case 'revoked': return <Badge variant="destructive" className="bg-destructive/10 text-destructive"><XCircle className="h-3 w-3 mr-1"/> Revoked</Badge>;
        default: return <Badge>{r.status}</Badge>;
      }
    }},
    { key: 'dates', header: 'Dates', render: (r: any) => (
      <div className="text-xs">
        <p>Sent: {new Date(r.created_at).toLocaleDateString()}</p>
        {r.status === 'pending' && <p className="text-muted-foreground">Expires: {new Date(r.expires_at).toLocaleDateString()}</p>}
        {r.status === 'accepted' && <p className="text-success">Accepted: {new Date(r.accepted_at).toLocaleDateString()}</p>}
      </div>
    )},
    { key: 'actions', header: '', render: (r: any) => r.status === 'pending' ? (
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={() => handleResend(r)}><Mail className="h-4 w-4" /></Button>
        <Button size="sm" variant="destructive" onClick={() => handleRevoke(r.id)}>Revoke</Button>
      </div>
    ) : null }
  ];

  return (
    <div>
      <PageHeader title="Staff Invitations" description="Manage classroom invitations sent to staff" />
      <DataTable columns={columns} data={invitations} />
    </div>
  );
}
