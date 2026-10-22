import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCohortSetupGaps, type CohortSetupGap } from '@/hooks/useCohortSetupGaps';
import { CohortScheduleSetupDialog } from '@/components/cohort/CohortScheduleSetupDialog';
import { PrimaryTutorSelect } from '@/components/cohort/PrimaryTutorSelect';
import type { StaffOption } from '@/hooks/useStaffOptions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, CalendarPlus, UserCheck } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  classroomId?: string;
  staffList?: StaffOption[];
  showClassroom?: boolean;
}

function AssignTutorDialog({ cohort, staffList, onClose }: { cohort: CohortSetupGap | null; staffList?: StaffOption[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [tutorId, setTutorId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!cohort || !tutorId) { toast.error('Pick a tutor'); return; }
    setSaving(true);
    const { error } = await supabase.from('cohorts').update({ primary_tutor_id: tutorId } as never).eq('id', cohort.cohort_id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Primary tutor assigned to ${cohort.cohort_label}`);
    queryClient.invalidateQueries({ queryKey: ['cohort-setup-gaps'] });
    queryClient.invalidateQueries({ queryKey: ['cohorts'] });
    queryClient.invalidateQueries({ queryKey: ['classroom-cohorts'] });
    setTutorId('');
    onClose();
  };

  return (
    <Dialog open={Boolean(cohort)} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign a primary tutor to {cohort?.cohort_label}</DialogTitle>
          <DialogDescription>Every cohort needs a primary tutor. They are notified, their sessions default to them, and they are reminded if the cohort has no schedule.</DialogDescription>
        </DialogHeader>
        <PrimaryTutorSelect value={tutorId} onChange={setTutorId} staffList={staffList} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !tutorId}>{saving ? 'Saving…' : 'Assign tutor'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CohortSetupGapsAlert({ classroomId, staffList, showClassroom }: Props) {
  const { data: gaps } = useCohortSetupGaps(classroomId);
  const [scheduleTarget, setScheduleTarget] = useState<CohortSetupGap | null>(null);
  const [tutorTarget, setTutorTarget] = useState<CohortSetupGap | null>(null);

  if (!gaps.length) return null;

  const noSchedule = gaps.filter(g => g.needs_schedule).length;
  const noTutor = gaps.filter(g => g.needs_tutor).length;
  const headline = [
    noSchedule && `${noSchedule} running cohort${noSchedule === 1 ? ' has' : 's have'} no upcoming classes`,
    noTutor && `${noTutor} cohort${noTutor === 1 ? ' has' : 's have'} no primary tutor`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="mb-5 rounded-xl border border-warning/40 bg-warning/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{headline}</p>
          <p className="text-sm text-muted-foreground">Every cohort needs a primary tutor, and every running cohort needs a schedule.</p>
          <ul className="mt-3 space-y-2">
            {gaps.map(g => (
              <li key={g.cohort_id} className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {g.cohort_label}
                    {showClassroom && g.classroom_name && <span className="text-muted-foreground"> · {g.classroom_name}</span>}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {g.needs_schedule && <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">No schedule</Badge>}
                    {g.needs_tutor && <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">No primary tutor</Badge>}
                    <span>
                      {g.start_date ? new Date(g.start_date).toLocaleDateString('en-NG') : '—'} – {g.end_date ? new Date(g.end_date).toLocaleDateString('en-NG') : '—'}
                      {g.primary_tutor_name && ` · Tutor: ${g.primary_tutor_name}`}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.needs_tutor && (
                    <Button size="sm" variant="outline" onClick={() => setTutorTarget(g)}>
                      <UserCheck className="mr-1.5 h-3.5 w-3.5" />Assign tutor
                    </Button>
                  )}
                  {g.needs_schedule && (
                    <Button size="sm" onClick={() => setScheduleTarget(g)}>
                      <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />Set up schedule
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <CohortScheduleSetupDialog
        cohort={scheduleTarget && {
          id: scheduleTarget.cohort_id,
          cohort_label: scheduleTarget.cohort_label,
          start_date: scheduleTarget.start_date,
          end_date: scheduleTarget.end_date,
          classroom_id: scheduleTarget.classroom_id,
          program_id: scheduleTarget.program_id,
          primary_tutor_id: scheduleTarget.primary_tutor_id,
        }}
        staffList={staffList}
        onOpenChange={open => !open && setScheduleTarget(null)}
      />
      <AssignTutorDialog cohort={tutorTarget} staffList={staffList} onClose={() => setTutorTarget(null)} />
    </div>
  );
}
