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

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ organization_name: '', organization_type: 'sponsor', contact_name: '', contact_email: '', active: true });

  const fetch = async () => {
    const { data } = await supabase.from('organizations').select('*').order('created_at', { ascending: false });
    setOrgs(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const handleCreate = async () => {
    if (!form.organization_name.trim()) { toast.error('Name required'); return; }
    const { error } = await supabase.from('organizations').insert(form);
    if (error) { toast.error(error.message); return; }
    toast.success('Organization created');
    setOpen(false);
    setForm({ organization_name: '', organization_type: 'sponsor', contact_name: '', contact_email: '', active: true });
    fetch();
  };

  const columns = [
    { key: 'organization_name', header: 'Organization' },
    { key: 'organization_type', header: 'Type', render: (r: any) => <span className="capitalize">{r.organization_type}</span> },
    { key: 'contact_name', header: 'Contact', render: (r: any) => r.contact_name || '—' },
    { key: 'contact_email', header: 'Email', render: (r: any) => r.contact_email || '—' },
    { key: 'active', header: 'Status', render: (r: any) => <StatusBadge status={r.active ? 'active' : 'cancelled'} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Organizations"
        description="Manage sponsors and partner organizations"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Organization</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Organization</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div><Label>Name *</Label><Input value={form.organization_name} onChange={e => setForm({ ...form, organization_name: e.target.value })} className="mt-1.5" /></div>
                <div>
                  <Label>Type</Label>
                  <Select value={form.organization_type} onValueChange={v => setForm({ ...form, organization_type: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sponsor">Sponsor</SelectItem>
                      <SelectItem value="partner">Partner</SelectItem>
                      <SelectItem value="corporate">Corporate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Contact Name</Label><Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} className="mt-1.5" /></div>
                <div><Label>Contact Email</Label><Input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} className="mt-1.5" /></div>
                <div className="flex items-center gap-3"><Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} /><Label>Active</Label></div>
                <Button onClick={handleCreate} className="w-full">Create Organization</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div> : <DataTable columns={columns} data={orgs} />}
    </div>
  );
}
