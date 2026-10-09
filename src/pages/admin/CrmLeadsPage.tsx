/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createLead, seedCrmDefaults, useCrmLeads } from '@/hooks/useCrm';
import { supabase } from '@/lib/supabase';
import { parseLeadCsv } from '@/lib/crm';
import { toast } from 'sonner';
import { AlertCircle, CalendarClock, Download, Flame, Plus, UserCheck, Users } from 'lucide-react';

const qualificationStyles: Record<string, string> = { cold: 'bg-blue-500/10 text-blue-600 border-blue-500/20', warm: 'bg-amber-500/10 text-amber-600 border-amber-500/20', hot: 'bg-red-500/10 text-red-600 border-red-500/20' };
const statuses = ['new_lead', 'contacted', 'interested', 'follow_up', 'registered', 'not_interested'];

export default function CrmLeadsPage() {
  const navigate = useNavigate(); const [params, setParams] = useSearchParams();
  const { data, loading, error, refetch } = useCrmLeads();
  const [owners, setOwners] = useState<any[]>([]); const [selected, setSelected] = useState<string[]>([]); const [bulkOwner, setBulkOwner] = useState(''); const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', source: 'manual', qualification: 'automatic' as 'automatic' | 'cold' | 'warm' | 'hot', marketing_consent: false });
  const status = params.get('status') || 'all'; const qualification = params.get('qualification') || 'all'; const source = params.get('source') || 'all'; const consent = params.get('consent') || 'all'; const followUp = params.get('follow_up') || 'all'; const owner = params.get('owner') || 'all';
  const setFilter = (key: string, value: string) => { const next = new URLSearchParams(params); if (value === 'all') next.delete(key); else next.set(key, value); setParams(next, { replace: true }); };

  useEffect(() => { (supabase.rpc as any)('list_crm_owners').then(({ data }: any) => setOwners(data || [])); }, []);
  const ownerMap = useMemo(() => new Map(owners.map(x => [x.user_id, x.full_name || x.email])), [owners]);
  const sources = useMemo(() => [...new Set(data.map(x => x.lead_sources?.name).filter(Boolean))] as string[], [data]);
  const filtered = useMemo(() => data.filter(x => {
    const due = x.next_follow_up_at ? new Date(x.next_follow_up_at) : null;
    return (status === 'all' || x.lifecycle_status === status) && (qualification === 'all' || x.qualification === qualification)
      && (source === 'all' || x.lead_sources?.name === source) && (owner === 'all' || (owner === 'unassigned' ? !x.owner_id : x.owner_id === owner))
      && (consent === 'all' || (consent === 'yes' ? x.marketing_consent : !x.marketing_consent))
      && (followUp === 'all' || (followUp === 'overdue' ? !!due && due < new Date() : followUp === 'scheduled' ? !!due : !due));
  }), [data, status, qualification, source, owner, consent, followUp]);
  useEffect(() => { setSelected(current => current.filter(id => filtered.some(x => x.id === id))); }, [filtered]);

  const save = async () => { if (!form.full_name.trim() || (!form.email.trim() && !form.phone.trim())) return toast.error('Name and email or phone are required'); const { error } = await createLead(form); if (error) return toast.error(error.message); toast.success('Lead saved'); setOpen(false); setForm({ full_name: '', email: '', phone: '', source: 'manual', qualification: 'automatic', marketing_consent: false }); refetch(); };
  const importCsv = async (file?: File) => {
    if (!file) return;

    const rows = parseLeadCsv(await file.text());
    if (!rows.length) return toast.error('No valid leads found in the CSV');

    const { error: seedError } = await seedCrmDefaults();
    if (seedError) return toast.error(`Unable to prepare lead sources: ${seedError.message}`);

    const { data: sourceRows, error: sourceError } = await (supabase.from('lead_sources' as any) as any)
      .select('name,slug')
      .eq('active', true);
    if (sourceError) return toast.error(`Unable to load lead sources: ${sourceError.message}`);

    const sourceSlugs = new Map<string, string>();
    for (const sourceRow of sourceRows || []) {
      sourceSlugs.set(sourceRow.slug.trim().toLowerCase(), sourceRow.slug);
      sourceSlugs.set(sourceRow.name.trim().toLowerCase(), sourceRow.slug);
    }

    const unknownSources = new Set<string>();
    const validRows = rows.flatMap(row => {
      const source = row.source.trim().toLowerCase();
      const slug = sourceSlugs.get(source);
      if (!slug) {
        unknownSources.add(row.source);
        return [];
      }
      return [{ ...row, source: slug }];
    });

    let imported = 0;
    for (const row of validRows) {
      const result = await createLead(row);
      if (!result.error) imported++;
    }

    if (unknownSources.size) {
      toast.warning(`Imported ${imported} leads. Skipped ${rows.length - validRows.length} with unknown sources: ${[...unknownSources].join(', ')}`);
    } else if (imported < validRows.length) {
      toast.error(`Imported ${imported} of ${validRows.length} leads`);
    } else {
      toast.success(`Imported ${imported} leads`);
    }
    refetch();
  };
  const downloadTemplate = () => { const blob = new Blob(['full_name,email,phone,source,marketing_consent\nAda Example,ada@example.com,+2348000000000,referral,yes\n'], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'lead-import-template.csv'; a.click(); URL.revokeObjectURL(url); };
  const bulkUpdate = async (patch: Record<string, unknown>, message: string) => { if (!selected.length) return; const { error } = await (supabase.from('crm_leads' as any) as any).update({ ...patch, updated_at: new Date().toISOString() }).in('id', selected); if (error) return toast.error(error.message); toast.success(message); setSelected([]); refetch(); };

  const columns = [
    { key: 'select', header: '', exportable: false, render: (r: any) => <Checkbox checked={selected.includes(r.id)} onCheckedChange={checked => setSelected(current => checked ? [...current, r.id] : current.filter(id => id !== r.id))} onClick={e => e.stopPropagation()} /> },
    { key: 'full_name', header: 'Lead', render: (r: any) => <div><p className="font-medium">{r.full_name}</p><p className="text-xs text-muted-foreground">{r.phone || 'No phone'}</p></div> },
    { key: 'email', header: 'Email' }, { key: 'source', header: 'Source', render: (r: any) => r.lead_sources?.name || '—' },
    { key: 'qualification', header: 'Qualification', render: (r: any) => <Badge variant="outline" className={`capitalize ${qualificationStyles[r.qualification]}`}>{r.qualification} · {r.score}</Badge> },
    { key: 'lifecycle_status', header: 'Status', render: (r: any) => <span className="capitalize">{r.lifecycle_status.replace('_', ' ')}</span> },
    { key: 'owner', header: 'Owner', render: (r: any) => ownerMap.get(r.owner_id) || 'Unassigned', exportValue: (r: any) => ownerMap.get(r.owner_id) || 'Unassigned' },
    { key: 'next_follow_up_at', header: 'Next follow-up', render: (r: any) => r.next_follow_up_at ? <span className={new Date(r.next_follow_up_at) < new Date() ? 'font-medium text-destructive' : ''}>{new Date(r.next_follow_up_at).toLocaleDateString()}</span> : '—' },
    { key: 'marketing_consent', header: 'Consent', render: (r: any) => r.marketing_consent ? <Badge variant="outline" className="text-success">Opted in</Badge> : <span className="text-muted-foreground">Not opted in</span> },
  ];
  const registered = data.filter(x => x.lifecycle_status === 'registered').length; const overdue = data.filter(x => x.next_follow_up_at && new Date(x.next_follow_up_at) < new Date() && x.lifecycle_status !== 'registered').length;

  return <div><PageHeader title="Leads" description="Qualify, segment, and convert prospective students" actions={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={downloadTemplate}><Download className="h-4 w-4 mr-2" />CSV template</Button><Label className="cursor-pointer"><Input type="file" accept=".csv" className="hidden" onChange={e => importCsv(e.target.files?.[0])} /><span className="inline-flex h-10 items-center rounded-md border px-4 text-sm">Import CSV</span></Label><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add lead</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Add lead</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Name</Label><Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div><div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div><div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div><div><Label>Source</Label><Select value={form.source} onValueChange={value => setForm({ ...form, source: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['manual','website','facebook','whatsapp','referral'].map(value => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}</SelectContent></Select></div><div><Label>Qualification</Label><Select value={form.qualification} onValueChange={qualification => setForm({ ...form, qualification: qualification as typeof form.qualification })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="automatic">Automatic (score-based)</SelectItem><SelectItem value="cold">Cold</SelectItem><SelectItem value="warm">Warm</SelectItem><SelectItem value="hot">Hot</SelectItem></SelectContent></Select><p className="mt-1 text-xs text-muted-foreground">Automatic uses the lead scoring rules. Choosing a level creates a manual override.</p></div><Label className="flex items-center gap-2"><Checkbox checked={form.marketing_consent} onCheckedChange={value => setForm({ ...form, marketing_consent: value === true })} />Recorded marketing opt-in</Label><Button onClick={save} className="w-full">Save lead</Button></div></DialogContent></Dialog></div>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 mb-6"><StatCard title="Total Leads" value={data.length} icon={Users} /><StatCard title="New Leads" value={data.filter(x => x.lifecycle_status === 'new_lead').length} icon={Plus} /><StatCard title="Hot Leads" value={data.filter(x => x.qualification === 'hot').length} icon={Flame} /><StatCard title="Conversions" value={registered} icon={UserCheck} /><StatCard title="Overdue Follow-ups" value={overdue} icon={CalendarClock} /></div>
    <div className="flex flex-wrap gap-3 mb-5"><Select value={status} onValueChange={v => setFilter('status', v)}><SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{statuses.map(x => <SelectItem key={x} value={x}>{x.replace('_',' ')}</SelectItem>)}</SelectContent></Select><Select value={qualification} onValueChange={v => setFilter('qualification', v)}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All qualifications</SelectItem>{['cold','warm','hot'].map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select><Select value={source} onValueChange={v => setFilter('source', v)}><SelectTrigger className="w-40"><SelectValue placeholder="All sources" /></SelectTrigger><SelectContent><SelectItem value="all">All sources</SelectItem>{sources.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select><Select value={owner} onValueChange={v => setFilter('owner', v)}><SelectTrigger className="w-44"><SelectValue placeholder="All owners" /></SelectTrigger><SelectContent><SelectItem value="all">All owners</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem>{owners.map(x => <SelectItem key={x.user_id} value={x.user_id}>{x.full_name || x.email}</SelectItem>)}</SelectContent></Select><Select value={consent} onValueChange={v => setFilter('consent', v)}><SelectTrigger className="w-40"><SelectValue placeholder="Any consent" /></SelectTrigger><SelectContent><SelectItem value="all">Any consent</SelectItem><SelectItem value="yes">Opted in</SelectItem><SelectItem value="no">Not opted in</SelectItem></SelectContent></Select><Select value={followUp} onValueChange={v => setFilter('follow_up', v)}><SelectTrigger className="w-44"><SelectValue placeholder="Any follow-up" /></SelectTrigger><SelectContent><SelectItem value="all">Any follow-up</SelectItem><SelectItem value="overdue">Overdue</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="none">Not scheduled</SelectItem></SelectContent></Select></div>
    {selected.length > 0 && <Card className="mb-4 border-primary/30"><CardContent className="py-3 flex flex-wrap items-center gap-3"><p className="text-sm font-medium">{selected.length} selected</p><Button size="sm" variant="outline" onClick={() => bulkUpdate({ lifecycle_status: 'contacted' }, 'Leads marked contacted')}>Mark contacted</Button><Select value={bulkOwner} onValueChange={setBulkOwner}><SelectTrigger className="h-9 w-44"><SelectValue placeholder="Choose owner" /></SelectTrigger><SelectContent>{owners.map(x => <SelectItem key={x.user_id} value={x.user_id}>{x.full_name || x.email}</SelectItem>)}</SelectContent></Select><Button size="sm" variant="outline" onClick={() => bulkUpdate({ owner_id: bulkOwner }, 'Leads assigned')} disabled={!bulkOwner}>Assign owner</Button><Button size="sm" variant="outline" onClick={() => setSelected([])}>Clear</Button></CardContent></Card>}
    {error ? <Card className="border-destructive/30"><CardContent className="py-10 text-center"><AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" /><p className="font-medium">Unable to load leads</p><p className="text-sm text-muted-foreground mt-1">{error}</p><Button variant="outline" className="mt-4" onClick={refetch}>Try again</Button></CardContent></Card> : loading ? <Card><CardContent className="py-16 text-center text-muted-foreground">Loading leads…</CardContent></Card> : data.length === 0 ? <Card><CardContent className="py-16 text-center"><Users className="h-10 w-10 text-primary mx-auto mb-4" /><h2 className="font-heading text-lg font-semibold">Add your first lead</h2><p className="text-sm text-muted-foreground mt-2 mb-5">Create a lead manually or import your existing contact list with the CSV template.</p><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Add lead</Button></CardContent></Card> : <DataTable columns={columns} data={filtered} searchable exportable exportFilename="crm-leads" emptyMessage="No leads match the selected filters" onRowClick={r => navigate(`/admin/crm/leads/${r.id}`)} />}
  </div>;
}
