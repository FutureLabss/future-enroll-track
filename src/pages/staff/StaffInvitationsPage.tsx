import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Mail, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function StaffInvitationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const fetchInvitations = async () => {
    if (!user) return;
    
    // Find staff record for current user's email
    const { data: staffData } = await supabase
      .from('staff')
      .select('id')
      .eq('email', user.email)
      .single();

    if (!staffData) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('staff_invitations')
      .select('*, classrooms(name, programs(program_name))')
      .eq('staff_id', staffData.id)
      .order('created_at', { ascending: false });
      
    setInvitations(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchInvitations();
  }, [user]);

  const handleAccept = async (token: string, id: string) => {
    setAcceptingId(id);
    try {
      const { error } = await supabase.rpc('accept_staff_invitation', {
        p_token: token,
        p_user_id: user?.id,
      });
      if (error) throw error;
      toast.success('Invitation accepted!');
      fetchInvitations();
      // Optional: navigate to classroom
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAcceptingId(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div>
      <PageHeader title="Classroom Invitations" description="Pending and past invitations" />
      
      {invitations.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
          <Mail className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No invitations found</p>
        </div>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {invitations.map(inv => (
            <div key={inv.id} className="glass-card rounded-xl p-5 flex items-center justify-between border border-border">
              <div>
                <h3 className="font-semibold text-lg">{inv.classrooms?.name}</h3>
                <p className="text-sm text-muted-foreground">{inv.classrooms?.programs?.program_name}</p>
                <div className="flex items-center gap-3 mt-2">
                  <Badge variant="outline">{inv.staff_type === 'teaching' ? 'Teaching Staff' : 'Non-Teaching Staff'}</Badge>
                  {inv.status === 'pending' && <Badge variant="secondary" className="text-blue-500 bg-blue-500/10"><Clock className="h-3 w-3 mr-1"/> Pending</Badge>}
                  {inv.status === 'accepted' && <Badge variant="default" className="text-success bg-success/10"><CheckCircle2 className="h-3 w-3 mr-1"/> Accepted</Badge>}
                  {inv.status === 'expired' && <Badge variant="secondary" className="text-muted-foreground bg-muted"><XCircle className="h-3 w-3 mr-1"/> Expired</Badge>}
                  {inv.status === 'revoked' && <Badge variant="destructive" className="bg-destructive/10 text-destructive"><XCircle className="h-3 w-3 mr-1"/> Revoked</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Sent {new Date(inv.created_at).toLocaleDateString()}
                  {inv.status === 'pending' && ` · Expires ${new Date(inv.expires_at).toLocaleDateString()}`}
                </p>
              </div>
              
              {inv.status === 'pending' && (
                <Button 
                  onClick={() => handleAccept(inv.token, inv.id)} 
                  disabled={acceptingId === inv.id}
                >
                  {acceptingId === inv.id ? 'Accepting...' : 'Accept Invitation'}
                </Button>
              )}
              {inv.status === 'accepted' && (
                <Button variant="outline" onClick={() => navigate(`/staff/classrooms`)}>
                  Go to Classroom
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
