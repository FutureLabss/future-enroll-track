import { useState } from 'react';
import { useStudentFeedback, FeedbackInvitation } from '@/hooks/useFeedback';
import { FeedbackForm } from '@/components/feedback/FeedbackForm';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle2, Clock, Loader2, MessageSquareHeart } from 'lucide-react';
import { toast } from 'sonner';

export default function StudentFeedbackPage() {
  const { invitations, loading, submitFeedback, submitting, dismiss } = useStudentFeedback();
  const [selected, setSelected] = useState<FeedbackInvitation | null>(null);
  const now = Date.now();
  const statusOf = (item: FeedbackInvitation) => item.completed_at ? 'completed' : new Date(item.campaigns.closes_at).getTime() <= now || item.campaigns.status === 'closed' ? 'expired' : 'pending';
  const submit = async (answers: Array<{ question_id: string; value: unknown }>) => { try { await submitFeedback({ invitationId: selected!.id, answers }); toast.success('Thank you — your feedback was submitted confidentially.'); setSelected(null); } catch (e: any) { toast.error(e.message); } };
  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin" /></div>;
  return <div><PageHeader title="Feedback" description="Help us improve your classes and learning experience." />
    <div className="grid gap-4 mt-6">{invitations.map(item => { const status = statusOf(item); return <div key={item.id} className="glass-card rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><div className="flex items-center gap-2"><MessageSquareHeart className="h-5 w-5 text-primary" /><h3 className="font-semibold">{item.campaigns.title}</h3><Badge variant="outline" className="capitalize">{item.campaigns.campaign_type}</Badge></div><p className="text-sm text-muted-foreground mt-2">{item.campaigns.classrooms?.name}{item.campaigns.cohorts?.cohort_label ? ` · ${item.campaigns.cohorts.cohort_label}` : ''}</p><p className="text-xs text-muted-foreground mt-1">Closes {new Date(item.campaigns.closes_at).toLocaleString('en-NG')}</p></div><div className="flex gap-2">{status === 'pending' ? <><Button variant="ghost" onClick={() => dismiss(item.id)}>Later</Button><Button onClick={() => setSelected(item)}>Give feedback</Button></> : status === 'completed' ? <span className="text-sm text-success flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />Submitted</span> : <span className="text-sm text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" />Closed</span>}</div></div>; })}{invitations.length === 0 && <div className="text-center py-16 glass-card rounded-xl"><MessageSquareHeart className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="font-medium">No feedback requests</p><p className="text-sm text-muted-foreground mt-1">New requests will appear after classes and near the end of your course.</p></div>}</div>
    <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}><DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{selected?.campaigns.title}</DialogTitle></DialogHeader>{selected && <FeedbackForm invitation={selected} onSubmit={submit} submitting={submitting} />}</DialogContent></Dialog>
  </div>;
}
