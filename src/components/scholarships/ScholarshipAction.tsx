import { useState } from 'react';
import { useEnrollmentScholarship } from '@/hooks/useScholarships';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { GraduationCap } from 'lucide-react';
import { toast } from 'sonner';

const money = (n: number) => `₦${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

// Shows a student's scholarship, and lets the CEO or a training manager award or revoke one.
export function ScholarshipAction({ enrollmentId, studentName, outstanding }: { enrollmentId: string; studentName: string; outstanding: number }) {
  const { data, award, revoke } = useEnrollmentScholarship(enrollmentId);
  const [open, setOpen] = useState<'award' | 'revoke' | null>(null);
  const [amount, setAmount] = useState('');
  const [fundedBy, setFundedBy] = useState('FutureLabs');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const s = data.scholarship;

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try { await fn(); toast.success(done); setOpen(null); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  if (!s && !data.canAward) return null;

  return (
    <>
      {s ? (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30" title={s.reason}>
            <GraduationCap className="mr-1 h-3.5 w-3.5" />Scholarship {money(s.amount)}
          </Badge>
          {data.canAward && <Button size="sm" variant="ghost" onClick={() => { setReason(''); setOpen('revoke'); }}>Revoke</Button>}
        </div>
      ) : (
        <Button variant="outline" onClick={() => { setAmount(outstanding > 0 ? String(outstanding) : ''); setReason(''); setFundedBy('FutureLabs'); setOpen('award'); }}>
          <GraduationCap className="h-4 w-4 mr-2" /> Award scholarship
        </Button>
      )}

      <Dialog open={open === 'award'} onOpenChange={o => !o && setOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Award {studentName} a scholarship</DialogTitle>
            <DialogDescription>
              {outstanding > 0
                ? `It comes off the ${money(outstanding)} still owed, latest installment first. Nothing is recorded as paid, so revenue doesn't change.`
                : 'Nothing is owed, so this records the value of a free place.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="sch-amount">Amount (₦)</Label>
              <Input id="sch-amount" type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="sch-funded">Funded by</Label>
              <Input id="sch-funded" value={fundedBy} onChange={e => setFundedBy(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="sch-reason">Reason</Label>
              <Textarea id="sch-reason" rows={2} value={reason} onChange={e => setReason(e.target.value)} className="mt-1.5" placeholder="e.g. Staff member; merit award; hardship" />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={busy || !(Number(amount) > 0) || !reason.trim()}
              onClick={() => run(() => award(Number(amount), reason.trim(), fundedBy.trim()), 'Scholarship awarded')}>
              {busy ? 'Saving…' : 'Award scholarship'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === 'revoke'} onOpenChange={o => !o && setOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke this scholarship?</DialogTitle>
            <DialogDescription>
              {s && s.applied_amount > 0
                ? `${money(s.applied_amount)} goes back on ${studentName}'s balance, due in 7 days.`
                : 'No balance was waived, so nothing goes back on the student\'s account.'}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="sch-revoke">Reason</Label>
            <Textarea id="sch-revoke" rows={2} value={reason} onChange={e => setReason(e.target.value)} className="mt-1.5" />
          </div>
          <DialogFooter>
            <Button variant="destructive" disabled={busy || !reason.trim() || !s}
              onClick={() => run(() => revoke(s!.id, reason.trim()), 'Scholarship revoked')}>
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
