import { useState } from 'react';
import { usePaymentFollowupHistory, type FollowupInput, type FollowupKind, type FollowupState } from '@/hooks/usePaymentFollowups';
import { FOLLOWUP_LABELS, followupSummary } from '@/lib/followups';
import { whatsappLink } from '@/lib/risk';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { toast } from 'sonner';

export interface FollowupTarget {
  enrollment_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  outstanding: number;
  days_overdue: number;
  guardian_name?: string | null;
  guardian_phone?: string | null;
}

const money = (n: number) => `₦${Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const lagosToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

export function PaymentFollowupDialog({ target, state, onClose, onLog }: {
  target: FollowupTarget;
  state: FollowupState | undefined;
  onClose: () => void;
  onLog: (input: FollowupInput) => Promise<void>;
}) {
  const { data: history, loading } = usePaymentFollowupHistory(target.enrollment_id);
  const [kind, setKind] = useState<FollowupKind>('called');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const wa = whatsappLink(target.phone);
  const guardianWa = whatsappLink(target.guardian_phone);
  const summary = followupSummary(state);

  const valid = kind !== 'promise' || (date && date >= lagosToday() && (!amount || Number(amount) > 0));
  const kinds: FollowupKind[] = state?.written_off
    ? ['reopened', 'note']
    : ['called', 'whatsapp', 'note', 'promise', 'written_off'];

  const save = async () => {
    setSaving(true);
    try {
      await onLog({
        kind,
        note,
        promised_amount: kind === 'promise' && amount ? Number(amount) : null,
        promised_date: kind === 'promise' ? date : null,
      });
      toast.success(kind === 'promise' ? 'Promise saved. Overdue reminders pause until that date.' : 'Saved');
      setNote(''); setAmount(''); setDate('');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{target.full_name}</DialogTitle>
          <DialogDescription>
            {money(target.outstanding)} outstanding{target.days_overdue > 0 ? ` · ${target.days_overdue} days overdue` : ''}{summary ? ` · ${summary}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {wa && <Button asChild size="sm" variant="outline"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="mr-1.5 h-4 w-4" />WhatsApp</a></Button>}
          {target.phone && <Button asChild size="sm" variant="outline"><a href={`tel:${target.phone}`}><Phone className="mr-1.5 h-4 w-4" />Call</a></Button>}
          {target.email && <Button asChild size="sm" variant="outline"><a href={`mailto:${target.email}`}><Mail className="mr-1.5 h-4 w-4" />Email</a></Button>}
        </div>
        {target.guardian_phone && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Guardian: {target.guardian_name || 'no name given'}</span>
            {guardianWa && <Button asChild size="sm" variant="outline"><a href={guardianWa} target="_blank" rel="noreferrer"><MessageCircle className="mr-1.5 h-4 w-4" />WhatsApp guardian</a></Button>}
            <Button asChild size="sm" variant="outline"><a href={`tel:${target.guardian_phone}`}><Phone className="mr-1.5 h-4 w-4" />Call guardian</a></Button>
          </div>
        )}

        <div className="space-y-3 rounded-lg border border-border p-3">
          <div>
            <Label>What happened</Label>
            <Select value={kind} onValueChange={v => setKind(v as FollowupKind)}>
              <SelectTrigger className="mt-1.5" aria-label="What happened"><SelectValue /></SelectTrigger>
              <SelectContent>
                {kinds.map(k => <SelectItem key={k} value={k}>{FOLLOWUP_LABELS[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {kind === 'promise' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="promise-date">Will pay by</Label>
                <Input id="promise-date" type="date" min={lagosToday()} value={date} onChange={e => setDate(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="promise-amount">Amount (₦, optional)</Label>
                <Input id="promise-amount" type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} className="mt-1.5" />
              </div>
            </div>
          )}
          {kind === 'written_off' && (
            <p className="text-xs text-muted-foreground">Stops chasing this balance and its overdue emails. Invoices and revenue figures don't change; you can reopen it later.</p>
          )}
          <div>
            <Label htmlFor="followup-note">Note</Label>
            <Textarea id="followup-note" rows={2} value={note} onChange={e => setNote(e.target.value)} className="mt-1.5"
              placeholder={kind === 'called' ? 'e.g. No answer / said salary comes on the 30th' : ''} />
          </div>
          <Button className="w-full" disabled={!valid || saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">History</p>
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p>
            : history.length === 0 ? <p className="text-sm text-muted-foreground">No follow-up yet.</p>
            : (
              <ul className="max-h-56 space-y-2 overflow-y-auto">
                {history.map(h => (
                  <li key={h.id} className="text-sm">
                    <span className="font-medium">{FOLLOWUP_LABELS[h.kind]}</span>
                    {h.kind === 'promise' && h.promised_date && (
                      <span> · {h.promised_amount ? `${money(h.promised_amount)} ` : ''}by {new Date(`${h.promised_date}T00:00:00`).toLocaleDateString('en-NG')}</span>
                    )}
                    <span className="text-muted-foreground"> · {new Date(h.created_at).toLocaleDateString('en-NG')}{h.by_name ? ` · ${h.by_name}` : ''}</span>
                    {h.note && <p className="text-muted-foreground">{h.note}</p>}
                  </li>
                ))}
              </ul>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
