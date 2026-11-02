import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCertificateRequests, type CertificateRequest, type RequestStatus } from '@/hooks/useCertificateRequests';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const STATUS_COLOURS: Record<string, string> = {
  pending: 'bg-warning/15 text-warning border-warning/30',
  approved: 'bg-success/15 text-success border-success/30',
  declined: 'bg-destructive/10 text-destructive border-destructive/30',
  cancelled: 'bg-muted text-muted-foreground border-muted',
};

const money = (n: number) => `₦${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export default function CertificatesPage() {
  const { isSuperadmin } = useAuth();
  const [tab, setTab] = useState<RequestStatus | 'all'>('pending');
  const { data, loading, approve, decline, cancel } = useCertificateRequests(tab);
  const [deciding, setDeciding] = useState<{ request: CertificateRequest; approve: boolean } | null>(null);

  const columns = useMemo(() => [
    { key: 'student_name', header: 'Student', render: (r: CertificateRequest) => (
      <div>
        <Link to={`/admin/enrollments/${r.enrollment_id}`} className="font-medium hover:underline">{r.student_name}</Link>
        <p className="text-xs text-muted-foreground">{r.program_name}{r.cohort_label ? ` · ${r.cohort_label}` : ''}</p>
      </div>
    ) },
    { key: 'requested_by_name', header: 'Requested', render: (r: CertificateRequest) => (
      <div>
        <p>{r.requested_by_name || '—'}</p>
        <p className="text-xs text-muted-foreground">{new Date(r.requested_at).toLocaleDateString('en-NG')}</p>
        {r.note && <p className="mt-1 max-w-64 text-xs italic text-muted-foreground">“{r.note}”</p>}
      </div>
    ) },
    { key: 'outstanding', header: 'Fees', render: (r: CertificateRequest) => Number(r.outstanding) > 0
      ? <span className="font-medium text-destructive">{money(r.outstanding)} owing</span>
      : <span className="text-success">Cleared</span> },
    { key: 'status', header: 'Status', render: (r: CertificateRequest) => (
      <div>
        <Badge variant="outline" className={`capitalize ${STATUS_COLOURS[r.status]}`}>{r.status}</Badge>
        {r.decided_by_name && <p className="mt-1 text-xs text-muted-foreground">by {r.decided_by_name}</p>}
        {r.decision_note && <p className="max-w-64 text-xs text-muted-foreground">{r.decision_note}</p>}
      </div>
    ) },
    { key: 'actions', header: '', exportable: false, render: (r: CertificateRequest) => (
      <div className="flex flex-wrap justify-end gap-2">
        {r.status === 'pending' && r.can_approve && (
          <>
            <Button size="sm" disabled={Number(r.outstanding) > 0 && !isSuperadmin}
              title={Number(r.outstanding) > 0 && !isSuperadmin ? 'Fees outstanding: only the CEO can approve' : undefined}
              onClick={() => setDeciding({ request: r, approve: true })}>Approve</Button>
            <Button size="sm" variant="outline" onClick={() => setDeciding({ request: r, approve: false })}>Decline</Button>
          </>
        )}
        {r.status === 'pending' && r.mine && !r.can_approve && (
          <Button size="sm" variant="ghost" onClick={() => cancel(r.id).then(() => toast.success('Request withdrawn')).catch(e => toast.error(e.message))}>Withdraw</Button>
        )}
        {r.code && <Button asChild size="sm" variant="outline"><Link to={`/certificate/${r.code}`} target="_blank">View</Link></Button>}
      </div>
    ) },
  ], [isSuperadmin, cancel]);

  return (
    <div>
      <PageHeader title="Certificates"
        description="Tutors, the training manager and hub admins request certificates; the CEO or the training manager approves. Students must have cleared their fees." />
      <Tabs value={tab} onValueChange={v => setTab(v as RequestStatus | 'all')} className="mb-4">
        <TabsList>
          <TabsTrigger value="pending">Awaiting approval</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="declined">Declined</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>
      {loading
        ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
        : <DataTable columns={columns} data={data} searchable searchPlaceholder="Search students…"
            emptyMessage={tab === 'pending' ? 'No certificates waiting for approval' : 'Nothing here yet'} />}
      {deciding && (
        <DecisionDialog
          request={deciding.request}
          approve={deciding.approve}
          isCeo={isSuperadmin}
          onClose={() => setDeciding(null)}
          onApprove={approve}
          onDecline={decline}
        />
      )}
    </div>
  );
}

function DecisionDialog({ request, approve, isCeo, onClose, onApprove, onDecline }: {
  request: CertificateRequest;
  approve: boolean;
  isCeo: boolean;
  onClose: () => void;
  onApprove: (r: CertificateRequest, name: string, email: boolean, override: string) => Promise<{ sent_to: string } | null>;
  onDecline: (id: string, reason: string) => Promise<void>;
}) {
  const [name, setName] = useState(request.student_name);
  const [reason, setReason] = useState('');
  const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const owed = Number(request.outstanding) || 0;
  const valid = approve ? name.trim() && (owed === 0 || (isCeo && reason.trim())) : reason.trim();

  const submit = async () => {
    setBusy(true);
    try {
      if (approve) {
        const sent = await onApprove(request, name.trim(), email, reason.trim());
        toast.success(sent ? `Certificate issued and emailed to ${sent.sent_to}` : 'Certificate issued');
      } else {
        await onDecline(request.id, reason.trim());
        toast.success('Request declined');
      }
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{approve ? 'Approve and issue certificate' : 'Decline request'}</DialogTitle>
          <DialogDescription>
            {request.program_name} for {request.student_name}, requested by {request.requested_by_name || 'staff'}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {approve && (
            <div>
              <Label htmlFor="approve-name">Name on the certificate</Label>
              <Input id="approve-name" value={name} onChange={e => setName(e.target.value)} className="mt-1.5" />
            </div>
          )}
          {(!approve || owed > 0) && (
            <div>
              <Label htmlFor="decision-reason">
                {approve ? `Why issue with ${money(owed)} still outstanding?` : 'Reason (shown to the person who asked)'}
              </Label>
              <Textarea id="decision-reason" rows={2} value={reason} onChange={e => setReason(e.target.value)} className="mt-1.5"
                placeholder={approve ? 'e.g. Full scholarship' : 'e.g. Final project not yet submitted'} />
            </div>
          )}
          {approve && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={email} onCheckedChange={v => setEmail(Boolean(v))} />Email the student a link to it
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant={approve ? 'default' : 'destructive'} disabled={busy || !valid} onClick={submit}>
            {busy ? 'Saving…' : approve ? 'Approve and issue' : 'Decline'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
