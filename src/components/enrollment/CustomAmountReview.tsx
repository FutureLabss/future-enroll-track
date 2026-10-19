import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { registrationDb, registrationError, formatNaira } from '@/lib/registration';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function CustomAmountReview({ enrollment }: { enrollment: {
  id: string; registration_number: string; registration_payment_option: string; custom_amount_status: string;
  initial_payment_amount: number; total_amount: number; amount_paid: number; custom_review_reason: string | null;
} }) {
  const [reason, setReason] = useState('');
  const [schedule, setSchedule] = useState([{ amount: String(Number(enrollment.total_amount) - Number(enrollment.initial_payment_amount)), due_date: '' }]);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  if (enrollment.registration_payment_option !== 'custom') return null;
  async function review(approve: boolean) {
    setBusy(true);
    try {
      const { error } = await registrationDb.rpc('review_custom_registration', {
        p_enrollment_id: enrollment.id, p_approve: approve, p_reason: reason,
        p_schedule: schedule.map(p => ({ ...p, amount: Number(p.amount) })),
      });
      if (error) throw error;
      void queryClient.invalidateQueries({ queryKey: ['enrollment-detail'] });
      void queryClient.invalidateQueries({ queryKey: ['registration-progress'] });
      toast.success(approve ? 'Custom deposit and remaining terms approved' : 'Custom amount rejected; confirmed money remains credited');
    } catch (error) { toast.error(registrationError(error, 'Review failed')); }
    finally { setBusy(false); }
  }
  return <section className="border rounded-xl p-5 mb-6 space-y-3">
    <h2 className="font-semibold text-lg">Custom initial payment — {enrollment.custom_amount_status}</h2>
    <p>{enrollment.registration_number} · Deposit: {formatNaira(enrollment.initial_payment_amount)} · Confirmed: {formatNaira(enrollment.amount_paid)}</p>
    <p>Remaining schedule must total {formatNaira(Number(enrollment.total_amount) - Number(enrollment.initial_payment_amount))}. Transfer verification is a separate review.</p>
    {enrollment.custom_review_reason && <p>Last review: {enrollment.custom_review_reason}</p>}
    {enrollment.custom_amount_status !== 'approved' && <>
      {schedule.map((part, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-3">
        <div><Label htmlFor={`remaining-amount-${index}`}>Amount (NGN)</Label><Input id={`remaining-amount-${index}`} type="number" min="1000" step="0.01" value={part.amount} onChange={e => setSchedule(schedule.map((p, i) => i === index ? { ...p, amount: e.target.value } : p))} /></div>
        <div><Label htmlFor={`remaining-date-${index}`}>Future due date</Label><Input id={`remaining-date-${index}`} type="date" value={part.due_date} onChange={e => setSchedule(schedule.map((p, i) => i === index ? { ...p, due_date: e.target.value } : p))} /></div>
        {schedule.length > 1 && <Button variant="outline" onClick={() => setSchedule(schedule.filter((_, i) => i !== index))}>Remove</Button>}
      </div>)}
      <Button variant="outline" onClick={() => setSchedule([...schedule, { amount: '', due_date: '' }])}>Add remaining payment</Button>
      <Label htmlFor="review-reason">Review reason</Label><Input id="review-reason" value={reason} onChange={e => setReason(e.target.value)} />
      <div className="flex gap-3"><Button disabled={busy || !reason.trim()} onClick={() => review(true)}>Approve custom terms</Button><Button variant="outline" disabled={busy || !reason.trim()} onClick={() => review(false)}>Reject custom amount</Button></div>
    </>}
  </section>;
}
