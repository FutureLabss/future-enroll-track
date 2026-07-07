import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Building2, Plus, Mail, Globe, Users, CheckCircle, Clock, XCircle, Loader2,
  Copy, ExternalLink,
} from 'lucide-react';

const STATUS_COLOURS: Record<string, string> = {
  active:    'bg-success/15 text-success border-success/30',
  trial:     'bg-blue-500/15 text-blue-600 border-blue-500/30',
  suspended: 'bg-destructive/15 text-destructive border-destructive/30',
};

const PLAN_COLOURS: Record<string, string> = {
  starter:    'bg-muted text-muted-foreground border-border',
  growth:     'bg-primary/10 text-primary border-primary/30',
  enterprise: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
};

export default function HubsPage() {
  const { user, isSuperadmin, rolesReady, session } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedHub, setSelectedHub] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ name: '', slug: '', contact_email: '', plan: 'starter', status: 'active' });
  const [inviteForm, setInviteForm] = useState({ email: '', hub_role: 'owner' });

  const { data: hubsData, isLoading: loading } = useQuery({
    queryKey: ['hubs'],
    queryFn: async () => {
      const [hubsRes, invRes] = await Promise.all([
        supabase.from('hubs').select('*').order('created_at', { ascending: false }),
        supabase.from('hub_invitations').select('*, hubs(name)').order('created_at', { ascending: false }),
      ]);
      return { hubs: hubsRes.data || [], invitations: invRes.data || [] };
    },
    // RLS already restricts these tables; rolesReady avoids a fetch gate on the
    // async isSuperadmin flag, which starts false and caused an access-denied flash
    enabled: rolesReady && isSuperadmin,
  });

  const hubs = hubsData?.hubs ?? [];
  const invitations = hubsData?.invitations ?? [];
  const fetchAll = () => queryClient.invalidateQueries({ queryKey: ['hubs'] });

  if (!rolesReady) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-7 w-7 text-primary" /></div>;
  }
  if (!isSuperadmin) {
    return (
      <div className="text-center py-20">
        <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Superadmin access required</p>
        <p className="text-sm text-muted-foreground mt-1">This section is reserved for platform operators.</p>
      </div>
    );
  }

  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleCreate = async () => {
    if (!form.name.trim() || !form.slug.trim()) { toast.error('Name and slug are required'); return; }
    setSaving(true);
    try {
      const { data: hub, error } = await supabase.from('hubs').insert({
        name: form.name.trim(),
        slug: form.slug.trim(),
        contact_email: form.contact_email || null,
        plan: form.plan,
        status: form.status,
      }).select().single();
      if (error) throw error;
      toast.success(`Hub "${hub.name}" created`);
      setCreateOpen(false);
      setForm({ name: '', slug: '', contact_email: '', plan: 'starter', status: 'active' });
      fetchAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteForm.email.trim()) { toast.error('Email required'); return; }
    setSaving(true);
    try {
      // Generate token and create invitation record
      const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      const { error: invErr } = await supabase.from('hub_invitations').insert({
        hub_id: selectedHub.id,
        email: inviteForm.email.trim(),
        token,
        hub_role: inviteForm.hub_role,
      });
      if (invErr) throw invErr;

      // Fire invite email via edge function
      const { data: { session: s } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-hub-invite`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${s?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: inviteForm.email.trim(),
            hubName: selectedHub.name,
            hubId: selectedHub.id,
            hubRole: inviteForm.hub_role,
            token,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to send invite');

      toast.success(`Invitation sent to ${inviteForm.email}`);
      setInviteOpen(false);
      setInviteForm({ email: '', hub_role: 'owner' });
      fetchAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const openInvite = (hub: any) => {
    setSelectedHub(hub);
    setInviteForm({ email: hub.contact_email || '', hub_role: 'owner' });
    setInviteOpen(true);
  };

  const copyInviteLink = async (token: string) => {
    const url = `${window.location.origin}/accept-hub-invitation?token=${token}`;
    await navigator.clipboard.writeText(url);
    toast.success('Invite link copied to clipboard');
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin h-7 w-7 text-primary" /></div>;

  return (
    <div>
      <PageHeader
        title="Hub Management"
        description="Create and manage tenant hubs. Each hub is an isolated school or organisation."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />New Hub
          </Button>
        }
      />

      {/* Hubs grid */}
      {hubs.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No hubs yet</p>
          <p className="text-sm">Create the first hub to onboard a new school</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
          {hubs.map(hub => (
            <div key={hub.id} className="glass-card rounded-2xl border border-border p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base truncate">{hub.name}</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Globe className="h-3 w-3" />{hub.slug}.futurelabs.ng
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 items-end">
                  <Badge variant="outline" className={`capitalize text-xs ${STATUS_COLOURS[hub.status] || ''}`}>{hub.status}</Badge>
                  <Badge variant="outline" className={`capitalize text-xs ${PLAN_COLOURS[hub.plan] || ''}`}>{hub.plan}</Badge>
                </div>
              </div>
              {hub.contact_email && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
                  <Mail className="h-3 w-3" />{hub.contact_email}
                </p>
              )}
              <p className="text-xs text-muted-foreground mb-4">
                Created {new Date(hub.created_at).toLocaleDateString('en-NG')}
              </p>
              <Button size="sm" variant="outline" className="w-full" onClick={() => openInvite(hub)}>
                <Mail className="h-3.5 w-3.5 mr-1.5" />Invite Admin
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Pending invitations */}
      {invitations.filter(i => !i.accepted_at).length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-warning" />Pending Invitations
          </h3>
          <div className="space-y-2">
            {invitations.filter(i => !i.accepted_at).map(inv => (
              <div key={inv.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.hubs?.name} · {inv.hub_role} ·{' '}
                    {new Date(inv.expires_at) > new Date()
                      ? `Expires ${new Date(inv.expires_at).toLocaleDateString('en-NG')}`
                      : <span className="text-destructive">Expired</span>
                    }
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => copyInviteLink(inv.token)}>
                  <Copy className="h-3.5 w-3.5 mr-1" />Copy Link
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create hub dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create New Hub</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Hub Name *</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value, slug: generateSlug(e.target.value) })}
                className="mt-1.5"
                placeholder="e.g. TechBridge Academy"
              />
            </div>
            <div>
              <Label>Slug * <span className="text-muted-foreground font-normal">(URL-safe identifier)</span></Label>
              <Input
                value={form.slug}
                onChange={e => setForm({ ...form, slug: e.target.value })}
                className="mt-1.5"
                placeholder="techbridge-academy"
              />
            </div>
            <div>
              <Label>Contact Email</Label>
              <Input
                type="email"
                value={form.contact_email}
                onChange={e => setForm({ ...form, contact_email: e.target.value })}
                className="mt-1.5"
                placeholder="admin@theirhub.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Plan</Label>
                <Select value={form.plan} onValueChange={v => setForm({ ...form, plan: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleCreate} disabled={saving} className="w-full">
              {saving ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Create Hub
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Invite Admin to {selectedHub?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Email Address *</Label>
              <Input
                type="email"
                value={inviteForm.email}
                onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })}
                className="mt-1.5"
                placeholder="admin@theirhub.com"
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={inviteForm.hub_role} onValueChange={v => setInviteForm({ ...inviteForm, hub_role: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner (full control)</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSendInvite} disabled={saving} className="w-full">
              {saving ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              Send Invitation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
