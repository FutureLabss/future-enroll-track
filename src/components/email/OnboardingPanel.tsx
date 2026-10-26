import { useMemo, useState } from 'react';
import { useOnboarding, type OnboardingJourney, type OnboardingStep, type StepDraft } from '@/hooks/useOnboarding';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FlaskConical, Mail, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_COLOURS: Record<string, string> = {
  active: 'bg-success/15 text-success border-success/30',
  stopped: 'bg-muted/50 text-muted-foreground/70 border-muted',
};

const TAGS = ['first_name', 'name', 'program', 'cohort', 'start_date', 'hub'];

function stepTiming(days: number) {
  if (days === 0) return 'Right after enrolling';
  return `Day ${days} · 09:00 WAT`;
}

const EMPTY_STEP: StepDraft = { delay_days: 0, subject: '', body: '', active: true, from_name: null, reply_to: null };
const EMAIL_RE = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;

export function OnboardingPanel() {
  const { data, loading, setEnabled, saveStep, removeStep, stopJourney, sendTest } = useOnboarding();
  const { enabled, steps, stepStats, journeys } = data;
  const [editing, setEditing] = useState<StepDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OnboardingStep | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const activeSteps = steps.filter(s => s.active).length;

  const journeyColumns = useMemo(() => [
    { key: 'full_name', header: 'Student', render: (r: OnboardingJourney) => (
      <div>
        <p className="font-medium">{r.full_name || '—'}</p>
        <p className="text-xs text-muted-foreground">{r.email}</p>
      </div>
    ) },
    { key: 'program_name', header: 'Programme', render: (r: OnboardingJourney) => r.program_name || '—' },
    { key: 'started_at', header: 'Joined', render: (r: OnboardingJourney) => new Date(r.started_at).toLocaleDateString('en-NG') },
    { key: 'sent', header: 'Emails sent', render: (r: OnboardingJourney) => `${r.sent} of ${activeSteps}` },
    { key: 'status', header: 'Status', render: (r: OnboardingJourney) => (
      <span className="flex items-center gap-2">
        <Badge variant="outline" className={`capitalize ${STATUS_COLOURS[r.status] || ''}`}>{r.status}</Badge>
        {r.stop_reason && <span className="text-xs text-muted-foreground">{r.stop_reason}</span>}
      </span>
    ) },
    { key: 'actions', header: '', exportable: false, render: (r: OnboardingJourney) => r.status === 'active' && (
      <Button size="sm" variant="ghost" onClick={() => stopJourney(r.id).then(() => toast.success('Stopped')).catch(e => toast.error(e.message))}>
        Stop
      </Button>
    ) },
  ], [activeSteps, stopJourney]);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-start justify-between gap-4 pt-6">
          <div>
            <p className="font-medium">Send onboarding emails to new students</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {enabled
                ? 'On. Everyone who enrolls for the first time gets the emails below, from the enroll form or a CRM conversion. Returning students and people who unsubscribed are left out.'
                : 'Off. Review the emails below, send yourself a test, then switch on. Only people who enroll after that receive them; existing students are never emailed.'}
            </p>
          </div>
          <Switch aria-label="Send onboarding emails" checked={enabled} disabled={busy === 'enabled' || (!enabled && activeSteps === 0)}
            onCheckedChange={v => run('enabled', async () => { await setEnabled(v); toast.success(v ? 'Onboarding is on' : 'Onboarding paused'); })} />
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold">Emails in the sequence</h2>
          <Button size="sm" onClick={() => setEditing({ ...EMPTY_STEP, delay_days: (steps.at(-1)?.delay_days ?? -1) + 1 })}>
            <Plus className="mr-1.5 h-4 w-4" />Add email
          </Button>
        </div>
        {steps.length === 0 && <p className="text-sm text-muted-foreground">No emails yet.</p>}
        {steps.map(s => {
          const st = stepStats[s.id];
          return (
            <Card key={s.id} className={s.active ? '' : 'opacity-60'}>
              <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{stepTiming(s.delay_days)}</p>
                  <p className="truncate font-medium">{s.subject}</p>
                  {s.from_name && <p className="text-xs text-muted-foreground">From {s.from_name}{s.reply_to ? ` · replies to ${s.reply_to}` : ''}</p>}
                  <p className="text-xs text-muted-foreground">
                    {st ? `${st.sent} sent${st.queued ? ` · ${st.queued} queued` : ''}${st.failed ? ` · ${st.failed} failed` : ''}${st.skipped ? ` · ${st.skipped} skipped` : ''}` : 'Not sent yet'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch aria-label={`Include “${s.subject}”`} checked={s.active}
                    onCheckedChange={v => run('toggle', async () => { await saveStep({ ...s, active: v }); })} />
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit “${s.subject}”`} onClick={() => setEditing(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Delete “${s.subject}”`} onClick={() => setConfirmDelete(s)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section>
        <h2 className="mb-1 font-heading text-lg font-semibold">New students in the sequence</h2>
        <p className="mb-3 text-sm text-muted-foreground">Stopping someone cancels the emails they haven't received yet.</p>
        <DataTable columns={journeyColumns} data={journeys} searchable searchPlaceholder="Search students…" emptyMessage="Nobody has started onboarding yet" />
      </section>

      {editing && (
        <StepDialog
          step={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={draft => run('save', async () => { await saveStep(draft); toast.success('Saved'); setEditing(null); })}
          onTest={step => run('test', async () => { const r = await sendTest(step); toast.success(`Test sent to ${r.sent_to}`); })}
        />
      )}

      <AlertDialog open={confirmDelete !== null} onOpenChange={o => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDelete?.subject}”?</AlertDialogTitle>
            <AlertDialogDescription>Nobody receives this email from now on. To pause it instead, switch it off.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && removeStep(confirmDelete.id).then(() => toast.success('Deleted')).catch(e => toast.error(e.message))}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StepDialog({ step, busy, onClose, onSave, onTest }: {
  step: StepDraft;
  busy: string | null;
  onClose: () => void;
  onSave: (draft: StepDraft) => void;
  onTest: (step: Pick<StepDraft, 'subject' | 'body' | 'from_name' | 'reply_to'>) => void;
}) {
  const [draft, setDraft] = useState<StepDraft>(step);
  const days = Number.isFinite(draft.delay_days) ? draft.delay_days : 0;
  const fromName = draft.from_name?.trim() || null;
  const replyTo = draft.reply_to?.trim() || null;
  const replyOk = !replyTo || EMAIL_RE.test(replyTo);
  const valid = draft.subject.trim() && draft.body.trim() && days >= 0 && days <= 365 && replyOk && !/[<>"]/.test(fromName ?? '');

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-4 w-4" />{step.id ? 'Edit email' : 'New email'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_1fr]">
            <div>
              <Label htmlFor="step-days">Days after joining</Label>
              <Input id="step-days" type="number" min={0} max={365} value={draft.delay_days} className="mt-1.5"
                onChange={e => setDraft({ ...draft, delay_days: parseInt(e.target.value, 10) })} />
            </div>
            <div>
              <Label htmlFor="step-subject">Subject</Label>
              <Input id="step-subject" value={draft.subject} className="mt-1.5" onChange={e => setDraft({ ...draft, subject: e.target.value })} />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{stepTiming(days)}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="step-from">From name <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="step-from" value={draft.from_name ?? ''} className="mt-1.5" placeholder="FutureLabs"
                onChange={e => setDraft({ ...draft, from_name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="step-reply">Replies go to <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="step-reply" type="email" value={draft.reply_to ?? ''} className="mt-1.5" placeholder="Hub contact email"
                onChange={e => setDraft({ ...draft, reply_to: e.target.value })} />
              {!replyOk && <p className="mt-1 text-xs text-destructive">Enter a valid email address</p>}
            </div>
          </div>
          <div>
            <Label htmlFor="step-body">Message</Label>
            <Textarea id="step-body" value={draft.body} rows={14} className="mt-1.5" onChange={e => setDraft({ ...draft, body: e.target.value })} />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Plain text; a blank line starts a new paragraph. Tags: {TAGS.map(t => <code key={t} className="mr-1">{`{{${t}}}`}</code>)}
              ({'{{cohort}}'} and {'{{start_date}}'} are blank until the student is placed in a cohort). An unsubscribe link is added automatically.
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" disabled={!draft.subject.trim() || busy !== null} onClick={() => onTest({ subject: draft.subject, body: draft.body, from_name: fromName, reply_to: replyTo })}>
            <FlaskConical className="mr-1.5 h-4 w-4" />{busy === 'test' ? 'Sending…' : 'Send test to me'}
          </Button>
          <Button disabled={!valid || busy !== null} onClick={() => onSave({ ...draft, delay_days: days, subject: draft.subject.trim(), from_name: fromName, reply_to: replyTo })}>
            {busy === 'save' ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
