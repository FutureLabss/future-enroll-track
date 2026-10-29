import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { useCertificates } from '@/hooks/useCertificates';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Award, ChevronDown, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  enrollmentId: string;
  studentName: string;
  programName?: string | null;
  certs: ReturnType<typeof useCertificates>;
}

const money = (n: number) => `₦${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

// One student's certificate: request it (tutor, training manager, hub admin), issue
// it (CEO or training manager), or view / resend / revoke an issued one. Fees must be
// cleared first; only the CEO can override, with a reason.
export function CertificateAction({ enrollmentId, studentName, programName, certs }: Props) {
  const state = certs.data.get(enrollmentId);
  const [open, setOpen] = useState<'issue' | 'request' | 'revoke' | null>(null);
  const [name, setName] = useState(studentName);
  const [note, setNote] = useState('');
  const [override, setOverride] = useState('');
  const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); setOpen(null); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  if (!state) return null;
  const owed = Number(state.outstanding) || 0;
  const start = (kind: 'issue' | 'request') => { setName(studentName); setNote(''); setOverride(''); setOpen(kind); };

  if (state.code) {
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
            {state.can_approve && (
              <>
                <DropdownMenuItem onClick={() => run(async () => { const r = await certs.sendEmail(state.certificate_id!); toast.success(`Emailed to ${r.sent_to}`); })}>
                  {state.emailed_at ? 'Email it again' : 'Email it to the student'}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => { setNote(''); setOpen('revoke'); }}>Revoke…</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={open === 'revoke'} onOpenChange={o => !o && setOpen(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Revoke this certificate?</DialogTitle>
              <DialogDescription>Its link will show it as revoked to anyone who checks it. You can issue a new one afterwards, for example to fix a name.</DialogDescription>
            </DialogHeader>
            <div>
              <Label htmlFor="revoke-reason">Reason</Label>
              <Textarea id="revoke-reason" rows={2} value={note} onChange={e => setNote(e.target.value)} className="mt-1.5" placeholder="e.g. Name misspelt" />
            </div>
            <DialogFooter>
              <Button variant="destructive" disabled={busy || !note.trim()}
                onClick={() => run(async () => { await certs.revoke(state.certificate_id!, note.trim()); toast.success('Certificate revoked'); })}>
                Revoke
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (state.request_id) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">
          <Clock className="mr-1 h-3.5 w-3.5" />Awaiting approval
        </Badge>
        <span className="text-xs text-muted-foreground">
          {state.can_approve
            ? <Link to="/admin/certificates" className="font-medium text-primary hover:underline">Review request</Link>
            : `Requested by ${state.requested_by_name || 'staff'}`}
        </span>
      </div>
    );
  }

  if (!state.can_request && !state.can_approve) return <span className="text-xs text-muted-foreground">—</span>;

  const blocked = owed > 0 && !state.is_ceo;
  const direct = state.can_approve;

  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <Button size="sm" variant="outline" disabled={blocked} onClick={() => start(direct ? 'issue' : 'request')}>
          <Award className="mr-1.5 h-4 w-4" />{direct ? 'Issue certificate' : 'Request certificate'}
        </Button>
        {owed > 0 && <span className="text-xs text-destructive">{money(owed)} outstanding</span>}
      </div>
      <Dialog open={open === 'issue' || open === 'request'} onOpenChange={o => !o && setOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{open === 'issue' ? 'Issue certificate' : 'Request certificate'}</DialogTitle>
            <DialogDescription>
              {open === 'issue'
                ? `Confirms that this student completed ${programName || 'the programme'}. Anyone with the link can verify it.`
                : 'The CEO or the training manager will be asked to approve it. Nothing is issued or sent to the student until then.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cert-name">Name on the certificate</Label>
              <Input id="cert-name" value={name} onChange={e => setName(e.target.value)} className="mt-1.5" />
              <p className="mt-1 text-xs text-muted-foreground">Check the spelling: it can't be changed later without revoking and reissuing.</p>
            </div>
            {open === 'request' && (
              <div>
                <Label htmlFor="cert-note">Note for the approver (optional)</Label>
                <Textarea id="cert-note" rows={2} value={note} onChange={e => setNote(e.target.value)} className="mt-1.5" placeholder="e.g. Completed all modules and the final project" />
              </div>
            )}
            {open === 'issue' && owed > 0 && (
              <div>
                <Label htmlFor="cert-override">Why issue with {money(owed)} still outstanding?</Label>
                <Textarea id="cert-override" rows={2} value={override} onChange={e => setOverride(e.target.value)} className="mt-1.5" placeholder="e.g. Full scholarship" />
              </div>
            )}
            {open === 'issue' && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={email} onCheckedChange={v => setEmail(Boolean(v))} />Email the student a link to it
              </label>
            )}
          </div>
          <DialogFooter>
            <Button disabled={busy || !name.trim() || (open === 'issue' && owed > 0 && !override.trim())}
              onClick={() => run(async () => {
                if (open === 'issue') {
                  const sent = await certs.issue(enrollmentId, name.trim(), email, override.trim());
                  toast.success(sent ? `Certificate issued and emailed to ${sent.sent_to}` : 'Certificate issued');
                } else {
                  await certs.request(enrollmentId, name.trim(), note.trim());
                  toast.success('Requested. The CEO and the training manager have been notified.');
                }
              })}>
              {busy ? 'Saving…' : open === 'issue' ? 'Issue certificate' : 'Send request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
