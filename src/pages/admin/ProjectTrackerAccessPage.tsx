import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  needsSync, useProjectTrackerAccess,
  type AccessChange, type TrackerAccessRow, type TrackerRole,
} from '@/hooks/useProjectTrackerAccess';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FolderKanban, RefreshCw, UserMinus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

const ROLES: { value: TrackerRole; label: string; hint: string }[] = [
  { value: 'member', label: 'Member', hint: 'Works on tasks assigned to them' },
  { value: 'manager', label: 'Manager', hint: 'Leads projects and reviews work' },
  { value: 'admin', label: 'Admin', hint: 'Oversees every project; never owns tasks' },
];

const ROLE_COLOURS: Record<TrackerRole, string> = {
  member: 'border-border text-foreground',
  manager: 'border-primary/40 text-primary',
  admin: 'border-warning/50 text-warning',
};

export default function ProjectTrackerAccessPage() {
  const { isSuperadmin, rolesReady } = useAuth();
  const { data, loading, change } = useProjectTrackerAccess(isSuperadmin);
  const [candidate, setCandidate] = useState('');
  const [role, setRole] = useState<TrackerRole>('member');
  const [busy, setBusy] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<TrackerAccessRow | null>(null);

  const rows = useMemo(
    () => data.access.filter(r => !r.revoked_at || needsSync(r)),
    [data.access],
  );

  if (!rolesReady) return null;
  if (!isSuperadmin) return <Navigate to="/admin" replace />;

  const run = async (input: AccessChange, done: string) => {
    setBusy(input.userId);
    try {
      const result = await change(input);
      if (result.synced) toast.success(done);
      else toast.error(`Saved in the LMS, but Project Tracker was not updated: ${result.error}. Use Retry.`);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const handleGrant = async () => {
    if (!candidate) return;
    const person = data.candidates.find(c => c.user_id === candidate);
    if (await run({ action: 'grant', userId: candidate, role }, `${person?.full_name ?? 'They'} can now open Project Tracker`)) {
      setCandidate('');
      setRole('member');
    }
  };

  const columns = [
    {
      key: 'full_name', header: 'Person',
      render: (r: TrackerAccessRow) => (
        <div className="min-w-0">
          <p className="font-medium truncate">{r.full_name}</p>
          <p className="text-xs text-muted-foreground truncate">{r.email}</p>
        </div>
      ),
      exportValue: (r: TrackerAccessRow) => `${r.full_name} <${r.email}>`,
    },
    {
      key: 'tracker_role', header: 'Tracker role',
      render: (r: TrackerAccessRow) => r.revoked_at
        ? <Badge variant="outline" className="text-muted-foreground">Revoked</Badge>
        : (
          <Select
            value={r.tracker_role}
            disabled={busy === r.user_id}
            onValueChange={value => run(
              { action: 'grant', userId: r.user_id, role: value as TrackerRole },
              `${r.full_name} is now a Tracker ${value}`,
            )}
          >
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ),
      exportValue: (r: TrackerAccessRow) => (r.revoked_at ? 'revoked' : r.tracker_role),
    },
    {
      key: 'granted_at', header: 'Since',
      render: (r: TrackerAccessRow) => new Date(r.granted_at).toLocaleDateString('en-NG'),
    },
    {
      key: 'synced_at', header: 'In Project Tracker',
      render: (r: TrackerAccessRow) => needsSync(r)
        ? (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-destructive/40 text-destructive" title={r.sync_error ?? undefined}>
              {r.sync_error ? 'Not applied' : 'Pending'}
            </Badge>
            <Button
              size="sm" variant="ghost" disabled={busy === r.user_id}
              onClick={() => run({ action: 'sync', userId: r.user_id }, `Project Tracker updated for ${r.full_name}`)}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />Retry
            </Button>
          </div>
        )
        : <Badge variant="outline" className={ROLE_COLOURS[r.tracker_role]}>Up to date</Badge>,
      exportValue: (r: TrackerAccessRow) => (needsSync(r) ? r.sync_error ?? 'pending' : 'up to date'),
    },
    {
      key: 'actions', header: '', exportable: false,
      render: (r: TrackerAccessRow) => !r.revoked_at && (
        <Button
          size="sm" variant="ghost" className="text-destructive" disabled={busy === r.user_id}
          onClick={() => setRevoking(r)}
        >
          <UserMinus className="mr-1 h-3.5 w-3.5" />Revoke
        </Button>
      ),
    },
  ];

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="Project Tracker Access"
          description="Only people listed here can open Project Tracker. Their Tracker role is set here too; changes reach the Tracker straight away and sign them out of it when access is revoked."
        />

        <div className="glass-card rounded-xl p-6">
          <h2 className="font-heading font-semibold text-lg mb-4 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> Give access
          </h2>
          <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
            <div className="flex-1 min-w-0">
              <Label>Person</Label>
              <Select value={candidate} onValueChange={setCandidate}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder={data.candidates.length ? 'Choose an admin, staff or marketing account' : 'Everyone eligible already has access'} />
                </SelectTrigger>
                <SelectContent>
                  {data.candidates.map(c => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.full_name} · {c.email} {c.lms_roles?.length ? `(${c.lms_roles.join(', ')})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="lg:w-64">
              <Label>Tracker role</Label>
              <Select value={role} onValueChange={value => setRole(value as TrackerRole)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label} — {o.hint}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleGrant} disabled={!candidate || busy !== null} className="h-10">
              <FolderKanban className="mr-2 h-4 w-4" />Give access
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Students and sponsor organisations cannot be given access. Someone who already exists in Project Tracker with the same email keeps their history.
          </p>
        </div>

        {loading
          ? <p className="text-sm text-muted-foreground">Loading…</p>
          : (
            <DataTable
              columns={columns}
              data={rows}
              searchable
              searchPlaceholder="Search people…"
              emptyMessage="Nobody has Project Tracker access yet."
            />
          )}
      </div>

      <AlertDialog open={!!revoking} onOpenChange={open => !open && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Project Tracker access?</AlertDialogTitle>
            <AlertDialogDescription>
              {revoking?.full_name} will be signed out of Project Tracker and will no longer see it in the LMS. Their tasks and history stay in the Tracker, and projects they lead lose their lead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (revoking) run({ action: 'revoke', userId: revoking.user_id }, `${revoking.full_name} no longer has Project Tracker access`);
                setRevoking(null);
              }}
            >
              Revoke access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
