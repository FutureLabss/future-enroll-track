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
import { ShieldCheck, Trash2, UserPlus } from 'lucide-react';

const SUPERADMIN_EMAIL = 'manassehudim@gmail.com';

interface AdminRow {
  user_id: string;
  email: string;
  is_super: boolean;
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
    if (!inviteEmail.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.rpc('invite_admin' as any, { p_email: inviteEmail.trim() });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${inviteEmail} is now an admin.`);
      setInviteEmail('');
      loadAdmins();
    }
    setSubmitting(false);
  };

  const handleRevoke = async (email: string) => {
    if (!confirm(`Revoke admin access for ${email}?`)) return;
    const { error } = await supabase.rpc('revoke_admin' as any, { p_email: email });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Admin access revoked.');
      loadAdmins();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage Admins"
        description="Only the superadmin can grant or revoke admin access. Users must already have an account before being promoted."
      />

      <div className="glass-card rounded-xl p-6">
        <h2 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" /> Invite Admin
        </h2>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <Label htmlFor="invite-email">User email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="user@example.com"
              className="mt-1.5"
            />
          </div>
          <Button type="submit" disabled={submitting} className="h-10 sm:w-auto">
            {submitting ? 'Inviting...' : 'Grant Admin Access'}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-3">
          The user must have signed up first. They'll instantly gain admin privileges.
        </p>
      </div>

      <div className="glass-card rounded-xl p-6">
        <h2 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Current Admins
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : admins.length === 0 ? (
          <p className="text-sm text-muted-foreground">No admins found.</p>
        ) : (
          <ul className="divide-y divide-border">
            {admins.map((a) => (
              <li key={a.user_id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{a.email}</p>
                  {a.is_super && (
                    <Badge variant="secondary" className="mt-1">Superadmin</Badge>
                  )}
                </div>
                {!a.is_super && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(a.email)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Revoke
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
