import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDropouts, type DropoutCase, type DropoutStatus } from '@/hooks/useDropouts';
import { whatsappLink } from '@/lib/risk';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { MessageCircle, Phone } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_COLOURS: Record<string, string> = {
  open: 'bg-warning/15 text-warning border-warning/30',
  rejoin_requested: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  moved: 'bg-success/15 text-success border-success/30',
  withdrawn: 'bg-muted text-muted-foreground border-muted',
  returned: 'bg-success/15 text-success border-success/30',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Waiting for reply',
  rejoin_requested: 'Wants to rejoin',
  moved: 'Moved to new cohort',
  withdrawn: 'Withdrew',
  returned: 'Came back',
};

const money = (n: number) => `₦${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-NG') : 'never';

export default function DropoutsPage() {
  const [tab, setTab] = useState<DropoutStatus | 'live' | 'all'>('live');
  const { data, loading, move, resolve } = useDropouts(tab);
  const [moving, setMoving] = useState<DropoutCase | null>(null);
  const [recording, setRecording] = useState<DropoutCase | null>(null);

  const columns = useMemo(() => [
    { key: 'student_name', header: 'Student', render: (r: DropoutCase) => (
      <div>
        <Link to={`/admin/enrollments/${r.enrollment_id}`} className="font-medium hover:underline">{r.student_name}</Link>
        <p className="text-xs text-muted-foreground">{r.program_name} · {r.cohort_label}</p>
        <p className="text-xs text-muted-foreground">Last attended {day(r.last_attended_at)}</p>
      </div>
    ) },
    { key: 'contact', header: 'Contact', exportable: false, render: (r: DropoutCase) => {
      const wa = whatsappLink(r.phone);
      const gwa = whatsappLink(r.guardian_phone);
      return (
        <div className="space-y-1 text-xs">
          <div className="flex gap-1">
            {wa && <Button asChild size="icon" variant="ghost" className="h-7 w-7" aria-label={`WhatsApp ${r.student_name}`}><a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a></Button>}
            {r.phone && <Button asChild size="icon" variant="ghost" className="h-7 w-7" aria-label={`Call ${r.student_name}`}><a href={`tel:${r.phone}`}><Phone className="h-4 w-4" /></a></Button>}
          </div>
          {r.guardian_phone && (
            <p className="text-muted-foreground">Guardian: {r.guardian_name || '—'} {gwa && <a href={gwa} target="_blank" rel="noreferrer" className="text-primary hover:underline">WhatsApp</a>}</p>
          )}
        </div>
      );
    } },
    { key: 'status', header: 'Status', render: (r: DropoutCase) => (
      <div className="max-w-64">
        <Badge variant="outline" className={STATUS_COLOURS[r.status]}>{STATUS_LABELS[r.status]}</Badge>
        {r.status === 'open' && <p className="mt-1 text-xs text-muted-foreground">{r.messages_sent ? `${r.messages_sent} message${r.messages_sent > 1 ? 's' : ''} sent, no reply yet` : 'Message going out this morning'}</p>}
        {r.choice_note && <p className="mt-1 text-xs italic text-muted-foreground">“{r.choice_note}”</p>}
        {r.resolution_note && r.status !== 'open' && <p className="mt-1 text-xs text-muted-foreground">{r.resolution_note}</p>}
      </div>
    ) },
    { key: 'outstanding', header: 'Balance', render: (r: DropoutCase) => Number(r.outstanding) > 0
      ? <span className="text-destructive">{money(r.outstanding)}</span> : <span className="text-muted-foreground">—</span> },
    { key: 'actions', header: '', exportable: false, render: (r: DropoutCase) => (r.status === 'open' || r.status === 'rejoin_requested') && (
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" onClick={() => setMoving(r)}>Move to cohort</Button>
        <Button size="sm" variant="outline" onClick={() => setRecording(r)}>Record outcome</Button>
      </div>
    ) },
  ], []);

  return (
    <div>
      <PageHeader title="Dropped off"
        description="Students with no attendance for three weeks while their class met. Each is asked to choose: rejoin the next cohort, or withdraw. A call from the tutor makes the difference." />
      <Tabs value={tab} onValueChange={v => setTab(v as DropoutStatus | 'live' | 'all')} className="mb-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="live">Needs action</TabsTrigger>
          <TabsTrigger value="moved">Moved</TabsTrigger>
          <TabsTrigger value="withdrawn">Withdrew</TabsTrigger>
          <TabsTrigger value="returned">Came back</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>
      {loading
        ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
        : <DataTable columns={columns} data={data} searchable searchPlaceholder="Search students…"
            emptyMessage={tab === 'live' ? 'Nobody has dropped off. Checked every morning.' : 'Nothing here yet'} />}
      {moving && <MoveDialog dropout={moving} onClose={() => setMoving(null)} onMove={move} />}
      {recording && <OutcomeDialog dropout={recording} onClose={() => setRecording(null)} onResolve={resolve} />}
    </div>
  );
}

function MoveDialog({ dropout, onClose, onMove }: {
  dropout: DropoutCase; onClose: () => void; onMove: (caseId: string, cohortId: string) => Promise<void>;
}) {
  const options = dropout.cohort_options ?? [];
  const [cohort, setCohort] = useState(dropout.next_cohort_id ?? options[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move {dropout.student_name}</DialogTitle>
          <DialogDescription>They leave {dropout.cohort_label} and join the cohort you pick, with access to its classroom. Their balance stays due.</DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">There's no other {dropout.program_name} cohort yet. Create the next one from Cohorts, then come back.</p>
        ) : (
          <div>
            <Label>Cohort</Label>
            <Select value={cohort} onValueChange={setCohort}>
              <SelectTrigger className="mt-1.5" aria-label="Cohort"><SelectValue placeholder="Pick a cohort" /></SelectTrigger>
              <SelectContent>
                {options.map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.label}{o.start_date ? ` (starts ${new Date(`${o.start_date}T00:00:00`).toLocaleDateString('en-NG')})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button disabled={!cohort || busy} onClick={async () => {
            setBusy(true);
            try { await onMove(dropout.id, cohort); toast.success('Moved'); onClose(); }
            catch (e) { toast.error((e as Error).message); }
            finally { setBusy(false); }
          }}>{busy ? 'Moving…' : 'Move'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OutcomeDialog({ dropout, onClose, onResolve }: {
  dropout: DropoutCase; onClose: () => void;
  onResolve: (caseId: string, status: 'rejoin_requested' | 'withdrawn' | 'returned', note: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<'rejoin_requested' | 'withdrawn' | 'returned'>('rejoin_requested');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record what {dropout.student_name} said</DialogTitle>
          <DialogDescription>For when they told you by phone or in person instead of using the link.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Outcome</Label>
            <Select value={status} onValueChange={v => setStatus(v as typeof status)}>
              <SelectTrigger className="mt-1.5" aria-label="Outcome"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rejoin_requested">Wants to rejoin the next cohort</SelectItem>
                <SelectItem value="withdrawn">Withdraws from the programme</SelectItem>
                <SelectItem value="returned">Is coming back to this cohort</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {status === 'withdrawn' && (
            <p className="text-xs text-muted-foreground">They leave the cohort and payment reminders stop. Their balance stays on the Outstanding page for the CEO to chase or write off.</p>
          )}
          <div>
            <Label htmlFor="outcome-note">Note</Label>
            <Textarea id="outcome-note" rows={2} value={note} onChange={e => setNote(e.target.value)} className="mt-1.5" placeholder="e.g. Called 28 Oct: lost his job, will rejoin in January" />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!note.trim() || busy} onClick={async () => {
            setBusy(true);
            try { await onResolve(dropout.id, status, note.trim()); toast.success('Saved'); onClose(); }
            catch (e) { toast.error((e as Error).message); }
            finally { setBusy(false); }
          }}>{busy ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
