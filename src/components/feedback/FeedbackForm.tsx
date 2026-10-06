import { useMemo, useState } from 'react';
import { FeedbackInvitation, FeedbackQuestion } from '@/hooks/useFeedback';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2, ShieldCheck, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export function FeedbackForm({ invitation, onSubmit, submitting }: { invitation: FeedbackInvitation; onSubmit: (answers: Array<{ question_id: string; value: unknown }>) => Promise<void>; submitting: boolean }) {
  const questions = invitation.campaigns.questions_snapshot || [];
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [attempted, setAttempted] = useState(false);
  const missing = useMemo(() => questions.filter(q => q.required && (answers[q.id] === undefined || answers[q.id] === '')), [questions, answers]);
  const set = (id: string, value: unknown) => setAnswers(prev => ({ ...prev, [id]: value }));

  const submit = async () => {
    setAttempted(true);
    if (missing.length) return;
    await onSubmit(Object.entries(answers).filter(([, value]) => value !== '').map(([question_id, value]) => ({ question_id, value })));
  };

  return <div className="space-y-6">
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm flex gap-3">
      <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
      <div><p className="font-medium">Your response is confidential</p><p className="text-muted-foreground mt-1">Instructors receive anonymous results after this survey closes. Authorized administrators can identify responses when follow-up is needed. Please avoid identifying yourself in written comments.</p></div>
    </div>
    {questions.map((question, index) => <QuestionField key={question.id} question={question} index={index} value={answers[question.id]} onChange={value => set(question.id, value)} invalid={attempted && missing.some(q => q.id === question.id)} />)}
    {attempted && missing.length > 0 && <p className="text-sm text-destructive flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Please answer all required questions.</p>}
    <Button className="w-full" size="lg" onClick={submit} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{submitting ? 'Submitting…' : 'Submit confidential feedback'}</Button>
  </div>;
}

function QuestionField({ question, index, value, onChange, invalid }: { question: FeedbackQuestion; index: number; value: unknown; onChange: (value: unknown) => void; invalid: boolean }) {
  return <div className={cn('rounded-xl border p-4 space-y-3', invalid && 'border-destructive')}>
    <Label className="text-sm leading-5">{index + 1}. {question.prompt}{question.required && <span className="text-destructive ml-1">*</span>}</Label>
    {question.description && <p className="text-xs text-muted-foreground">{question.description}</p>}
    {question.question_type === 'rating' && <div className="flex flex-wrap gap-2">{[1,2,3,4,5].map(n => <Button key={n} type="button" variant={value === n ? 'default' : 'outline'} className="h-10 min-w-12" onClick={() => onChange(n)}><Star className={cn('h-4 w-4 mr-1', value === n && 'fill-current')} />{n}</Button>)}</div>}
    {question.question_type === 'nps' && <div className="flex flex-wrap gap-1.5">{Array.from({ length: 11 }, (_, n) => <Button key={n} type="button" variant={value === n ? 'default' : 'outline'} size="sm" onClick={() => onChange(n)}>{n}</Button>)}</div>}
    {question.question_type === 'boolean' && <RadioGroup value={value === undefined ? '' : String(value)} onValueChange={v => onChange(v === 'true')} className="flex gap-5"><label className="flex items-center gap-2"><RadioGroupItem value="true" />Yes</label><label className="flex items-center gap-2"><RadioGroupItem value="false" />No</label></RadioGroup>}
    {question.question_type === 'choice' && <Select value={String(value || '')} onValueChange={onChange}><SelectTrigger><SelectValue placeholder="Select an answer" /></SelectTrigger><SelectContent>{(question.options || []).map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select>}
    {question.question_type === 'text' && <Textarea rows={3} maxLength={2000} value={String(value || '')} onChange={e => onChange(e.target.value)} placeholder="Optional comments" />}
    {question.question_type === 'rating' && <div className="flex justify-between text-xs text-muted-foreground max-w-[19rem]"><span>Strongly disagree</span><span>Strongly agree</span></div>}
  </div>;
}
