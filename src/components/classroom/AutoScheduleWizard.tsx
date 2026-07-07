import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarDays, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useCurriculumV2 } from '@/hooks/useCurriculumV2';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const DAYS = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function buildPreview(units: any[], startDate: string, endDate: string, daysOfWeek: number[], startTime: string, endTime: string) {
  if (!units.length || !startDate || !endDate || !daysOfWeek.length || !startTime || !endTime) return [];
  const result: { date: string; dayName: string; unit: any }[] = [];
  const d = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  let i = 0;
  while (d <= end && i < units.length) {
    if (daysOfWeek.includes(d.getDay())) {
      result.push({ date: d.toISOString().split('T')[0], dayName: DAY_NAMES[d.getDay()], unit: units[i] });
      i++;
    }
    d.setDate(d.getDate() + 1);
  }
  return result;
}

function buildIcs(sessions: any[], classroomName: string) {
  const fmtDt = (date: string, time: string) => date.replace(/-/g, '') + 'T' + time.replace(/:/g, '') + '00';
  const now = new Date().toISOString().replace(/[-:.Z]/g, '').slice(0, 15) + 'Z';
  const events = sessions.map(s => [
    'BEGIN:VEVENT',
    `UID:${s.id}@futurelabs.lms`,
    `DTSTAMP:${now}`,
    `DTSTART:${fmtDt(s.scheduled_date, s.start_time)}`,
    `DTEND:${fmtDt(s.scheduled_date, s.end_time)}`,
    `SUMMARY:${classroomName} – ${s.title || 'Class'}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
  ].join('\r\n')).join('\r\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FutureLabs LMS//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', events, 'END:VCALENDAR'].join('\r\n');
}

interface Props {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  classroomName: string;
  cohorts: any[];
  onGenerated: () => void;
}

export function AutoScheduleWizard({ open, onClose, classroomId, classroomName, cohorts, onGenerated }: Props) {
  const { curricula, loading: curriculaLoading } = useCurriculumV2(classroomId);

  const [curriculumId, setCurriculumId] = useState('');
  const [trackId, setTrackId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 3, 5]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [cohortId, setCohortId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<any[] | null>(null);

  useEffect(() => {
    if (!open) {
      setCurriculumId(''); setTrackId(''); setModuleId('');
      setStartDate(''); setEndDate('');
      setDaysOfWeek([1, 3, 5]);
      setStartTime('09:00'); setEndTime('11:00');
      setCohortId('');
      setGenerated(null);
    }
  }, [open]);

  const { track, module, units } = useMemo(() => {
    const curriculum = curricula.find(c => c.id === curriculumId);
    const track = curriculum?.tracks.find((t: any) => t.id === trackId);
    const module = track?.modules?.find((m: any) => m.id === moduleId);
    return { track, module, units: (module?.units || []) as any[] };
  }, [curricula, curriculumId, trackId, moduleId]);

  const preview = useMemo(
    () => buildPreview(units, startDate, endDate, daysOfWeek, startTime, endTime),
    [units, startDate, endDate, daysOfWeek, startTime, endTime]
  );

  const canGenerate = !!moduleId && !!startDate && !!endDate && daysOfWeek.length > 0 && !!startTime && !!endTime && preview.length > 0;

  const toggleDay = (d: number) =>
    setDaysOfWeek(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await (supabase.rpc as any)('generate_class_schedule', {
        p_classroom_id: classroomId,
        p_module_id: moduleId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_days_of_week: daysOfWeek,
        p_start_time: startTime,
        p_end_time: endTime,
        p_cohort_id: cohortId || null,
      });
      if (error) throw error;
      const rows = (data as any[]) || [];
      setGenerated(rows);
      onGenerated();
      toast.success(`${rows.length} session${rows.length !== 1 ? 's' : ''} scheduled`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadIcs = () => {
    if (!generated?.length) return;
    const content = buildIcs(generated, classroomName);
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${classroomName.replace(/\s+/g, '_')}_schedule.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl overflow-y-auto" style={{ maxHeight: '90vh' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Auto Schedule
          </DialogTitle>
        </DialogHeader>

        {generated ? (
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 px-5 py-4">
              <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
              <div>
                <p className="font-semibold text-success">{generated.length} sessions scheduled</p>
                {generated.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(generated[0].scheduled_date + 'T12:00:00').toLocaleDateString('en-NG')} – {new Date(generated[generated.length - 1].scheduled_date + 'T12:00:00').toLocaleDateString('en-NG')}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border divide-y divide-border overflow-hidden max-h-72 overflow-y-auto">
              {generated.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                  <span className="w-36 text-muted-foreground shrink-0">
                    {new Date(s.scheduled_date + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="w-28 text-muted-foreground shrink-0 text-xs">{s.start_time} – {s.end_time}</span>
                  <span className="flex-1 font-medium truncate">{s.title}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleDownloadIcs}>
                <Download className="h-4 w-4 mr-1.5" />Download .ics
              </Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-6 pt-1">
              {/* Form */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Select Module</Label>
                  {curriculaLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />Loading curriculum...
                    </div>
                  ) : curricula.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground text-center">
                      No curriculum set up for this classroom yet.<br />
                      Add a curriculum first, then come back to auto-schedule.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Select value={curriculumId} onValueChange={v => { setCurriculumId(v); setTrackId(''); setModuleId(''); }}>
                        <SelectTrigger><SelectValue placeholder="Curriculum" /></SelectTrigger>
                        <SelectContent>
                          {curricula.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                        </SelectContent>
                      </Select>

                      {curriculumId && (
                        <Select value={trackId} onValueChange={v => { setTrackId(v); setModuleId(''); }}>
                          <SelectTrigger><SelectValue placeholder="Track" /></SelectTrigger>
                          <SelectContent>
                            {(curriculum?.tracks || []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}

                      {trackId && (
                        <Select value={moduleId} onValueChange={setModuleId}>
                          <SelectTrigger><SelectValue placeholder="Module" /></SelectTrigger>
                          <SelectContent>
                            {(track?.modules || []).map((m: any) => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}

                      {moduleId && (
                        <p className="text-xs text-muted-foreground">{units.length} unit{units.length !== 1 ? 's' : ''} to schedule</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Start Date</Label>
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">End Date</Label>
                    <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Class Days</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {DAYS.map(d => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleDay(d.value)}
                        className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                          daysOfWeek.includes(d.value)
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Start Time</Label>
                    <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">End Time</Label>
                    <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                  </div>
                </div>

                {cohorts.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">Cohort <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Select value={cohortId || '__all__'} onValueChange={v => setCohortId(v === '__all__' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="All students" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All students</SelectItem>
                        {cohorts.map(c => <SelectItem key={c.id} value={c.id}>{c.cohort_label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Live Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Preview</Label>
                  {preview.length > 0 && <Badge variant="outline">{preview.length} session{preview.length !== 1 ? 's' : ''}</Badge>}
                </div>

                {preview.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Fill in the form to preview sessions
                  </div>
                ) : (
                  <div className="space-y-2">
                    {units.length > preview.length && (
                      <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>
                          {units.length - preview.length} unit{units.length - preview.length !== 1 ? 's' : ''} won't fit — extend the date range or add more class days.
                        </span>
                      </div>
                    )}
                    <div className="rounded-xl border divide-y divide-border overflow-hidden max-h-64 overflow-y-auto">
                      {preview.map((s, i) => (
                        <div key={i} className="flex items-center gap-2.5 px-3 py-2 text-xs">
                          <span className="w-4 text-muted-foreground text-center">{i + 1}</span>
                          <span className="w-28 text-muted-foreground shrink-0">
                            {s.dayName.slice(0, 3)}, {new Date(s.date + 'T12:00:00').toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}
                          </span>
                          <span className="flex-1 font-medium truncate">{s.unit?.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={handleGenerate} disabled={!canGenerate || generating}>
                {generating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CalendarDays className="h-4 w-4 mr-1.5" />}
                Generate Schedule
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
