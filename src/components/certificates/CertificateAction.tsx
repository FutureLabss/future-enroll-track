import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CertificateState } from '@/hooks/useCertificates';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Award, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  enrollmentId: string;
  studentName: string;
  programName?: string | null;
  state: CertificateState | undefined;
  onIssue: (enrollmentId: string, name: string, email: boolean) => Promise<{ sent_to: string } | null>;
  onRevoke: (certificateId: string, reason: string) => Promise<void>;
  onResend: (certificateId: string) => Promise<{ sent_to: string }>;
}

// Issue / view / resend / revoke one student's certificate. Shows nothing to
// people who can't issue unless a certificate already exists.
export function CertificateAction({ enrollmentId, studentName, programName, state, onIssue, onRevoke, onResend }: Props) {
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [name, setName] = useState(studentName);
  const [email, setEmail] = useState(true);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  if (!state) return null;

  if (!state.code) {
    if (!state.can_issue) return <span className="text-xs text-muted-foreground">—</span>;
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => { setName(studentName); setIssuing(true); }}>
          <Award className="mr-1.5 h-4 w-4" />Issue certificate
        </Button>
        <Dialog open={issuing} onOpenChange={setIssuing}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Issue certificate</DialogTitle>
              <DialogDescription>
                Confirms that this student completed {programName || 'the programme'}. It's issued in your name and anyone with the link can verify it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="cert-name">Name on the certificate</Label>
                <Input id="cert-name" value={name} onChange={e => setName(e.target.value)} className="mt-1.5" />
                <p className="mt-1 text-xs text-muted-foreground">Check the spelling: it can't be edited later without revoking and reissuing.</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={email} onCheckedChange={v => setEmail(Boolean(v))} />Email the student a link to it
              </label>
            </div>
            <DialogFooter>
              <Button disabled={busy || !name.trim()} onClick={() => run(async () => {
                const sent = await onIssue(enrollmentId, name.trim(), email);
                toast.success(sent ? `Certificate issued and emailed to ${sent.sent_to}` : 'Certificate issued');
                setIssuing(false);
              })}>
                {busy ? 'Issuing…' : 'Issue certificate'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-auto gap-1 px-2 py-1">
            <Badge variant="outline" className="bg-success/15 text-success border-success/30">
              <Award className="mr-1 h-3.5 w-3.5" />Issued {new Date(state.issued_at!).toLocaleDateString('en-NG')}
            </Badge>
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild><Link to={`/certificate/${state.code}`} target="_blank">View certificate</Link></DropdownMenuItem>
          {state.can_issue && (
            <>
              <DropdownMenuItem onClick={() => run(async () => { const r = await onResend(state.certificate_id!); toast.success(`Emailed to ${r.sent_to}`); })}>
                {state.emailed_at ? 'Email it again' : 'Email it to the student'}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => { setReason(''); setRevoking(true); }}>Revoke…</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={revoking} onOpenChange={setRevoking}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke this certificate?</DialogTitle>
            <DialogDescription>Its link will show it as revoked to anyone who checks it. You can issue a new one afterwards, for example to fix a name.</DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="revoke-reason">Reason</Label>
            <Textarea id="revoke-reason" rows={2} value={reason} onChange={e => setReason(e.target.value)} className="mt-1.5" placeholder="e.g. Name misspelt" />
          </div>
          <DialogFooter>
            <Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => run(async () => {
              await onRevoke(state.certificate_id!, reason.trim());
              toast.success('Certificate revoked');
              setRevoking(false);
            })}>
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
