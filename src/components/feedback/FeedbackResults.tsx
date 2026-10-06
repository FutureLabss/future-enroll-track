import { useFeedbackSummary } from '@/hooks/useFeedback';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageSquareText, ShieldAlert, Star } from 'lucide-react';

export function FeedbackResults({ campaignId, instructorView = false }: { campaignId: string; instructorView?: boolean }) {
  const { data, isLoading, error } = useFeedbackSummary(campaignId);
  if (isLoading) return <div className="py-10 flex justify-center"><Loader2 className="animate-spin" /></div>;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!data) return null;
  const rate = data.invited_count ? Math.round((data.response_count / data.invited_count) * 100) : 0;
  return <div className="space-y-5">
    {instructorView && <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm flex gap-2"><ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" /><span>Responses are anonymous, but comments in small classes may still reveal context. Use this information constructively and never attempt to identify a learner.</span></div>}
    <div className="grid grid-cols-3 gap-3"><Metric label="Invited" value={data.invited_count} /><Metric label="Responses" value={data.response_count} /><Metric label="Response rate" value={`${rate}%`} /></div>
    {(data.questions || []).map((q: any) => <div key={q.question_id} className="rounded-xl border p-4">
      <div className="flex justify-between gap-3"><div><Badge variant="outline" className="capitalize mb-2">{q.dimension}</Badge><p className="font-medium text-sm">{q.prompt}</p></div>{q.average != null && <div className="text-right shrink-0"><div className="text-2xl font-bold flex items-center gap-1"><Star className="h-5 w-5 text-warning fill-warning" />{Number(q.average).toFixed(1)}</div><span className="text-xs text-muted-foreground">average</span></div>}</div>
      {q.question_type === 'text' && <div className="mt-3 space-y-2">{(q.answers || []).filter(Boolean).map((answer: string, i: number) => <div key={i} className="rounded-lg bg-muted/50 p-3 text-sm flex gap-2"><MessageSquareText className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" /><span>{answer}</span></div>)}{!(q.answers || []).filter(Boolean).length && <p className="text-sm text-muted-foreground">No written responses.</p>}</div>}
    </div>)}
  </div>;
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border p-3 text-center"><div className="text-2xl font-bold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>; }
