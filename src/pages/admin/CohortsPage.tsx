import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_COLOURS: Record<string, string> = {
  upcoming: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  active: 'bg-success/15 text-success border-success/30',
  completed: 'bg-muted text-muted-foreground border-muted',
  archived: 'bg-muted/50 text-muted-foreground/60 border-muted',
};

function derivedStatus(cohort: any): string | null {
  if (cohort.status) return cohort.status;
  const now = new Date();
  if (cohort.start_date && new Date(cohort.start_date) > now) return 'upcoming';
  if (cohort.end_date && new Date(cohort.end_date) < now) return 'completed';
  if (cohort.start_date) return 'active';
  return null;
}

export default function CohortsPage() {
  const navigate = useNavigate();
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ cohort_label: '', program_id: '', start_date: '', end_date: '', scope_type: '' });

  const fetchCohorts = async () => {
    const { data } = await supabase
      .from('cohorts')
      .select('*, programs(program_name), cohort_students(count)')
      .order('created_at', { ascending: false });
    setCohorts(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchCohorts();
    supabase.from('programs').select('id, program_name').eq('active', true).then(({ data }) => setPrograms(data || []));
  }, []);

  const handleCreate = async () => {
    if (!form.cohort_label.trim() || !form.program_id) { toast.error('Fill required fields'); return; }
    const { error } = await supabase.from('cohorts').insert({
      cohort_label: form.cohort_label,
      program_id: form.program_id,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      scope_type: form.scope_type || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Cohort created');
    setOpen(false);
    setForm({ cohort_label: '', program_id: '', start_date: '', end_date: '', scope_type: '' });
    fetchCohorts();
  };

  const columns = [
    {
      key: 'cohort_label', header: 'Cohort',
      render: (r: any) => <span className="font-medium">{r.cohort_label}</span>,
    },
    { key: 'program', header: 'Program', render: (r: any) => r.programs?.program_name || '—' },
    {
      key: 'status', header: 'Status',
      render: (r: any) => {
        const s = derivedStatus(r);
        return s
          ? <Badge variant="outline" className={`capitalize ${STATUS_COLOURS[s] || ''}`}>{s}</Badge>
          : <span className="text-muted-foreground text-xs">—</span>;
      },
    },
    {
      key: 'students', header: 'Students',
      render: (r: any) => {
        const count = r.cohort_students?.[0]?.count ?? 0;
        return <span className="text-sm">{count}</span>;
      },
    },
    {
      key: 'scope_type', header: 'Scope',
      render: (r: any) => r.scope_type
        ? <span className="capitalize text-primary/80 text-sm">{r.scope_type}</span>
        : <span className="text-muted-foreground text-xs">—</span>,
    },
    { key: 'start_date', header: 'Start', render: (r: any) => r.start_date ? new Date(r.start_date).toLocaleDateString() : '—' },
    { key: 'end_date', header: 'End', render: (r: any) => r.end_date ? new Date(r.end_date).toLocaleDateString() : '—' },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => navigate(`/admin/cohorts/${r.id}`)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Cohorts"
        description="Manage cohorts and intakes"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Cohort</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Cohort</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div><Label>Cohort Label *</Label><Input value={form.cohort_label} onChange={e => setForm({ ...form, cohort_label: e.target.value })} className="mt-1.5" placeholder="e.g. March 2026" /></div>
                <div>
                  <Label>Program *</Label>
                  <Select value={form.program_id} onValueChange={v => setForm({ ...form, program_id: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select program" /></SelectTrigger>
                    <SelectContent>{programs.map(p => <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="mt-1.5" /></div>
                  <div><Label>End Date</Label><Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="mt-1.5" /></div>
                </div>
                <div>
                  <Label>Scope Type</Label>
                  <Select value={form.scope_type} onValueChange={v => setForm({ ...form, scope_type: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Entire classroom (no scope)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="curriculum">Curriculum</SelectItem>
                      <SelectItem value="track">Track</SelectItem>
                      <SelectItem value="module">Module</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreate} className="w-full">Create Cohort</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      {loading
        ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
        : <DataTable columns={columns} data={cohorts} searchable searchPlaceholder="Search cohorts..." />
      }
    </div>
  );
}
