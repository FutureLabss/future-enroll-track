import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useScholarships, type Scholarship } from '@/hooks/useScholarships';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatCard } from '@/components/shared/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { GraduationCap, Wallet } from 'lucide-react';
import { toast } from 'sonner';

const money = (n: number) => `₦${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export default function ScholarshipsPage() {
  const [tab, setTab] = useState<'live' | 'all'>('live');
  const { data, loading, revoke } = useScholarships(tab === 'all');
  const [revoking, setRevoking] = useState<Scholarship | null>(null);
  const live = data.filter(s => !s.revoked_at);

  const columns = useMemo(() => [
    { key: 'student_name', header: 'Student', render: (s: Scholarship) => (
      <div>
        <Link to={`/admin/enrollments/${s.enrollment_id}`} className="font-medium hover:underline">{s.student_name}</Link>
        <p className="text-xs text-muted-foreground">{s.program_name}{s.cohort_label ? ` · ${s.cohort_label}` : ''}</p>
      </div>
    ) },
    { key: 'amount', header: 'Amount', render: (s: Scholarship) => (
      <div>
        <span className="font-medium">{money(s.amount)}</span>
        {s.applied_amount < s.amount && <p className="text-xs text-muted-foreground">{s.applied_amount > 0 ? `${money(s.applied_amount)} taken off the balance` : 'Free place, no invoice'}</p>}
      </div>
    ) },
    { key: 'funded_by', header: 'Funded by' },
    { key: 'reason', header: 'Reason', render: (s: Scholarship) => (
      <div className="max-w-72">
        <p className="text-sm">{s.reason}</p>
        {s.revoked_at && <p className="mt-1 text-xs text-destructive">Revoked {new Date(s.revoked_at).toLocaleDateString('en-NG')}: {s.revoke_reason}</p>}
      </div>
    ) },
    { key: 'awarded_at', header: 'Awarded', render: (s: Scholarship) => (
      <div className="text-sm">
        {new Date(s.awarded_at).toLocaleDateString('en-NG')}
        {s.awarded_by_name && <p className="text-xs text-muted-foreground">by {s.awarded_by_name}</p>}
      </div>
    ) },
    { key: 'status', header: '', exportable: false, render: (s: Scholarship) => s.revoked_at
      ? <Badge variant="outline" className="bg-muted text-muted-foreground border-muted">Revoked</Badge>
      : s.can_manage && <Button size="sm" variant="ghost" onClick={() => setRevoking(s)}>Revoke</Button> },
  ], []);

  return (
    <div>
      <PageHeader title="Scholarships"
        description="Fees FutureLabs has waived. Award one from the student's enrollment page; the CEO or a training manager can award and revoke." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard title="Students on scholarship" value={live.length} icon={GraduationCap} />
        <StatCard title="Value of fees waived" value={money(live.reduce((a, s) => a + Number(s.amount), 0))} icon={Wallet} />
      </div>
      <Tabs value={tab} onValueChange={v => setTab(v as 'live' | 'all')} className="mb-4">
        <TabsList>
          <TabsTrigger value="live">Current</TabsTrigger>
          <TabsTrigger value="all">Including revoked</TabsTrigger>
        </TabsList>
      </Tabs>
      {loading
        ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
        : <DataTable columns={columns} data={data} searchable searchPlaceholder="Search students…" emptyMessage="No scholarships yet" />}
      {revoking && <RevokeDialog scholarship={revoking} onClose={() => setRevoking(null)} onRevoke={revoke} />}
    </div>
  );
}

function RevokeDialog({ scholarship, onClose, onRevoke }: {
  scholarship: Scholarship; onClose: () => void; onRevoke: (id: string, reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke {scholarship.student_name}'s scholarship?</DialogTitle>
          <DialogDescription>
            {scholarship.applied_amount > 0
              ? `${money(scholarship.applied_amount)} goes back on the balance, due in 7 days.`
              : 'No balance was waived, so nothing goes back on the account.'}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="revoke-reason">Reason</Label>
          <Textarea id="revoke-reason" rows={2} value={reason} onChange={e => setReason(e.target.value)} className="mt-1.5" />
        </div>
        <DialogFooter>
          <Button variant="destructive" disabled={busy || !reason.trim()} onClick={async () => {
            setBusy(true);
            try { await onRevoke(scholarship.id, reason.trim()); toast.success('Scholarship revoked'); onClose(); }
            catch (e) { toast.error((e as Error).message); }
            finally { setBusy(false); }
          }}>Revoke</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
