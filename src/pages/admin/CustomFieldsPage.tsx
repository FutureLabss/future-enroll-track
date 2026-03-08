import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function CustomFieldsPage() {
  const [fields, setFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    label: '', key: '', field_type: 'text', required: false,
    visible_to_student: true, visible_to_organization: false, active: true, sort_order: 0,
  });

  const fetch = async () => {
    const { data } = await supabase.from('custom_fields').select('*').order('sort_order');
    setFields(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const handleCreate = async () => {
    if (!form.label.trim() || !form.key.trim()) { toast.error('Label and key required'); return; }
    const { error } = await supabase.from('custom_fields').insert(form);
    if (error) { toast.error(error.message); return; }
    toast.success('Field created');
    setOpen(false);
    setForm({ label: '', key: '', field_type: 'text', required: false, visible_to_student: true, visible_to_organization: false, active: true, sort_order: 0 });
    fetch();
  };

  const columns = [
    { key: 'label', header: 'Label' },
    { key: 'key', header: 'Key', render: (r: any) => <code className="text-xs bg-muted px-2 py-1 rounded">{r.key}</code> },
    { key: 'field_type', header: 'Type', render: (r: any) => <span className="capitalize">{r.field_type}</span> },
    { key: 'required', header: 'Required', render: (r: any) => r.required ? 'Yes' : 'No' },
    { key: 'visible_to_student', header: 'Student', render: (r: any) => r.visible_to_student ? '👁' : '—' },
    { key: 'visible_to_organization', header: 'Org', render: (r: any) => r.visible_to_organization ? '👁' : '—' },
    { key: 'active', header: 'Status', render: (r: any) => <StatusBadge status={r.active ? 'active' : 'cancelled'} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Custom Fields"
        description="Define dynamic data fields for enrollment forms"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Field</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Custom Field</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div><Label>Label *</Label><Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} className="mt-1.5" placeholder="e.g. Date of Birth" /></div>
                <div><Label>Key *</Label><Input value={form.key} onChange={e => setForm({ ...form, key: e.target.value.toLowerCase().replace(/\s+/g, '_') })} className="mt-1.5" placeholder="e.g. date_of_birth" /></div>
                <div>
                  <Label>Field Type</Label>
                  <Select value={form.field_type} onValueChange={v => setForm({ ...form, field_type: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="select">Select</SelectItem>
                      <SelectItem value="checkbox">Checkbox</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} className="mt-1.5" /></div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3"><Switch checked={form.required} onCheckedChange={v => setForm({ ...form, required: v })} /><Label>Required</Label></div>
                  <div className="flex items-center gap-3"><Switch checked={form.visible_to_student} onCheckedChange={v => setForm({ ...form, visible_to_student: v })} /><Label>Visible to Students</Label></div>
                  <div className="flex items-center gap-3"><Switch checked={form.visible_to_organization} onCheckedChange={v => setForm({ ...form, visible_to_organization: v })} /><Label>Visible to Organizations</Label></div>
                  <div className="flex items-center gap-3"><Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} /><Label>Active</Label></div>
                </div>
                <Button onClick={handleCreate} className="w-full">Create Field</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div> : <DataTable columns={columns} data={fields} />}
    </div>
  );
}
