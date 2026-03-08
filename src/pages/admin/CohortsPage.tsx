import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function CohortsPage() {
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ cohort_label: '', program_id: '', start_date: '', end_date: '' });

  const fetch = async () => {
    const { data } = await supabase.from('cohorts').select('*, programs(program_name)').order('created_at', { ascending: false });
    setCohorts(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetch();
    supabase.from('programs').select('id, program_name').eq('active', true).then(({ data }) => setPrograms(data || []));
  }, []);

  const handleCreate = async () => {
    if (!form.cohort_label.trim() || !form.program_id) { toast.error('Fill required fields'); return; }
    const { error } = await supabase.from('cohorts').insert({
      cohort_label: form.cohort_label,
      program_id: form.program_id,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Cohort created');
    setOpen(false);
    setForm({ cohort_label: '', program_id: '', start_date: '', end_date: '' });
    fetch();
  };

  const columns = [
    { key: 'cohort_label', header: 'Cohort' },
    { key: 'program', header: 'Program', render: (r: any) => r.programs?.program_name || '—' },
    { key: 'start_date', header: 'Start', render: (r: any) => r.start_date ? new Date(r.start_date).toLocaleDateString() : '—' },
    { key: 'end_date', header: 'End', render: (r: any) => r.end_date ? new Date(r.end_date).toLocaleDateString() : '—' },
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
                <Button onClick={handleCreate} className="w-full">Create Cohort</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div> : <DataTable columns={columns} data={cohorts} />}
    </div>
  );
}
