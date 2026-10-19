import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { registrationDb, registrationError, type RegistrationPlan } from '@/lib/registration';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

function PricingForm({ id, fee, initialPlans }: { id: string; fee: number | null; initialPlans: RegistrationPlan[] }) {
  const [price, setPrice] = useState(fee?.toString() || '');
  const [plans, setPlans] = useState(initialPlans);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  async function save() {
    setBusy(true);
    try {
      const { error } = await registrationDb.from('programs').update({ tuition_fee: price ? Number(price) : null, registration_plans: plans }).eq('id', id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['course-pricing', id] });
      await queryClient.invalidateQueries({ queryKey: ['registration-catalog'] });
      toast.success('Course pricing saved. Existing registrations keep their agreed fees.');
    } catch (error) { toast.error(registrationError(error, 'Could not save pricing')); }
    finally { setBusy(false); }
  }
  return <section className="border rounded-xl p-5 mb-6 space-y-4">
    <h2 className="text-lg font-semibold">Registration pricing</h2>
    <Label htmlFor="tuition-fee">Course fee (NGN)</Label><Input id="tuition-fee" type="number" min="1000" step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
    <p className="text-sm text-muted-foreground">Leave the price empty to pause new paid registrations. Full payment and a custom deposit are available when a price is configured.</p>
    {plans.map((plan, index) => <div key={index} className="border rounded-lg p-4 space-y-3">
      <Label htmlFor={`plan-label-${index}`}>Plan label</Label><Input id={`plan-label-${index}`} value={plan.label} onChange={e => setPlans(plans.map((p, i) => i === index ? { ...p, label: e.target.value } : p))} />
      {plan.parts.map((part, partIndex) => <div className="grid grid-cols-2 gap-3" key={partIndex}>
        <div><Label htmlFor={`percent-${index}-${partIndex}`}>Payment {partIndex + 1} (%)</Label><Input id={`percent-${index}-${partIndex}`} type="number" min="0.01" max="100" step="0.01" value={part.percent} onChange={e => setPlans(plans.map((p, i) => i === index ? { ...p, parts: p.parts.map((v, j) => j === partIndex ? { ...v, percent: Number(e.target.value) } : v) } : p))} /></div>
        <div><Label htmlFor={`days-${index}-${partIndex}`}>Days after registration</Label><Input id={`days-${index}-${partIndex}`} type="number" min="0" step="1" disabled={partIndex === 0} value={part.days} onChange={e => setPlans(plans.map((p, i) => i === index ? { ...p, parts: p.parts.map((v, j) => j === partIndex ? { ...v, days: Number(e.target.value) } : v) } : p))} /></div>
      </div>)}
      <p className="text-sm">Total: {plan.parts.reduce((sum, p) => sum + p.percent, 0)}% · Each payment must be at least ₦1,000.</p>
      <div className="flex gap-3"><Button variant="outline" onClick={() => setPlans(plans.map((p, i) => i === index ? { ...p, parts: [...p.parts, { percent: 0, days: p.parts[p.parts.length - 1].days + 30 }] } : p))}>Add payment</Button><Button variant="outline" onClick={() => setPlans(plans.filter((_, i) => i !== index))}>Remove plan</Button></div>
    </div>)}
    <div className="flex gap-3"><Button variant="outline" onClick={() => setPlans([...plans, { label: `Plan ${plans.length + 1}`, parts: [{ percent: 50, days: 0 }, { percent: 50, days: 30 }] }])}>Add installment plan</Button><Button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save pricing'}</Button></div>
  </section>;
}
export function CoursePricingEditor({ programId }: { programId: string }) {
  const { data, error } = useQuery({ queryKey: ['course-pricing', programId], queryFn: async () => {
    const { data, error } = await registrationDb.from('programs').select('tuition_fee,registration_plans').eq('id', programId).single();
    if (error) throw error;
    return data as { tuition_fee: number | null; registration_plans: RegistrationPlan[] };
  } });
  if (error) return <p role="alert">Unable to load course pricing.</p>;
  return data ? <PricingForm key={`${programId}-${JSON.stringify(data)}`} id={programId} fee={data.tuition_fee} initialPlans={data.registration_plans} /> : <p>Loading pricing…</p>;
}
