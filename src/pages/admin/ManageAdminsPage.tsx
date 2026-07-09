import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getFunctionErrorMessage } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ShieldCheck, Trash2, UserPlus, Clock, ArrowUpCircle, School } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AdminRow {
  user_id: string | null;
  email: string;
  is_super: boolean;
  pending: boolean;
}

interface StaffRow {
  user_id: string;
  email: string;
  full_name: string;
  classrooms: string[] | null;
}

export default function ManageAdminsPage() {
  const { isSuperadmin, rolesReady } = useAuth();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffLoading, setStaffLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

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

  const loadStaff = async () => {
    setStaffLoading(true);
    const { data, error } = await supabase.rpc('list_staff_users' as any);
    if (!error) setStaffUsers((data as StaffRow[]) || []);
    setStaffLoading(false);
  };

  const promoteToAdmin = (row: StaffRow) => {
    setPendingConfirm({
      title: 'Promote to Admin?',
      description: `${row.full_name} will get full admin access to this hub.`,
      onConfirm: async () => {
        setPromoting(row.user_id);
        const { error } = await supabase.rpc('promote_staff_to_admin' as any, { p_user_id: row.user_id });
        if (error) {
          toast.error(error.message);
        } else {
          toast.success(`${row.full_name} promoted to admin`);
          loadAdmins();
          loadStaff();
        }
        setPromoting(null);
      },
    });
  };

  useEffect(() => {
    if (isSuperadmin) { loadAdmins(); loadStaff(); }
  }, [isSuperadmin]);

  // Wait for the async role fetch — redirecting on the initial false value
  // bounced real superadmins off this page before roles resolved
  if (!rolesReady) return null;
  if (!isSuperadmin) return <Navigate to="/admin" replace />;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('invite-admin', { body: { email } });
    if (error) {
      toast.error(await getFunctionErrorMessage(error, 'Failed to send invite'));
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

  const handleRevoke = (row: AdminRow) => {
    if (row.pending) {
      setPendingConfirm({
        title: 'Cancel Invite?',
        description: `Cancel the pending admin invite for ${row.email}?`,
        onConfirm: async () => {
          const { error } = await supabase.rpc('cancel_admin_invite' as any, { p_email: row.email });
          if (error) toast.error(error.message);
          else { toast.success('Invite cancelled.'); loadAdmins(); }
        },
      });
    } else {
      setPendingConfirm({
        title: 'Revoke Admin Access?',
        description: `Revoke admin access for ${row.email}? This cannot be undone.`,
        onConfirm: async () => {
          const { error } = await supabase.rpc('revoke_admin' as any, { p_email: row.email });
          if (error) toast.error(error.message);
          else { toast.success('Admin access revoked.'); loadAdmins(); }
        },
      });
    }
  };

  return (
    <>
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
          <ArrowUpCircle className="h-5 w-5 text-primary" /> Promote Staff to Admin
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Staff members who accepted classroom invitations can be promoted to full admins.
        </p>
        {staffLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : staffUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff members found in this hub.</p>
        ) : (
          <ul className="divide-y divide-border">
            {staffUsers.map(s => (
              <li key={s.user_id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{s.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                  {s.classrooms && s.classrooms.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {s.classrooms.map(c => (
                        <Badge key={c} variant="outline" className="text-xs gap-1">
                          <School className="h-3 w-3" />{c}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={promoting === s.user_id}
                  onClick={() => promoteToAdmin(s)}
                >
                  <ArrowUpCircle className="h-4 w-4 mr-1" />
                  {promoting === s.user_id ? 'Promoting...' : 'Promote to Admin'}
                </Button>
              </li>
            ))}
          </ul>
        )}
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

    <AlertDialog open={!!pendingConfirm} onOpenChange={open => { if (!open) setPendingConfirm(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pendingConfirm?.title}</AlertDialogTitle>
          <AlertDialogDescription>{pendingConfirm?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => { pendingConfirm?.onConfirm(); setPendingConfirm(null); }}>
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
