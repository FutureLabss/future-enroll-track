import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { untypedRpc } from '@/lib/untypedRpc';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeftRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export interface SwitchProgramEnrollment {
  id: string;
  full_name: string | null;
  program_id: string;
}

interface Props {
  enrollment: SwitchProgramEnrollment | null;
  onOpenChange: (open: boolean) => void;
  onSwitched?: () => void;
}

interface ProgramOption { id: string; program_name: string; hub_id: string | null; active: boolean }

// Moves the enrollment itself (invoice and payments included) via switch_enrollment_program,
// then hands the admin the invoice to adjust, since programmes carry no fee of their own.
export function SwitchProgramDialog({ enrollment, onOpenChange, onSwitched }: Props) {
  const navigate = useNavigate();
  const [toProgramId, setToProgramId] = useState('');
  const [toCohortId, setToCohortId] = useState('');
  const [reason, setReason] = useState('');
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    setToProgramId('');
    setToCohortId('');
    setReason('');
  }, [enrollment?.id]);

  const { data: programData } = useQuery({
    queryKey: ['switch-program-options', enrollment?.program_id],
    queryFn: async () => {
      // programs.hub_id is missing from the generated types (added after typegen).
      const { data, error } = await supabase.from('programs' as never).select('id, program_name, hub_id, active').order('program_name');
      if (error) throw error;
      const all = (data as unknown as ProgramOption[]) || [];
      const current = all.find(p => p.id === enrollment!.program_id) ?? null;
      return {
        current,
        options: all.filter(p => p.id !== enrollment!.program_id && p.active && p.hub_id === current?.hub_id),
      };
    },
    enabled: Boolean(enrollment),
  });
  const currentProgram = programData?.current ?? null;
  const programs = programData?.options ?? [];

  const { data: cohorts = [] } = useQuery({
    queryKey: ['switch-program-cohorts', toProgramId],
    queryFn: async () => {
      const { data, error } = await supabase.from('cohorts' as never)
        .select('id, cohort_label')
        .eq('program_id', toProgramId)
        .in('status', ['active', 'upcoming'])
        .order('start_date', { ascending: false });
      if (error) throw error;
      return (data as unknown as { id: string; cohort_label: string }[]) || [];
    },
    enabled: Boolean(toProgramId),
  });

  const handleSwitch = async () => {
    if (!enrollment) return;
    if (!toProgramId) { toast.error('Select the new programme'); return; }
    setSwitching(true);
    try {
      const { error } = await untypedRpc('switch_enrollment_program', {
        p_enrollment_id: enrollment.id,
        p_to_program_id: toProgramId,
        p_to_cohort_id: toCohortId || null,
        p_reason: reason,
      });
      if (error) throw new Error(error.message);

      const toName = programs.find(p => p.id === toProgramId)?.program_name ?? 'the new programme';
      const studentName = enrollment.full_name || 'Student';
      const { data: invoices } = await supabase.from('invoices').select('id').eq('enrollment_id', enrollment.id).neq('status', 'cancelled');

      onSwitched?.();
      onOpenChange(false);
      if (invoices?.length === 1) {
        toast.success(`${studentName} moved to ${toName}. Adjust the invoice if the fee is different.`);
        navigate(`/admin/invoices/${invoices[0].id}/edit`);
      } else {
        toast.success(`${studentName} moved to ${toName}${invoices?.length ? '. Review their invoices for the new fee.' : ''}`);
      }
    } catch (e) {
      toast.error((e as Error).message || 'Could not switch programme');
    } finally {
      setSwitching(false);
    }
  };

  return (
    <Dialog open={Boolean(enrollment)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Switch Programme</DialogTitle>
          <DialogDescription>
            The enrollment moves with its invoice and payments, and the student moves to the new programme's classroom.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            <span className="font-medium">{enrollment?.full_name}</span>
            <span className="text-muted-foreground"> · currently on {currentProgram?.program_name || '—'}</span>
          </div>
          <div>
            <Label>New programme *</Label>
            {programData && programs.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-2">No other active programmes in this hub.</p>
            ) : (
              <Select value={toProgramId} onValueChange={v => { setToProgramId(v); setToCohortId(''); }}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select programme..." /></SelectTrigger>
                <SelectContent>
                  {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          {toProgramId && (
            <div>
              <Label>Cohort <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select value={toCohortId || '__none__'} onValueChange={v => setToCohortId(v === '__none__' ? '' : v)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{cohorts.length ? 'No cohort yet' : 'No active cohorts'}</SelectItem>
                  {cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Changed track after the first week" className="mt-1.5" rows={2} />
          </div>
          <Button onClick={handleSwitch} disabled={switching || !toProgramId} className="w-full">
            {switching
              ? <><Loader2 className="animate-spin h-4 w-4 mr-2" />Switching...</>
              : <><ArrowLeftRight className="h-4 w-4 mr-2" />Switch Programme</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
