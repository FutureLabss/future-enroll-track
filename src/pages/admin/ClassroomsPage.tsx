import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClassrooms } from '@/hooks/useClassroom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, MapPin, Users, BookOpen, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useEffect } from 'react';

export default function ClassroomsPage() {
  const navigate = useNavigate();
  const { classrooms, loading, refetch, createClassroom, archiveClassroom } = useClassrooms();
  const [open, setOpen] = useState(false);
  const [programs, setPrograms] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', program_id: '', description: '', location: '',
    gps_lat: '', gps_lng: '', attendance_radius_metres: '100',
    geofencing_enabled: false,
  });

  useEffect(() => {
    supabase.from('programs').select('id, program_name').eq('active', true)
      .then(({ data }) => setPrograms(data || []));
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('Classroom name is required'); return; }
    setSaving(true);
    try {
      await createClassroom({
        name: form.name,
        program_id: form.program_id || null,
        description: form.description || null,
        location: form.location || null,
        gps_lat: form.gps_lat ? parseFloat(form.gps_lat) : null,
        gps_lng: form.gps_lng ? parseFloat(form.gps_lng) : null,
        attendance_radius_metres: parseInt(form.attendance_radius_metres) || 100,
        geofencing_enabled: form.geofencing_enabled,
      } as any);
      toast.success('Classroom created');
      setOpen(false);
      setForm({ name: '', program_id: '', description: '', location: '', gps_lat: '', gps_lng: '', attendance_radius_metres: '100', geofencing_enabled: false });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const active = classrooms.filter(c => c.status === 'active');
  const archived = classrooms.filter(c => c.status === 'archived');

  return (
    <div>
      <PageHeader
        title="Classrooms"
        description="Manage teaching classrooms and assign staff"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New Classroom</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Create Classroom</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label>Classroom Name *</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1.5" placeholder="e.g. Web Development Classroom" />
                </div>
                <div>
                  <Label>Program</Label>
                  <Select value={form.program_id} onValueChange={v => setForm({ ...form, program_id: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select program" /></SelectTrigger>
                    <SelectContent>
                      {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-1.5" rows={2} />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="mt-1.5" placeholder="Physical address or room" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Latitude</Label>
                    <Input type="number" step="any" value={form.gps_lat} onChange={e => setForm({ ...form, gps_lat: e.target.value })} className="mt-1.5" placeholder="6.5244" />
                  </div>
                  <div>
                    <Label>Longitude</Label>
                    <Input type="number" step="any" value={form.gps_lng} onChange={e => setForm({ ...form, gps_lng: e.target.value })} className="mt-1.5" placeholder="3.3792" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <Label>Attendance Radius (m)</Label>
                    <Input type="number" value={form.attendance_radius_metres} onChange={e => setForm({ ...form, attendance_radius_metres: e.target.value })} className="mt-1.5" />
                  </div>
                  <div className="flex items-center gap-3 pb-1">
                    <Switch checked={form.geofencing_enabled} onCheckedChange={v => setForm({ ...form, geofencing_enabled: v })} />
                    <Label>Enable Geofencing</Label>
                  </div>
                </div>
                <Button onClick={handleCreate} disabled={saving} className="w-full">
                  {saving ? 'Creating...' : 'Create Classroom'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-10">
            {active.map(cls => (
              <div
                key={cls.id}
                onClick={() => navigate(`/admin/classrooms/${cls.id}`)}
                className="glass-card rounded-2xl p-6 cursor-pointer hover:shadow-lg hover:scale-[1.01] transition-all border border-border"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-heading font-semibold text-lg">{cls.name}</h3>
                    {cls.programs && <p className="text-sm text-muted-foreground">{(cls.programs as any).program_name}</p>}
                  </div>
                  <Badge variant="default" className="bg-success/15 text-success border-success/30">Active</Badge>
                </div>
                {cls.description && <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{cls.description}</p>}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {cls.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{cls.location}</span>}
                  <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{((cls as any).cohorts || []).length} cohort{((cls as any).cohorts || []).length !== 1 ? 's' : ''}</span>
                </div>
                {cls.geofencing_enabled && (
                  <div className="mt-3 text-xs text-primary flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> GPS geofencing enabled ({cls.attendance_radius_metres}m)
                  </div>
                )}
              </div>
            ))}
            {active.length === 0 && (
              <div className="col-span-3 text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
                <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No classrooms yet</p>
                <p className="text-sm">Create your first classroom to get started</p>
              </div>
            )}
          </div>

          {archived.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Archive className="h-4 w-4" /> Archived ({archived.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 opacity-60">
                {archived.map(cls => (
                  <div key={cls.id} className="rounded-xl border border-border p-4">
                    <p className="font-medium">{cls.name}</p>
                    {cls.programs && <p className="text-sm text-muted-foreground">{(cls.programs as any).program_name}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
