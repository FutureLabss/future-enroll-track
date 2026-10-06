// @ts-nocheck
import { useState } from 'react';
import { useFeedbackCampaigns } from '@/hooks/useFeedback';
import { FeedbackResults } from '@/components/feedback/FeedbackResults';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, MessageSquareHeart } from 'lucide-react';

export function ClassroomFeedbackPanel({ classroomId, instructorView = false }: { classroomId: string; instructorView?: boolean }) {
  const { data: campaigns = [], isLoading } = useFeedbackCampaigns({ classroomId });
  const [selected, setSelected] = useState<string | null>(null);
  const visible = instructorView ? campaigns.filter(c => c.status === 'closed') : campaigns;
  if (isLoading) return <div className="py-10 flex justify-center"><Loader2 className="animate-spin" /></div>;
  return <div className="space-y-3">
    {instructorView && <p className="text-sm text-muted-foreground">Anonymous feedback becomes available after each survey closes.</p>}
    {visible.map(c => <div key={c.id} className="rounded-xl border p-4 flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><MessageSquareHeart className="h-4 w-4 text-primary"/><p className="font-medium">{c.title}</p></div><p className="text-xs text-muted-foreground mt-1">Closes {new Date(c.closes_at).toLocaleDateString('en-NG')}</p></div><div className="flex items-center gap-2"><Badge variant="outline" className="capitalize">{c.status}</Badge><Button size="sm" variant="outline" onClick={() => setSelected(c.id)}>View results</Button></div></div>)}
    {!visible.length && <p className="text-center text-muted-foreground py-10">No feedback results are available yet.</p>}
    <Dialog open={!!selected} onOpenChange={o=>!o&&setSelected(null)}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Anonymous learner feedback</DialogTitle></DialogHeader>{selected&&<FeedbackResults campaignId={selected} instructorView={instructorView}/>}</DialogContent></Dialog>
  </div>;
}
