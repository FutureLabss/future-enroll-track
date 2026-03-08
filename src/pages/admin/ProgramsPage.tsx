import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ program_name: '', description: '', active: true });

  const fetch = async () => {
    const { data } = await supabase.from('programs').select('*').order('created_at', { ascending: false });
    setPrograms(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const handleCreate = async () => {
    if (!form.program_name.trim()) { toast.error('Name required'); return; }
    const { error } = await supabase.from('programs').insert(form);
    if (error) { toast.error(error.message); return; }
    toast.success('Program created');
    setOpen(false);
    setForm({ program_name: '', description: '', active: true });
    fetch();
  };

  const columns = [
    { key: 'program_name', header: 'Program Name' },
    { key: 'description', header: 'Description', render: (r: any) => <span className="text-muted-foreground truncate max-w-[200px] block">{r.description || '—'}</span> },
    { key: 'active', header: 'Status', render: (r: any) => <StatusBadge status={r.active ? 'active' : 'cancelled'} /> },
    { key: 'created_at', header: 'Created', render: (r: any) => new Date(r.created_at).toLocaleDateString() },
  ];

  return (
    <div>
      <PageHeader
        title="Programs"
        description="Manage training programs"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Program</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Program</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div><Label>Program Name *</Label><Input value={form.program_name} onChange={e => setForm({ ...form, program_name: e.target.value })} className="mt-1.5" /></div>
                <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-1.5" /></div>
                <div className="flex items-center gap-3"><Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} /><Label>Active</Label></div>
                <Button onClick={handleCreate} className="w-full">Create Program</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div> : <DataTable columns={columns} data={programs} />}
    </div>
  );
}
