import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/lib/untypedRpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, LogOut, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

interface Choice {
  first_name: string;
  program_name: string;
  cohort_label: string;
  next_cohort_label: string | null;
  next_cohort_start: string | null;
  hub_name: string | null;
  status: 'open' | 'rejoin_requested' | 'moved' | 'withdrawn' | 'returned';
  outstanding: number;
}

const money = (n: number) => `₦${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

// Public, from the link in the "we've missed you" message: the student chooses to
// rejoin the next cohort or withdraw. The token in the link is the only credential.
export default function ReconnectPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [pick, setPick] = useState<'rejoin' | 'withdraw' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['reconnect', token],
    queryFn: async () => {
      const { data, error } = await untypedRpc('get_dropout_choice', { p_token: token });
      if (error) throw error;
      return data as Choice | null;
    },
  });

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">This link isn't valid. Please contact the front desk.</div>;

  const hub = data.hub_name || 'FutureLabs';
  const next = data.next_cohort_label
    ? `${data.next_cohort_label}${data.next_cohort_start ? `, starting ${new Date(`${data.next_cohort_start}T00:00:00`).toLocaleDateString('en-NG', { day: 'numeric', month: 'long' })}` : ''}`
    : 'the next cohort, as soon as it opens';
  const status = done ?? data.status;

  const submit = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      const { data: result, error } = await untypedRpc('choose_dropout_option', { p_token: token, p_choice: pick, p_note: note.trim() || null });
      if (error) throw error;
      setDone(result as string);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (status !== 'open') {
    const message = status === 'withdrawn'
      ? `You've withdrawn from ${data.program_name}. We're sorry to see you go; if you change your mind, contact ${hub}.`
      : status === 'returned'
        ? `Welcome back! You're attending ${data.program_name} again.`
        : `Thanks, ${data.first_name}. We'll place you in ${status === 'moved' ? 'your new cohort' : next} and be in touch with the details.`;
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <Card className="max-w-md"><CardContent className="space-y-3 pt-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
          <p>{message}</p>
          {data.outstanding > 0 && status !== 'returned' && (
            <p className="text-sm text-muted-foreground">Your balance of {money(data.outstanding)} is still outstanding; the front desk can help you agree a payment date.</p>
          )}
        </CardContent></Card>
      </div>
    );
  }

  const option = (key: 'rejoin' | 'withdraw', title: string, body: string, Icon: typeof RotateCcw) => (
    <button type="button" onClick={() => setPick(key)}
      className={`w-full rounded-xl border-2 p-4 text-left transition ${pick === key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
      <p className="flex items-center gap-2 font-medium"><Icon className="h-4 w-4" />{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </button>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-lg">
        <CardContent className="space-y-5 pt-8">
          <div>
            <p className="text-sm font-medium text-primary">{hub}</p>
            <h1 className="mt-1 font-heading text-2xl font-semibold">We've missed you, {data.first_name}</h1>
            <p className="mt-2 text-muted-foreground">
              You haven't been in {data.program_name} ({data.cohort_label}) for a few weeks. What would you like to do?
            </p>
          </div>
          <div className="space-y-3">
            {option('rejoin', 'Rejoin the next cohort', `Start again with ${next} and pick up where you left off.`, RotateCcw)}
            {option('withdraw', 'Withdraw from the programme', 'Leave the programme. Your class place is released.', LogOut)}
          </div>
          {data.outstanding > 0 && (
            <p className="text-sm text-muted-foreground">Either way, your balance of {money(data.outstanding)} remains outstanding.</p>
          )}
          <div>
            <Label htmlFor="reconnect-note">Anything we should know? (optional)</Label>
            <Textarea id="reconnect-note" rows={3} value={note} onChange={e => setNote(e.target.value)} className="mt-1.5"
              placeholder="e.g. I had exams, I travelled, the schedule didn't work for me…" />
          </div>
          <Button className="w-full" disabled={!pick || busy} onClick={submit}>
            {busy ? 'Saving…' : pick === 'withdraw' ? 'Withdraw' : 'Confirm'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
