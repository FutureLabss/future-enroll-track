import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ShieldCheck, Trash2, UserPlus, Clock } from 'lucide-react';

const SUPERADMIN_EMAIL = 'manassehudim@gmail.com';

interface AdminRow {
  user_id: string | null;
  email: string;
  is_super: boolean;
  pending: boolean;
}

export default function ManageAdminsPage() {
  const { user, loading: authLoading } = useAuth();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isSuperadmin = user?.email?.toLowerCase() === SUPERADMIN_EMAIL;

  const loadAdmins = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_admins' as any);
    if (error) {
      toast.error('Failed to load admins: ' + error.message);
    } else {
      setAdmins((data as AdminRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isSuperadmin) loadAdmins();
  }, [isSuperadmin]);

  if (authLoading) return null;
  if (!isSuperadmin) return <Navigate to="/admin" replace />;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('invite-admin', { body: { email } });
    if (error) {
      toast.error(error.message || 'Failed to send invite');
    } else if (data?.error) {
      toast.error(data.error);
    } else if (data?.already_existed) {
      toast.success(`${email} already had an account — promoted to admin.`);
      setInviteEmail('');
      loadAdmins();
    } else if (data?.invite_sent) {
      toast.success(`Invitation email sent to ${email}. They'll get admin access on signup.`);
      setInviteEmail('');
      loadAdmins();
    } else {
      toast.success(`Invite recorded for ${email}. They'll be admin once they sign up.`);
      setInviteEmail('');
      loadAdmins();
    }
    setSubmitting(false);
  };

  const handleRevoke = async (row: AdminRow) => {
    if (row.pending) {
      if (!confirm(`Cancel pending invite for ${row.email}?`)) return;
      const { error } = await supabase.rpc('cancel_admin_invite' as any, { p_email: row.email });
      if (error) toast.error(error.message);
      else { toast.success('Invite cancelled.'); loadAdmins(); }
    } else {
      if (!confirm(`Revoke admin access for ${row.email}?`)) return;
      const { error } = await supabase.rpc('revoke_admin' as any, { p_email: row.email });
      if (error) toast.error(error.message);
      else { toast.success('Admin access revoked.'); loadAdmins(); }
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage Admins"
        description="Only the superadmin can invite or revoke admin access. Invites are sent by email — recipients become admin as soon as they sign up."
      />

      <div className="glass-card rounded-xl p-6">
        <h2 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" /> Invite Admin
        </h2>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="newadmin@example.com"
              className="mt-1.5"
            />
          </div>
          <Button type="submit" disabled={submitting} className="h-10 sm:w-auto">
            {submitting ? 'Sending...' : 'Send Admin Invite'}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-3">
          They'll receive an email to set up their account. If they already have an account, they'll be promoted instantly.
        </p>
      </div>

      <div className="glass-card rounded-xl p-6">
        <h2 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Admins & Pending Invites
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : admins.length === 0 ? (
          <p className="text-sm text-muted-foreground">No admins found.</p>
        ) : (
          <ul className="divide-y divide-border">
            {admins.map((a) => (
              <li key={(a.user_id ?? '') + a.email} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{a.email}</p>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {a.is_super && <Badge variant="secondary">Superadmin</Badge>}
                    {a.pending && (
                      <Badge variant="outline" className="gap-1">
                        <Clock className="h-3 w-3" /> Pending signup
                      </Badge>
                    )}
                    {!a.is_super && !a.pending && <Badge>Admin</Badge>}
                  </div>
                </div>
                {!a.is_super && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(a)}
                    className="text-destructive hover:text-destructive shrink-0"
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> {a.pending ? 'Cancel' : 'Revoke'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
