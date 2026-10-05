/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CalendarDays, ChevronDown, Eye, Mail, Megaphone, UsersRound } from 'lucide-react';

type CampaignRecipient = {
  id: string;
  campaign_id: string;
  status: string;
  next_send_at: string;
  stop_reason: string | null;
  crm_leads: { full_name: string; email: string | null } | null;
  marketing_email_deliveries: Array<{
    id: string;
    status: string;
    sent_at: string | null;
    delivered_at: string | null;
    opened_at: string | null;
    clicked_at: string | null;
    bounced_at: string | null;
    error_message: string | null;
    recipient_email: string | null;
    rendered_subject: string | null;
    rendered_html: string | null;
    created_at: string;
  }>;
};

const formatTimestamp = (value?: string | null) => value ? new Date(value).toLocaleString() : '—';

export default function CrmCampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [emailPreview, setEmailPreview] = useState<{ title: string; subject: string; html: string } | null>(null);
  const [form, setForm] = useState({ name: '', subject: '', html_body: '', qualification: 'all', delay_hours: '0' });

  const load = async () => {
    const [campaignResult, recipientResult] = await Promise.all([
      (supabase.from('marketing_campaigns' as any) as any).select('*,marketing_campaign_steps(id,step_order,delay_hours,marketing_email_templates(subject,html_body))').order('created_at', { ascending: false }),
      (supabase.from('marketing_campaign_enrollments' as any) as any)
        .select('id,campaign_id,status,next_send_at,stop_reason,crm_leads(full_name,email),marketing_email_deliveries(id,status,sent_at,delivered_at,opened_at,clicked_at,bounced_at,error_message,recipient_email,rendered_subject,rendered_html,created_at)')
        .order('created_at', { ascending: false }),
    ]);
    if (campaignResult.error) toast.error(campaignResult.error.message);
    if (recipientResult.error) toast.error(recipientResult.error.message);
    setCampaigns(campaignResult.data || []);
    setRecipients(recipientResult.data || []);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name || !form.subject || !form.html_body) return toast.error('Name, subject, and content are required');
    const template = await (supabase.from('marketing_email_templates' as any) as any).insert({ name: `${form.name} – step 1`, subject: form.subject, html_body: form.html_body }).select().single();
    if (template.error) return toast.error(template.error.message);
    const campaign = await (supabase.from('marketing_campaigns' as any) as any).insert({ name: form.name, entry_rules: form.qualification === 'all' ? {} : { qualification: [form.qualification] } }).select().single();
    if (campaign.error) return toast.error(campaign.error.message);
    const step = await (supabase.from('marketing_campaign_steps' as any) as any).insert({ campaign_id: campaign.data.id, template_id: template.data.id, step_order: 1, delay_hours: Number(form.delay_hours) });
    if (step.error) return toast.error(step.error.message);
    toast.success('Campaign draft created');
    setForm({ name: '', subject: '', html_body: '', qualification: 'all', delay_hours: '0' });
    load();
  };

  const status = async (campaign: any, next: string) => {
    const result = next === 'active'
      ? await (supabase.rpc as any)('activate_marketing_campaign', { p_campaign_id: campaign.id })
      : await (supabase.from('marketing_campaigns' as any) as any).update({ status: next }).eq('id', campaign.id);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(`Campaign ${next}`);
    load();
  };

  return <div>
    <PageHeader title="Campaigns" description="Consent-based automated email sequences" />
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
      <Card>
        <CardHeader><CardTitle>Create campaign</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Entry qualification</Label><Select value={form.qualification} onValueChange={qualification => setForm({ ...form, qualification })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['all','cold','warm','hot'].map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Send email after (hours)</Label><Input type="number" min="0" value={form.delay_hours} onChange={e => setForm({ ...form, delay_hours: e.target.value })} /></div>
          <div><Label>Subject</Label><Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Hello {{name}}" /></div>
          <div><Label>HTML content</Label><Textarea rows={8} value={form.html_body} onChange={e => setForm({ ...form, html_body: e.target.value })} /><p className="text-xs text-muted-foreground mt-1">Placeholders: name, source, owner, program, organization</p></div>
          <Button onClick={create}>Create draft</Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {campaigns.length === 0 ? <Card className="h-full min-h-72"><CardContent className="h-full flex flex-col items-center justify-center px-8 py-12 text-center"><div className="mb-4 rounded-full bg-primary/10 p-4"><Megaphone className="h-7 w-7 text-primary" /></div><h2 className="font-heading text-lg font-semibold">No campaigns yet</h2><p className="mt-2 max-w-sm text-sm text-muted-foreground">Create your first draft using the form. It will appear here, ready for review and activation.</p></CardContent></Card> : campaigns.map(c => {
          const campaignRecipients = recipients.filter(recipient => recipient.campaign_id === c.id);
          const isExpanded = expandedCampaign === c.id;
          const firstStep = [...(c.marketing_campaign_steps || [])].sort((a: any, b: any) => a.step_order - b.step_order)[0];
          const template = firstStep?.marketing_email_templates;
          const statusStyle = c.status === 'active'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : c.status === 'paused'
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : c.status === 'completed'
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-slate-200 bg-slate-50 text-slate-600';
          return <Card key={c.id} className="overflow-hidden border-border/70 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="p-0">
              <div className="space-y-5 p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 rounded-xl bg-primary/10 p-2.5 text-primary">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-heading text-lg font-semibold tracking-tight">{c.name}</h3>
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" />
                        <span>Created {formatTimestamp(c.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                    <Badge variant="outline" className={`capitalize ${statusStyle}`}>{c.status}</Badge>
                    {template && <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setEmailPreview({ title: `${c.name} · configured email`, subject: template.subject, html: template.html_body })}><Eye className="mr-1.5 h-4 w-4" />Preview</Button>}
                    {c.status !== 'active' && <Button size="sm" className="min-w-24 rounded-lg" onClick={() => status(c, 'active')}>Activate</Button>}
                    {c.status === 'active' && <Button size="sm" variant="outline" className="min-w-24 rounded-lg" onClick={() => status(c, 'paused')}>Pause</Button>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/60 bg-muted/30 px-3.5 py-3">
                    <div className="flex items-center gap-2 text-muted-foreground"><Megaphone className="h-4 w-4" /><span className="text-xs font-medium uppercase tracking-wide">Steps</span></div>
                    <p className="mt-1 text-xl font-semibold">{c.marketing_campaign_steps?.length || 0}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/30 px-3.5 py-3">
                    <div className="flex items-center gap-2 text-muted-foreground"><UsersRound className="h-4 w-4" /><span className="text-xs font-medium uppercase tracking-wide">Recipients</span></div>
                    <p className="mt-1 text-xl font-semibold">{campaignRecipients.length}</p>
                  </div>
                </div>
              </div>

              <button type="button" className="flex w-full items-center justify-between border-t bg-muted/20 px-5 py-3.5 text-left text-sm font-medium transition-colors hover:bg-muted/50 sm:px-6" onClick={() => setExpandedCampaign(isExpanded ? null : c.id)} aria-expanded={isExpanded}>
                <span>{isExpanded ? 'Hide delivery history' : 'View recipients and delivery history'}</span>
                <span className="ml-3 rounded-full border bg-background p-1"><ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} /></span>
              </button>

              {isExpanded && <div className="border-t bg-background p-4 sm:p-5">
                <div className="overflow-x-auto rounded-xl border border-border/70">
                  {campaignRecipients.length === 0 ? <div className="flex flex-col items-center px-4 py-10 text-center"><div className="mb-3 rounded-full bg-muted p-3"><UsersRound className="h-5 w-5 text-muted-foreground" /></div><p className="font-medium">No recipients yet</p><p className="mt-1 text-sm text-muted-foreground">Eligible leads will appear here when they enter this campaign.</p></div> : <table className="w-full text-sm">
                    <thead className="border-b bg-muted/40 text-left"><tr><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recipient</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th><th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Received at</th><th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</th></tr></thead>
                    <tbody>{campaignRecipients.map(recipient => {
                      const delivery = [...(recipient.marketing_email_deliveries || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
                      const deliveryStatus = delivery?.status || (recipient.status === 'active' ? 'scheduled' : recipient.status);
                      return <tr key={recipient.id} className="border-b transition-colors last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3.5"><p className="font-medium">{recipient.crm_leads?.full_name || 'Unknown lead'}</p><p className="mt-0.5 text-xs text-muted-foreground">{recipient.crm_leads?.email || 'No email'}</p></td>
                        <td className="px-4 py-3.5"><Badge variant="outline" className="capitalize">{deliveryStatus.replace('email.', '')}</Badge>{delivery?.error_message && <p className="mt-1 max-w-48 text-xs text-destructive">{delivery.error_message}</p>}{!delivery && recipient.status === 'active' && <p className="mt-1 text-xs text-muted-foreground">Scheduled {formatTimestamp(recipient.next_send_at)}</p>}</td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">{formatTimestamp(delivery?.delivered_at)}</td>
                        <td className="px-4 py-3.5 text-right">{delivery?.rendered_subject && delivery?.rendered_html ? <Button size="sm" variant="ghost" onClick={() => setEmailPreview({ title: `${recipient.crm_leads?.full_name || delivery.recipient_email || 'Recipient'} · sent email`, subject: delivery.rendered_subject!, html: delivery.rendered_html! })}><Eye className="mr-1.5 h-4 w-4" />View</Button> : <span className="text-xs text-muted-foreground">Not available</span>}</td>
                      </tr>;
                    })}</tbody>
                  </table>}
                </div>
              </div>}
            </CardContent>
          </Card>;
        })}
      </div>
    </div>

    <Dialog open={!!emailPreview} onOpenChange={open => !open && setEmailPreview(null)}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>{emailPreview?.title}</DialogTitle>
          <div className="pt-2 text-left"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Subject</span><p className="mt-1 text-sm font-medium text-foreground">{emailPreview?.subject}</p></div>
        </DialogHeader>
        <div className="bg-muted/30 p-4 sm:p-6">
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            {emailPreview && <iframe title="Email content preview" sandbox="" srcDoc={emailPreview.html} className="h-[55vh] w-full bg-white" />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}
