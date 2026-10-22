import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { untypedRpc } from '@/lib/untypedRpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useStaffOptions } from '@/hooks/useStaffOptions';
import { CalendarClock } from 'lucide-react';
import { toast } from 'sonner';

const DAYS = [
  ['Mon', 'monday'], ['Tue', 'tuesday'], ['Wed', 'wednesday'], ['Thu', 'thursday'],
  ['Fri', 'friday'], ['Sat', 'saturday'], ['Sun', 'sunday'],
] as const;

export interface ScheduleSetupCohort {
  id: string;
  cohort_label: string;
  start_date?: string | null;
  end_date?: string | null;
  classroom_id?: string | null;
  program_id?: string | null;
  primary_tutor_id?: string | null;
}

interface Props {
  cohort: ScheduleSetupCohort | null;
  onOpenChange: (open: boolean) => void;
  onScheduled?: (count: number) => void;
  staffList?: { id: string; full_name: string }[];
  justCreated?: boolean;
}

// Every running cohort needs a schedule, so this opens straight after a cohort is
// created without one, and from every "no schedule" warning.
export function CohortScheduleSetupDialog({ cohort, onOpenChange, onScheduled, staffList, justCreated }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ start_date: '', end_date: '', days: [] as string[], start_time: '09:00', end_time: '11:00', instructor_id: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (cohort) {
      setForm(f => ({ ...f, start_date: cohort.start_date || '', end_date: cohort.end_date || '', days: [], instructor_id: cohort.primary_tutor_id || '' }));
    }
  }, [cohort]);

  // Cohorts created from the Cohorts page have no classroom yet; a programme has
  // one classroom, so schedule them into that.
  const { data: fallbackClassroom } = useQuery({
    queryKey: ['program-classroom', cohort?.program_id],
    queryFn: async () => {
      // classrooms is missing from the generated types (LMS tables predate typegen).
      const { data } = await supabase.from('classrooms' as never).select('id, name').eq('program_id', cohort!.program_id!).eq('status', 'active').limit(1).maybeSingle();
      return data as unknown as { id: string; name: string } | null;
    },
    enabled: Boolean(cohort && !cohort.classroom_id && cohort.program_id),
  });

  const instructors = useStaffOptions(staffList);

  const classroomId = cohort?.classroom_id || fallbackClassroom?.id || null;

  const toggleDay = (day: string) =>
    setForm(f => ({ ...f, days: f.days.includes(day) ? f.days.filter(d => d !== day) : [...f.days, day] }));

  const handleSave = async () => {
    if (!cohort) return;
    if (!classroomId) { toast.error('Link this cohort to a classroom before scheduling it'); return; }
    if (!form.start_date || !form.end_date) { toast.error('Set the cohort start and end dates'); return; }
    if (form.end_date < form.start_date) { toast.error('End date must be after the start date'); return; }
    if (form.days.length === 0) { toast.error('Pick at least one class day'); return; }
    if (form.end_time <= form.start_time) { toast.error('End time must be after the start time'); return; }

    setSaving(true);
    try {
      const patch: Record<string, string> = {};
      if (form.start_date !== (cohort.start_date || '')) patch.start_date = form.start_date;
      if (form.end_date !== (cohort.end_date || '')) patch.end_date = form.end_date;
      if (!cohort.classroom_id) patch.classroom_id = classroomId;
      if (Object.keys(patch).length) {
        const { error } = await supabase.from('cohorts').update(patch as never).eq('id', cohort.id);
        if (error) throw error;
      }

      const { data: count, error } = await untypedRpc('generate_cohort_schedule', {
        p_cohort_id: cohort.id,
        p_days: form.days,
        p_start_time: form.start_time,
        p_end_time: form.end_time,
        p_instructor_id: form.instructor_id || null,
      });
      if (error) throw error;

      const n = Number(count) || 0;
      if (n === 0) {
        toast.error('No class days fall between those dates — adjust the dates or days');
        return;
      }
      toast.success(`${n} session${n === 1 ? '' : 's'} scheduled for ${cohort.cohort_label}`);
      queryClient.invalidateQueries({ queryKey: ['cohort-setup-gaps'] });
      queryClient.invalidateQueries({ queryKey: ['schedules', classroomId] });
      queryClient.invalidateQueries({ queryKey: ['classroom-cohorts', classroomId] });
      queryClient.invalidateQueries({ queryKey: ['cohorts'] });
      onScheduled?.(n);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || 'Could not create the schedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(cohort)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Set up the schedule for {cohort?.cohort_label}
          </DialogTitle>
          <DialogDescription>
            {justCreated
              ? 'Your cohort is created. Every running cohort needs a class schedule, so add its sessions now. Students and tutors are notified, and the sessions appear in their synced calendars.'
              : 'This cohort has no upcoming classes. Add its sessions so students know when to attend. They will be notified, and the sessions appear in their synced calendars.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!cohort?.classroom_id && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {fallbackClassroom
                ? <>This cohort will be linked to <span className="font-medium text-foreground">{fallbackClassroom.name}</span>, its programme's classroom.</>
                : 'This cohort has no classroom yet. Create a classroom for its programme first.'}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start date *</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="mt-1.5" /></div>
            <div><Label>End date *</Label><Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="mt-1.5" /></div>
          </div>
          <div>
            <Label>Class days *</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {DAYS.map(([short, value]) => {
                const active = form.days.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleDay(value)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${active ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
                  >{short}</button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start time</Label><Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="mt-1.5" /></div>
            <div><Label>End time</Label><Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="mt-1.5" /></div>
          </div>
          {instructors.length > 0 && (
            <div>
              <Label>Instructor</Label>
              <Select value={form.instructor_id} onValueChange={v => setForm({ ...form, instructor_id: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Defaults to the primary tutor" /></SelectTrigger>
                <SelectContent>{instructors.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Remind me later</Button>
            <Button onClick={handleSave} disabled={saving || !classroomId}>{saving ? 'Scheduling…' : 'Create schedule'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
