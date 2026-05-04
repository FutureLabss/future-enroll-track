import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2, Target } from 'lucide-react';

type Perf = {
  month: string;
  target_count: number;
  actual_count: number;
  variance: number;
  achievement_pct: number | null;
};

const formatMonth = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

const monthInputValue = (iso: string) => iso.slice(0, 7); // yyyy-mm

export default function EnrollmentTargets() {
  const [rows, setRows] = useState<Perf[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [form, setForm] = useState({ month: '', target_count: '', notes: '' });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_enrollment_performance', { p_months: 12 });
    if (error) toast.error(error.message);
    setRows((data || []) as Perf[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditingMonth(null);
    const now = new Date();
    setForm({ month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, target_count: '', notes: '' });
    setOpen(true);
  };

  const openEdit = (r: Perf) => {
    setEditingMonth(r.month);
    setForm({ month: monthInputValue(r.month), target_count: String(r.target_count || ''), notes: '' });
    setOpen(true);
  };

  const save = async () => {
    if (!form.month || !form.target_count) { toast.error('Month and target are required'); return; }
    const target_month = `${form.month}-01`;
    const payload = {
      target_month,
      target_count: Number(form.target_count),
      notes: form.notes || null,
    };
    const { error } = await supabase
      .from('enrollment_targets')
      .upsert(payload, { onConflict: 'target_month' });
    if (error) { toast.error(error.message); return; }
    toast.success('Target saved');
    setOpen(false);
    load();
  };

  const remove = async (month: string) => {
    if (!confirm('Delete target for ' + formatMonth(month) + '?')) return;
    const { error } = await supabase
      .from('enrollment_targets')
      .delete()
      .eq('target_month', month.slice(0, 10));
    if (error) { toast.error(error.message); return; }
    toast.success('Deleted');
    load();
  };

  const totals = rows.reduce(
    (a, r) => ({ target: a.target + (r.target_count || 0), actual: a.actual + (r.actual_count || 0) }),
    { target: 0, actual: 0 }
  );
  const overallPct = totals.target > 0 ? Math.round((totals.actual / totals.target) * 1000) / 10 : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" /> Enrollment Targets vs Actual
        </CardTitle>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Set Target</Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="rounded-lg p-3 bg-muted/40">
                <div className="text-xs text-muted-foreground">Total Target</div>
                <div className="text-xl font-heading font-bold">{totals.target}</div>
              </div>
              <div className="rounded-lg p-3 bg-muted/40">
                <div className="text-xs text-muted-foreground">Total Actual</div>
                <div className="text-xl font-heading font-bold">{totals.actual}</div>
              </div>
              <div className="rounded-lg p-3 bg-muted/40">
                <div className="text-xs text-muted-foreground">Overall Achievement</div>
                <div className={`text-xl font-heading font-bold ${overallPct != null && overallPct >= 100 ? 'text-success' : 'text-primary'}`}>
                  {overallPct != null ? `${overallPct}%` : '—'}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">Achievement</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No data</TableCell></TableRow>
                  ) : rows.map(r => (
                    <TableRow key={r.month}>
                      <TableCell className="font-medium">{formatMonth(r.month)}</TableCell>
                      <TableCell className="text-right">{r.target_count || '—'}</TableCell>
                      <TableCell className="text-right">{r.actual_count}</TableCell>
                      <TableCell className={`text-right font-medium ${r.variance >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {r.target_count ? (r.variance >= 0 ? `+${r.variance}` : r.variance) : '—'}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${r.achievement_pct != null && r.achievement_pct >= 100 ? 'text-success' : ''}`}>
                        {r.achievement_pct != null ? `${r.achievement_pct}%` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        {r.target_count > 0 && (
                          <Button size="icon" variant="ghost" onClick={() => remove(r.month)}><Trash2 className="h-4 w-4" /></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMonth ? 'Edit Target' : 'Set Monthly Target'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Month</Label>
              <Input type="month" value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} />
            </div>
            <div>
              <Label>Target enrollments</Label>
              <Input type="number" min="0" value={form.target_count} onChange={e => setForm({ ...form, target_count: e.target.value })} />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
