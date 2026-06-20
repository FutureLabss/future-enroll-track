import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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
import { Eye, Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';

const BLANK = { program_name: '', description: '', active: true };

export default function ProgramsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editProgram, setEditProgram] = useState<any>(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const { data: programs = [], isLoading: loading } = useQuery({
    queryKey: ['programs'],
    queryFn: async () => {
      const { data } = await supabase.from('programs').select('*').order('created_at', { ascending: false });
      return data || [];
    },
  });

  const load = () => queryClient.invalidateQueries({ queryKey: ['programs'] });

  const openEdit = (program: any) => {
    setEditProgram(program);
    setForm({ program_name: program.program_name, description: program.description || '', active: program.active });
  };

  const handleCreate = async () => {
    if (!form.program_name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    // hub_id is set automatically by the DB trigger (programs_set_hub_id)
    const { error } = await supabase.from('programs').insert({
      program_name: form.program_name.trim(),
      description: form.description.trim() || null,
      active: form.active,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Program created');
    setCreateOpen(false);
    setForm(BLANK);
    load();
  };

  const handleEdit = async () => {
    if (!form.program_name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    const { error } = await supabase
      .from('programs')
      .update({
        program_name: form.program_name.trim(),
        description: form.description.trim() || null,
        active: form.active,
      })
      .eq('id', editProgram.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Program updated');
    setEditProgram(null);
    setForm(BLANK);
    load();
  };

  const columns = [
    { key: 'program_name', header: 'Program Name' },
    {
      key: 'description', header: 'Description',
      render: (r: any) => <span className="text-muted-foreground truncate max-w-[200px] block">{r.description || '—'}</span>,
    },
    {
      key: 'active', header: 'Status',
      render: (r: any) => <StatusBadge status={r.active ? 'active' : 'cancelled'} />,
    },
    {
      key: 'created_at', header: 'Created',
      render: (r: any) => new Date(r.created_at).toLocaleDateString(),
    },
    {
      key: 'actions', header: '',
      render: (r: any) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/admin/programs/${r.id}`);
            }}
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" /> View
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              openEdit(r);
            }}
          >
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
          </Button>
        </div>
      ),
    },
  ];

  const ProgramForm = ({ onSave, label }: { onSave: () => void; label: string }) => (
    <div className="space-y-4 mt-4">
      <div>
        <Label>Program Name *</Label>
        <Input value={form.program_name} onChange={e => setForm({ ...form, program_name: e.target.value })} className="mt-1.5" />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-1.5" rows={3} />
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} />
        <Label>Active</Label>
      </div>
      <Button onClick={onSave} disabled={saving} className="w-full">{label}</Button>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Programs"
        description="Manage training programs"
        actions={
          <Dialog open={createOpen} onOpenChange={v => { setCreateOpen(v); if (!v) setForm(BLANK); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New Program</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Program</DialogTitle></DialogHeader>
              <ProgramForm onSave={handleCreate} label={saving ? 'Creating…' : 'Create Program'} />
            </DialogContent>
          </Dialog>
        }
      />

      {/* Edit dialog */}
      <Dialog open={!!editProgram} onOpenChange={v => { if (!v) { setEditProgram(null); setForm(BLANK); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Program</DialogTitle></DialogHeader>
          <ProgramForm onSave={handleEdit} label={saving ? 'Saving…' : 'Save Changes'} />
        </DialogContent>
      </Dialog>

      {loading
        ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
        : (
          <DataTable
            columns={columns}
            data={programs}
            searchable
            searchPlaceholder="Search programs..."
            onRowClick={(row) => navigate(`/admin/programs/${row.id}`)}
          />
        )
      }
    </div>
  );
}
