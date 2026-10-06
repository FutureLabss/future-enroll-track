import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompletionJourney } from '@/hooks/useCompletionJourney';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Award, Check, CheckCircle2, Circle, Download, Loader2, MessageSquareQuote, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export function CompletionJourneyCard({ cohortId }: { cohortId: string }) {
  const navigate = useNavigate();
  const { journey, loading, submitDecision, submitting, generate, download } = useCompletionJourney(cohortId);
  const [open, setOpen] = useState(false); const [text, setText] = useState(''); const [consent, setConsent] = useState(false);
  const [attrs, setAttrs] = useState({ fullName:false, firstName:true, photo:false, program:true, cohort:false, organization:false });
  if (loading) return <div className="rounded-xl border p-5 flex justify-center"><Loader2 className="animate-spin" /></div>;
  if (!journey || journey.graduation_status !== 'graduated') return null;
  const decide = async (decision:'submitted'|'declined') => { try { await submitDecision({ decision, text, publicationConsent: decision==='submitted'&&consent, ...attrs }); toast.success(decision==='declined'?'Your choice was saved. Your certificate is being prepared.':'Thank you for sharing your story.'); setOpen(false); } catch(e:any){toast.error(e.message);} };
  const cert = journey.certificate;
  return <div className="glass-card rounded-2xl border border-primary/25 p-6 space-y-5">
    <div className="flex items-center justify-between"><div><h3 className="font-semibold flex items-center gap-2"><Award className="h-5 w-5 text-primary"/>Course completion</h3><p className="text-sm text-muted-foreground mt-1">Complete these final steps to receive your certificate.</p></div><Badge className="bg-success/15 text-success border-success/30">Graduated</Badge></div>
    <Step done title="Graduation requirements" description="Attendance, assignments, and presentations completed." />
    <Step done={journey.feedback_completed} title="Confidential course feedback" description={journey.feedback_completed?'Feedback submitted.':'Complete the private end-of-course survey.'} action={!journey.feedback_completed?<Button size="sm" variant="outline" onClick={()=>navigate('/student/feedback')}>Give feedback</Button>:undefined}/>
    <Step done={!!journey.testimonial} title="Testimonial choice" description={journey.testimonial?journey.testimonial.decision==='declined'?'You chose not to submit a testimonial.':'Your testimonial was received.':'Share your story or choose “No thanks”.'} action={journey.feedback_completed&&!journey.testimonial?<Button size="sm" onClick={()=>setOpen(true)}>Make a choice</Button>:undefined}/>
    <Step done={cert?.status==='issued'} title="Certificate" description={!cert?'Available after the steps above.':cert.status==='issued'?`${cert.certificate_number} · issued ${new Date(cert.issued_at!).toLocaleDateString('en-NG')}`:cert.status==='generation_failed'?'Generation needs to be retried.':'Your PDF is being prepared.'} action={cert?.status==='issued'?<div className="flex gap-2"><Button size="sm" onClick={()=>download(cert.id)}><Download className="h-4 w-4 mr-1"/>Download</Button><Button size="sm" variant="outline" onClick={()=>window.open(`/verify-certificate/${cert.verification_token}`,'_blank')} >Verify</Button></div>:cert?<Button size="sm" variant="outline" onClick={async()=>{try{await generate();toast.success('Certificate generation started');}catch(e:any){toast.error(e.message)}}}><RefreshCw className="h-4 w-4 mr-1"/>Retry</Button>:undefined}/>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Share your learning story</DialogTitle><DialogDescription>This is separate from your confidential feedback. You may decline and still receive your certificate.</DialogDescription></DialogHeader><div className="space-y-4"><div><Label>Your testimonial</Label><Textarea rows={6} maxLength={2000} value={text} onChange={e=>setText(e.target.value)} placeholder="What changed for you? What did you learn, build, or become confident doing?"/><p className="text-xs text-muted-foreground mt-1">40–2,000 characters · {text.trim().length}</p></div><label className="flex gap-2 items-start"><Checkbox checked={consent} onCheckedChange={v=>setConsent(v===true)}/><span className="text-sm">I permit Coriftech to use this testimonial in promotional materials. I can withdraw this permission later.</span></label>{consent&&<div className="rounded-lg border p-3 space-y-2"><p className="text-sm font-medium">How may we attribute it?</p>{Object.entries({fullName:'Full name',firstName:'First name only',photo:'Profile photo',program:'Program name',cohort:'Cohort',organization:'Sponsoring organization'}).map(([key,label])=><label key={key} className="flex gap-2 items-center text-sm"><Checkbox checked={attrs[key as keyof typeof attrs]} disabled={(key==='fullName'&&attrs.firstName)||(key==='firstName'&&attrs.fullName)} onCheckedChange={v=>setAttrs({...attrs,[key]:v===true})}/>{label}</label>)}</div>}<div className="flex flex-col-reverse sm:flex-row gap-2"><Button variant="outline" className="flex-1" disabled={submitting} onClick={()=>decide('declined')}>No thanks — continue</Button><Button className="flex-1" disabled={submitting||text.trim().length<40} onClick={()=>decide('submitted')}><MessageSquareQuote className="h-4 w-4 mr-2"/>Share my story</Button></div></div></DialogContent></Dialog>
  </div>;
}

function Step({done,title,description,action}:{done:boolean;title:string;description:string;action?:React.ReactNode}){return <div className="flex items-center gap-3 rounded-xl border p-3"><div className={done?'rounded-full bg-success/15 p-1 text-success':'text-muted-foreground'}>{done?<Check className="h-4 w-4"/>:<Circle className="h-5 w-5"/>}</div><div className="flex-1"><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div>{action}</div>}
