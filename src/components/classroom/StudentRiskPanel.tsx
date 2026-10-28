import { useState } from 'react';
import { useStudentRiskFlags } from '@/hooks/useStudentRiskFlags';
import { describeRisk, whatsappLink, type RiskFlag } from '@/lib/risk';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Info, Mail, MessageCircle, Phone, X } from 'lucide-react';
import { toast } from 'sonner';

const REASON_COLOURS: Record<string, string> = {
  missed_classes: 'bg-warning/15 text-warning border-warning/30',
  missing_assignment: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
};

const REASON_LABELS: Record<string, string> = {
  missed_classes: 'Absent',
  missing_assignment: 'Assignment',
};

// Students who missed their last two classes or an assignment, for the classroom's
// tutors and admins. Refreshed every morning; flags clear once the student is back.
export function StudentRiskPanel({ classroomId }: { classroomId: string }) {
  const { data, dismiss } = useStudentRiskFlags(classroomId);
  const [showDismissed, setShowDismissed] = useState(false);
  const open = data.flags.filter(f => !f.dismissed);
  const dismissed = data.flags.filter(f => f.dismissed);

  if (data.flags.length === 0 && data.uncountedSessions.length === 0) return null;

  const row = (f: RiskFlag) => {
    const wa = whatsappLink(f.phone);
    return (
      <li key={f.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {f.student_name || f.email || 'Student'}
            <Badge variant="outline" className={REASON_COLOURS[f.reason]}>{REASON_LABELS[f.reason]}</Badge>
          </p>
          <p className="text-sm text-muted-foreground">{describeRisk(f)} · {f.cohort_label}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {wa && (
            <Button asChild size="icon" variant="ghost" className="h-8 w-8" aria-label={`WhatsApp ${f.student_name || ''}`}>
              <a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a>
            </Button>
          )}
          {f.phone && (
            <Button asChild size="icon" variant="ghost" className="h-8 w-8" aria-label={`Call ${f.student_name || ''}`}>
              <a href={`tel:${f.phone}`}><Phone className="h-4 w-4" /></a>
            </Button>
          )}
          {f.email && (
            <Button asChild size="icon" variant="ghost" className="h-8 w-8" aria-label={`Email ${f.student_name || ''}`}>
              <a href={`mailto:${f.email}`}><Mail className="h-4 w-4" /></a>
            </Button>
          )}
          {!f.dismissed && (
            <Button size="sm" variant="ghost" className="text-muted-foreground" aria-label={`Dismiss ${f.student_name || ''}`}
              onClick={() => dismiss(f.id).then(() => toast.success('Dismissed')).catch(e => toast.error(e.message))}>
              <X className="mr-1 h-4 w-4" />Dismiss
            </Button>
          )}
        </div>
      </li>
    );
  };

  return (
    <Card className="mb-4 border-warning/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-warning" />
          {open.length === 0 ? 'Nobody needs attention right now' : `${open.length} ${open.length === 1 ? 'student needs' : 'students need'} attention`}
        </CardTitle>
        <p className="text-xs text-muted-foreground">Checked every morning. A student drops off this list once they attend or submit.</p>
      </CardHeader>
      <CardContent>
        {open.length > 0 && <ul className="divide-y divide-border">{open.map(row)}</ul>}

        {data.uncountedSessions.length > 0 && (
          <div className="mt-3 flex gap-2 rounded-lg bg-muted/60 p-3 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Attendance looks incomplete</p>
              <ul className="text-muted-foreground">
                {data.uncountedSessions.map(s => (
                  <li key={`${s.cohort_label}-${s.at}`}>
                    {new Date(s.at).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })} · {s.cohort_label}: only {s.marked} of {s.cohort_size} marked in
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">These classes aren't counted against anyone. Make sure every student marks attendance with the class code.</p>
            </div>
          </div>
        )}

        {dismissed.length > 0 && (
          <div className="mt-2">
            <Button size="sm" variant="link" className="h-auto px-0 text-muted-foreground" onClick={() => setShowDismissed(v => !v)}>
              {showDismissed ? 'Hide' : 'Show'} {dismissed.length} dismissed
            </Button>
            {showDismissed && <ul className="divide-y divide-border opacity-70">{dismissed.map(row)}</ul>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
