import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { siteConfig } from '@/lib/siteConfig';
import { registrationDb, registrationError, getRegistrationProgress, formatNaira, planAmounts, validateReceipt, type RegistrationPlan, type Registration } from '@/lib/registration';
import { toast } from 'sonner';

interface Program { id: string; program_name: string; tuition_fee: number | null; registration_plans: RegistrationPlan[] }
interface Part { id: string; amount: number; due_date: string; status: string }
interface Transfer { id: string; status: string; review_reason?: string }

function PaymentStep({ registration, refresh }: { registration: Registration; refresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState('');
  const [search, setSearch] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['registration-payment', registration.invoice_id],
    queryFn: async () => {
      const [parts, transfers] = await Promise.all([
        registrationDb.from('installments').select('*').eq('invoice_id', registration.invoice_id).order('due_date').order('created_at').order('id'),
        registrationDb.from('pending_payments').select('id,status,review_reason').eq('invoice_id', registration.invoice_id).order('created_at', { ascending: false }),
      ]);
      if (parts.error || transfers.error) throw parts.error || transfers.error;
      return { parts: parts.data as Part[], transfers: transfers.data as Transfer[] };
    },
  });
  useEffect(() => {
    const paymentReference = search.get('reference') || search.get('trxref');
    if (!paymentReference) return;
    let cancelled = false;
    setBusy(true);
    registrationDb.functions.invoke('paystack-verify', { body: { reference: paymentReference } }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || data?.status !== 'success') toast.error(data?.message || 'Could not verify payment. Use Check payment to retry.');
      else {
        toast.success('Payment confirmed');
        setSearch({ registration: registration.id }, { replace: true });
        refresh();
        void queryClient.invalidateQueries({ queryKey: ['registration-payment'] });
      }
    }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [search, setSearch, registration.id, queryClient, refresh]);

  const pending = data?.transfers.some(t => t.status === 'pending');
  const depositConfirmed = Number(registration.amount_paid) >= Number(registration.initial_payment_amount);
  async function pay() {
    setBusy(true);
    try {
      const { data, error } = await registrationDb.functions.invoke('paystack-init', { body: {
        invoice_id: registration.invoice_id,
        callback_url: `${window.location.origin}/enroll?registration=${registration.id}`,
      } });
      if (error || !data?.authorization_url) throw error || new Error(data?.error || 'Could not start checkout');
      sessionStorage.setItem(`registration-payment-${registration.id}`, data.reference);
      window.location.assign(data.authorization_url);
    } catch (error) { toast.error(registrationError(error, 'Could not start payment')); setBusy(false); }
  }
  async function checkPayment() {
    const paymentReference = search.get('reference') || sessionStorage.getItem(`registration-payment-${registration.id}`);
    if (!paymentReference) { refresh(); return; }
    setBusy(true);
    try {
      const { data, error } = await registrationDb.functions.invoke('paystack-verify', { body: { reference: paymentReference } });
      if (error || data?.status !== 'success') throw new Error(data?.message || 'Payment is not confirmed yet');
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['registration-payment'] });
      toast.success('Payment confirmed');
    } catch (error) { toast.error(registrationError(error, 'Verification failed')); }
    finally { setBusy(false); }
  }
  async function submitReceipt() {
    if (!file || !user) return;
    setBusy(true);
    try {
      validateReceipt(file);
      const extensions: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
      const path = `${user.id}/${registration.invoice_id}/${crypto.randomUUID()}.${extensions[file.type]}`;
      const { error: uploadError } = await registrationDb.storage.from('registration-receipts').upload(path, file);
      if (uploadError) throw uploadError;
      const { error } = await registrationDb.rpc('submit_registration_receipt', { p_enrollment_id: registration.id, p_path: path, p_reference: reference || null });
      if (error) throw error;
      refresh();
      void queryClient.invalidateQueries({ queryKey: ['registration-payment'] });
      toast.success('Receipt submitted for review');
    } catch (error) { toast.error(registrationError(error, 'Receipt submission failed')); }
    finally { setBusy(false); }
  }
  return <section className="space-y-5 border rounded-xl p-5" aria-label="Registration payment">
    <h2 className="text-xl font-semibold">{registration.program_name}</h2>
    <p className="font-mono text-sm">{registration.registration_number}</p>
    <p>Course fee: <strong>{formatNaira(registration.total_amount)}</strong> · Paid: {formatNaira(registration.amount_paid)}</p>
    <p>Initial payment: <strong>{formatNaira(registration.initial_payment_amount)}</strong></p>
    {data?.parts.map(part => <p key={part.id} className="text-sm">{formatNaira(part.amount)} · {part.due_date} · {part.status}</p>)}
    {registration.registration_payment_option === 'custom' && <div className="rounded-lg bg-muted p-3">
      <p>Custom amount: {registration.custom_amount_status}</p>
      <p className="text-sm">The course fee remains unchanged. An admin must approve your deposit and remaining schedule before access.</p>
      {registration.custom_review_reason && <p className="mt-2">Admin feedback: {registration.custom_review_reason}</p>}
      {registration.custom_amount_status === 'rejected' && <p>Contact {siteConfig.supportEmail} to agree revised terms. Confirmed payments remain credited.</p>}
    </div>}
    {!depositConfirmed && !pending && <>
      {data?.transfers[0]?.status === 'rejected' && <p role="alert">Your receipt was rejected: {data.transfers[0].review_reason || 'Please check the payment details'}. Upload a replacement, or contact support.</p>}
      {siteConfig.onlinePaymentsEnabled && <Button disabled={busy} onClick={pay}>Pay with Paystack</Button>}
      {siteConfig.bankTransfer.enabled && <div className="space-y-3 border-t pt-4">
        <h3 className="font-semibold">Bank transfer</h3>
        <p>{siteConfig.bankTransfer.bankName} · {siteConfig.bankTransfer.accountName} · <strong>{siteConfig.bankTransfer.accountNumber}</strong></p>
        <p className="text-sm">Transfer {formatNaira(registration.initial_payment_amount)} and use {registration.registration_number} as the narration.</p>
        <Label htmlFor="transfer-reference">Transfer reference (optional)</Label>
        <Input id="transfer-reference" value={reference} onChange={e => setReference(e.target.value)} />
        <Label htmlFor="receipt">Receipt (PDF, JPG, PNG, WebP; max 5 MB)</Label>
        <Input id="receipt" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} />
        <Button disabled={busy || !file} onClick={submitReceipt}>Submit transfer receipt</Button>
      </div>}
      {!siteConfig.onlinePaymentsEnabled && !siteConfig.bankTransfer.enabled && <p>Payments are not configured. Contact {siteConfig.supportEmail}.</p>}
    </>}
    {pending && <p role="status">Receipt submitted. Payment review is pending; you can complete your profile now.</p>}
    {depositConfirmed && <p role="status">Initial payment confirmed.</p>}
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" disabled={busy} onClick={checkPayment}>Check payment / refresh status</Button>
      {registration.profile_available && !registration.profile_completed_at && <Button onClick={() => navigate(`/students/${registration.id}`)}>Continue to segment 2</Button>}
      {registration.profile_completed_at && !registration.eligible && <p role="status">Profile complete. Awaiting payment clearance or custom amount approval.</p>}
      {registration.eligible && <Button onClick={() => navigate('/student')}>Open dashboard</Button>}
    </div>
  </section>;
}

export default function EnrollPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [form, setForm] = useState({ full_name: '', phone: '', program_id: '', cohort_id: '', option: 'full', plan: '', custom: '' });
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const progress = useQuery({ queryKey: ['registration-progress', user?.id], queryFn: getRegistrationProgress, enabled: !!user, refetchInterval: 15000 });
  const catalog = useQuery({ queryKey: ['registration-catalog'], queryFn: async () => {
    const [programs, cohorts] = await Promise.all([
      registrationDb.from('programs').select('id,program_name,tuition_fee,registration_plans').eq('active', true).order('program_name'),
      registrationDb.from('cohorts').select('id,program_id,cohort_label,status').in('status', ['active','upcoming']),
    ]);
    if (programs.error || cohorts.error) throw programs.error || cohorts.error;
    return { programs: programs.data as Program[], cohorts: cohorts.data || [] };
  }, enabled: !!user });
  const refresh = useCallback(() => { void queryClient.invalidateQueries({ queryKey: ['registration-progress'] }); }, [queryClient]);
  const registrations = progress.data?.registrations.filter(r => r.registration_flow_version === 2 && r.enrollment_status !== 'cancelled') || [];
  const selected = registrations.find(r => r.id === search.get('registration')) || (!search.has('new') ? registrations.find(r => !r.eligible) : undefined);
  const program = catalog.data?.programs.find(p => p.id === form.program_id);
  const plan = program?.registration_plans.find(p => p.label === form.plan);
  const amounts = program?.tuition_fee && plan ? planAmounts(Number(program.tuition_fee), plan) : [];
  const initial = form.option === 'custom' ? Number(form.custom) : form.option === 'installment' ? amounts[0]?.amount : Number(program?.tuition_fee || 0);
  async function start(event: React.FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const { data, error } = await registrationDb.rpc('start_registration', { p_program_id: form.program_id,
        p_full_name: form.full_name, p_phone: form.phone, p_cohort_id: form.cohort_id || null,
        p_option: form.option, p_plan_label: form.plan || null, p_custom_amount: form.option === 'custom' ? Number(form.custom) : null });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['registration-progress'] });
      const progress = await getRegistrationProgress();
      if (progress.registrations.find(r => r.id === data)?.registration_flow_version === 1) {
        toast.info('You already have an enrollment for this course'); navigate('/student'); return;
      }
      setSearch({ registration: data });
    } catch (error) { toast.error(registrationError(error, 'Could not start registration')); }
    finally { setSaving(false); }
  }
  if (loading) return <p className="p-8">Loading…</p>;
  return <main className="min-h-screen bg-background px-4 py-10"><div className="max-w-2xl mx-auto space-y-6">
    <h1 className="text-3xl font-heading font-bold">Student registration</h1>
    <p>1. Choose your course and pay → 2. Complete your profile → Dashboard</p>
    {!user ? <div className="space-y-4 border rounded-xl p-6"><p>Create an account or sign in to save your registration and make payment.</p><Button onClick={() => navigate('/login?next=/enroll')}>Create account / sign in</Button></div> : <>
      <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
      {(progress.error || catalog.error) && <p role="alert">Unable to load registration. Please reload to try again.</p>}
      {progress.isPending || catalog.isPending ? <p>Loading registration…</p> : selected ? <PaymentStep registration={selected} refresh={refresh} /> :
        <form onSubmit={start} className="border rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-semibold">Segment 1: Course and payment</h2>
          <Label htmlFor="full-name">Full name</Label><Input id="full-name" required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
          <Label>Email</Label><Input aria-label="Email" value={user.email || ''} disabled />
          <Label htmlFor="whatsapp">WhatsApp number</Label><Input id="whatsapp" required type="tel" pattern="\+[1-9][0-9]{6,14}" placeholder="+234…" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <Label htmlFor="course">Course</Label><select id="course" className="w-full border rounded-md p-2 bg-background" required value={form.program_id} onChange={e => setForm({ ...form, program_id: e.target.value, cohort_id: '', option: 'full', plan: '' })}>
            <option value="">Select a course</option>{catalog.data?.programs.map(p => <option key={p.id} value={p.id} disabled={!p.tuition_fee}>{p.program_name} — {p.tuition_fee ? formatNaira(p.tuition_fee) : 'Pricing pending'}</option>)}
          </select>
          {program && <>
            <Label htmlFor="cohort">Cohort (optional)</Label><select id="cohort" className="w-full border rounded-md p-2 bg-background" value={form.cohort_id} onChange={e => setForm({ ...form, cohort_id: e.target.value })}><option value="">Assign an available cohort</option>{catalog.data?.cohorts.filter(c => c.program_id === program.id).map(c => <option key={c.id} value={c.id}>{c.cohort_label}</option>)}</select>
            <Label htmlFor="payment-option">Payment option</Label><select id="payment-option" className="w-full border rounded-md p-2 bg-background" value={form.option} onChange={e => setForm({ ...form, option: e.target.value })}><option value="full">Full payment</option>{program.registration_plans.length > 0 && <option value="installment">Installments</option>}<option value="custom">Custom initial amount (admin approval)</option></select>
            {form.option === 'installment' && <><Label htmlFor="plan">Installment plan</Label><select id="plan" required className="w-full border rounded-md p-2 bg-background" value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}><option value="">Choose a plan</option>{program.registration_plans.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}</select>{amounts.map((part, i) => <p key={i} className="text-sm">{formatNaira(part.amount)} — {part.days === 0 ? 'due now' : `${part.days} days after registration`}</p>)}</>}
            {form.option === 'custom' && <><Label htmlFor="custom-amount">Custom initial payment</Label><Input id="custom-amount" required type="number" step="0.01" min="1000" max={Number(program.tuition_fee) - 1000} value={form.custom} onChange={e => setForm({ ...form, custom: e.target.value })} /><p className="text-sm">Both your deposit and remaining balance must be at least ₦1,000. Admin approval is required after payment.</p></>}
            <div className="rounded-lg bg-muted p-4"><p>Total: {formatNaira(Number(program.tuition_fee))}</p><p>Pay now: {formatNaira(initial || 0)}</p><p>Remaining: {formatNaira(Number(program.tuition_fee) - (initial || 0))}</p></div>
          </>}
          <Button type="submit" disabled={saving || !program?.tuition_fee}>{saving ? 'Saving…' : 'Save and proceed to payment'}</Button>
        </form>}
      {registrations.length > 0 && <section className="space-y-2"><h2 className="font-semibold">Your registrations</h2>{registrations.map(r => <Button key={r.id} variant="outline" className="w-full justify-start" onClick={() => setSearch({ registration: r.id })}>{r.registration_number} · {r.program_name}</Button>)}</section>}
      <div className="flex gap-4"><Button variant="outline" onClick={() => setSearch({ new: '1' })}>Register for another course</Button>{progress.data?.dashboard_access && <Link className="text-primary underline self-center" to="/student">Dashboard</Link>}</div>
    </>}
  </div></main>;
}
