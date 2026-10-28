import { useEffect, useMemo, useState } from 'react';
import { useEmailDigest, type Digest } from '@/hooks/useEmailDigest';
import { useEmailEngagement } from '@/hooks/useEmailEngagement';
import { engagementSummary } from '@/lib/engagement';
import { useEmailContacts } from '@/hooks/useEmailContacts';
import { useStaffDirectory } from '@/hooks/useStaffDirectory';
import { formatDigestSlot, nextDigestSlot } from '@/lib/digest';
import { StaffPicker } from '@/components/email/StaffPicker';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CalendarClock, FlaskConical, Save, Send, Undo2, Users } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_COLOURS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border-muted',
  scheduled: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  sending: 'bg-warning/15 text-warning border-warning/30',
  sent: 'bg-success/15 text-success border-success/30',
  skipped: 'bg-muted/50 text-muted-foreground/70 border-muted',
  cancelled: 'bg-muted/50 text-muted-foreground/70 border-muted',
};

export function WeeklyDigestPanel() {
  const { data, loading, saveSettings, saveDraft, schedule, unschedule, sendNow, sendTest } = useEmailDigest();
  const { data: contactData } = useEmailContacts();
  const { data: staff } = useStaffDirectory();
  const { data: engagement } = useEmailEngagement();
  const { settings, digests, current, audience } = data;

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmSendNow, setConfirmSendNow] = useState(false);

  useEffect(() => {
    setSubject(current?.subject ?? '');
    setBody(current?.body ?? '');
  }, [current?.id, current?.subject, current?.body]);

  const dirty = subject !== (current?.subject ?? '') || body !== (current?.body ?? '');
  const slot = nextDigestSlot();
  const history = useMemo(() => digests.filter(d => d.id !== current?.id), [digests, current?.id]);

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

  const ensureSaved = async () => {
    if (!subject.trim()) throw new Error('Add a subject first');
    if (!body.trim()) throw new Error('Write the digest before scheduling it');
    return dirty || !current ? saveDraft(subject.trim(), body) : current.id;
  };

  const updateSettings = (patch: Parameters<typeof saveSettings>[0]) =>
    run('settings', async () => { await saveSettings(patch); });

  // An empty contact_lists means every list (including ones imported later).
  const toggleList = (name: string, on: boolean) => {
    const base = settings.contact_lists.length ? settings.contact_lists : contactData.lists.map(l => l.name);
    const next = on ? Array.from(new Set([...base, name])) : base.filter(n => n !== name);
    if (next.length === 0) updateSettings({ include_contacts: false, contact_lists: [] });
    else updateSettings({ include_contacts: true, contact_lists: next.length === contactData.lists.length ? [] : next });
  };

  const historyColumns = useMemo(() => [
    { key: 'subject', header: 'Subject', render: (r: Digest) => <span className="font-medium">{r.subject}</span> },
    { key: 'status', header: 'Status', render: (r: Digest) => <Badge variant="outline" className={`capitalize ${STATUS_COLOURS[r.status] || ''}`}>{r.status}</Badge> },
    { key: 'when', header: 'Sent / due', render: (r: Digest) => r.sent_at ? new Date(r.sent_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : r.scheduled_for ? formatDigestSlot(r.scheduled_for) : '—' },
    { key: 'recipients', header: 'Delivered', render: (r: Digest) => r.status === 'sent' || r.status === 'sending'
      ? <span>{r.sent_count || (r.status === 'sending' ? '…' : 0)} / {r.recipient_count}{r.failed_count ? <span className="text-destructive"> · {r.failed_count} failed</span> : null}</span>
      : '—' },
    { key: 'engagement', header: 'Opens & clicks', render: (r: Digest) => engagementSummary(engagement.digests[r.id]) ?? '—' },
  ], [engagement]);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const allLists = settings.contact_lists.length === 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
              <span>{current?.status === 'scheduled' ? 'Scheduled issue' : 'This week’s issue'}</span>
              {current?.status === 'scheduled' && current.scheduled_for && (
                <Badge variant="outline" className={STATUS_COLOURS.scheduled}>
                  <CalendarClock className="mr-1 h-3.5 w-3.5" />
                  {current.send_immediately ? 'Sending now' : formatDigestSlot(current.scheduled_for)}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Subject</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} className="mt-1.5" placeholder="e.g. This week at FutureLabs: new cohorts and a free workshop" />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea value={body} onChange={e => setBody(e.target.value)} rows={14} className="mt-1.5"
                placeholder={'Hi {{first_name}},\n\nHere’s what’s happening this week…'} />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Plain text. Leave a blank line between paragraphs; links are clickable. Use <code>{'{{first_name}}'}</code> or <code>{'{{name}}'}</code> to personalise. An unsubscribe link is added automatically.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!dirty || !subject.trim() || busy !== null}
                onClick={() => run('save', async () => { await saveDraft(subject.trim(), body); toast.success('Draft saved'); })}>
                <Save className="mr-1.5 h-4 w-4" />Save draft
              </Button>
              <Button variant="outline" disabled={!subject.trim() || busy !== null}
                onClick={() => run('test', async () => { const r = await sendTest(subject, body); toast.success(`Test sent to ${r.sent_to}`); })}>
                <FlaskConical className="mr-1.5 h-4 w-4" />{busy === 'test' ? 'Sending…' : 'Send test to me'}
              </Button>
              {current?.status === 'scheduled' ? (
                <Button variant="outline" disabled={busy !== null}
                  onClick={() => run('unschedule', async () => { await unschedule(current.id); toast.success('Moved back to draft'); })}>
                  <Undo2 className="mr-1.5 h-4 w-4" />Unschedule
                </Button>
              ) : (
                <Button disabled={busy !== null}
                  onClick={() => run('schedule', async () => { const id = await ensureSaved(); await schedule(id); toast.success(`Scheduled for ${formatDigestSlot(slot)}`); })}>
                  <CalendarClock className="mr-1.5 h-4 w-4" />Schedule for {formatDigestSlot(slot)}
                </Button>
              )}
              <Button variant="secondary" disabled={busy !== null || !audience?.total} onClick={() => setConfirmSendNow(true)}>
                <Send className="mr-1.5 h-4 w-4" />Send now
              </Button>
            </div>
            {current?.status === 'scheduled' && dirty && (
              <p className="text-xs text-warning">You have unsaved changes. Save the draft so the scheduled issue uses them.</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Schedule</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Send every Monday, 07:00 WAT</p>
                  <p className="text-xs text-muted-foreground">
                    {settings.enabled
                      ? 'A scheduled issue goes out automatically. Weeks with nothing scheduled are skipped.'
                      : 'Paused: scheduled issues wait. One still paused a day after its slot is skipped.'}
                  </p>
                </div>
                <Switch checked={settings.enabled} disabled={busy === 'settings'} onCheckedChange={v => updateSettings({ enabled: v })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2"><Users className="h-4 w-4" />Audience</span>
                {audience && <Badge variant="secondary">{audience.total.toLocaleString('en-NG')} people</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {audience && (
                <p className="text-xs text-muted-foreground">
                  {audience.contacts} imported · {audience.leads} leads · {audience.staff} staff
                  {audience.suppressed ? ` · ${audience.suppressed} unsubscribed (never emailed)` : ''}
                </p>
              )}

              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Label>Imported contacts</Label>
                    <p className="text-xs text-muted-foreground">Past students and other lists from the Contacts tab.</p>
                  </div>
                  <Switch checked={settings.include_contacts} onCheckedChange={v => updateSettings({ include_contacts: v, contact_lists: [] })} />
                </div>
                {settings.include_contacts && (contactData.lists.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No lists yet. Import past students on the Contacts tab.</p>
                ) : contactData.lists.map(l => (
                  <label key={l.name} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={allLists || settings.contact_lists.includes(l.name)} onCheckedChange={v => toggleList(l.name, Boolean(v))} />
                    <span className="flex-1">{l.name}</span>
                    <span className="text-xs text-muted-foreground">{l.count}</span>
                  </label>
                )))}
              </div>

              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label>CRM leads</Label>
                  <p className="text-xs text-muted-foreground">Every lead with an email, except those marked not interested or unsubscribed.</p>
                </div>
                <Switch checked={settings.include_leads} onCheckedChange={v => updateSettings({ include_leads: v })} />
              </div>

              <div className="space-y-2">
                <Label>Staff</Label>
                <StaffPicker staff={staff} value={settings.staff_ids} onChange={ids => updateSettings({ staff_ids: ids })} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold">Past issues</h2>
        <DataTable columns={historyColumns} data={history} emptyMessage="No digests sent yet" />
      </section>

      <AlertDialog open={confirmSendNow} onOpenChange={setConfirmSendNow}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this digest now?</AlertDialogTitle>
            <AlertDialogDescription>
              “{subject || 'Untitled'}” goes to {audience?.total.toLocaleString('en-NG') ?? 0} people right away, even if the weekly schedule is paused. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => run('send', async () => {
                const id = await ensureSaved();
                const r = await sendNow(id);
                toast.success(`Sending: ${r.sent} delivered so far${r.failed ? `, ${r.failed} failed` : ''}. The rest follow within minutes.`);
              })}
            >
              Send now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
