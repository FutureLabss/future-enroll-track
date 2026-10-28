import { Link } from 'react-router-dom';
import type { PausedEnrollment } from '@/hooks/usePausedAccess';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Lock } from 'lucide-react';

const money = (n: number) => `₦${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const days = (due: string) => Math.max(0, Math.floor((Date.now() - new Date(`${due}T00:00:00`).getTime()) / 86_400_000));

// Shown instead of the classroom when access is paused for an overdue payment.
export function AccessPausedCard({ paused, classroomName }: { paused: PausedEnrollment; classroomName: string }) {
  return (
    <Card className="mx-auto mt-10 max-w-xl border-destructive/40">
      <CardContent className="space-y-4 pt-8 text-center">
        <Lock className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="font-heading text-xl font-semibold">Your access to {classroomName} is paused</h1>
        <p className="text-muted-foreground">
          Your payment for {paused.program_name} is {days(paused.due_date)} days overdue, with {money(paused.outstanding)} outstanding.
          Classes, materials and assignments open again as soon as you pay, or once you agree a payment date with the front desk.
        </p>
        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild><Link to={`/student/invoices/${paused.invoice_id}?pay=1`}>Pay now</Link></Button>
          <Button asChild variant="outline"><Link to="/student/invoices">See my invoices</Link></Button>
        </div>
        <p className="text-xs text-muted-foreground">Paid by bank transfer? Upload the receipt on your invoice so we can confirm it.</p>
      </CardContent>
    </Card>
  );
}

// Dashboard banner listing every paused enrollment.
export function AccessPausedBanner({ paused }: { paused: PausedEnrollment[] }) {
  if (paused.length === 0) return null;
  return (
    <div className="mb-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
      {paused.map(p => (
        <div key={p.enrollment_id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span><span className="font-medium">Your {p.program_name} classroom is paused.</span> {money(p.outstanding)} is {days(p.due_date)} days overdue.</span>
          </p>
          <Button asChild size="sm"><Link to={`/student/invoices/${p.invoice_id}?pay=1`}>Pay now</Link></Button>
        </div>
      ))}
    </div>
  );
}
