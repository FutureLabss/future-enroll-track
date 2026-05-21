import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useMonthDetail } from '@/hooks/useMonthDetail';

const fmt = (val: number) => `₦${Number(val || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtMonth = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

function EmptyState({ label }: { label: string }) {
  return <p className="text-center text-muted-foreground py-10 text-sm">No {label} this month.</p>;
}

function SectionTotal({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 mb-3">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="font-semibold">{fmt(amount)}</span>
    </div>
  );
}

interface RowProps {
  left: React.ReactNode;
  right: React.ReactNode;
  sub?: React.ReactNode;
}

function DetailRow({ left, right, sub }: RowProps) {
  return (
    <div className="flex items-start justify-between rounded-lg border border-border px-3 py-2.5 gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{left}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <div className="text-sm font-semibold shrink-0">{right}</div>
    </div>
  );
}

interface Props {
  month: string | null;
  onClose: () => void;
}

export function MonthDetailSheet({ month, onClose }: Props) {
  const { payments, otherIncome, expenses, payroll, loading } = useMonthDetail(month);

  const totalPayments = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalOtherIncome = otherIncome.reduce((s, o) => s + Number(o.amount || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalPayroll = payroll.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <Sheet open={!!month} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>{month ? fmtMonth(month) : ''} — Transaction Detail</SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin h-7 w-7 text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="payments">
            <TabsList className="mb-4 w-full grid grid-cols-4">
              <TabsTrigger value="payments">Tuition <span className="ml-1 text-xs opacity-70">({payments.length})</span></TabsTrigger>
              <TabsTrigger value="other">Other <span className="ml-1 text-xs opacity-70">({otherIncome.length})</span></TabsTrigger>
              <TabsTrigger value="expenses">Expenses <span className="ml-1 text-xs opacity-70">({expenses.length})</span></TabsTrigger>
              <TabsTrigger value="payroll">Payroll <span className="ml-1 text-xs opacity-70">({payroll.length})</span></TabsTrigger>
            </TabsList>

            {/* TUITION PAYMENTS */}
            <TabsContent value="payments" className="space-y-2">
              {payments.length > 0 && <SectionTotal label="Total tuition received" amount={totalPayments} />}
              {payments.length === 0 ? (
                <EmptyState label="tuition payments" />
              ) : payments.map(p => (
                <DetailRow
                  key={p.id}
                  left={p.invoices?.enrollments?.full_name || 'Unknown student'}
                  right={fmt(Number(p.amount))}
                  sub={`${p.paid_at ? fmtDate(p.paid_at) : '—'} · ${p.invoices?.invoice_number || '—'} · ${p.invoices?.enrollments?.programs?.program_name || '—'}`}
                />
              ))}
            </TabsContent>

            {/* OTHER INCOME */}
            <TabsContent value="other" className="space-y-2">
              {otherIncome.length > 0 && <SectionTotal label="Total other income" amount={totalOtherIncome} />}
              {otherIncome.length === 0 ? (
                <EmptyState label="other income" />
              ) : otherIncome.map(o => (
                <DetailRow
                  key={o.id}
                  left={o.payer_name || 'Unknown'}
                  right={fmt(Number(o.amount))}
                  sub={`${fmtDate(o.payment_date)} · ${o.category} · ${o.payment_reference || '—'}`}
                />
              ))}
            </TabsContent>

            {/* EXPENSES */}
            <TabsContent value="expenses" className="space-y-2">
              {expenses.length > 0 && <SectionTotal label="Total expenses" amount={totalExpenses} />}
              {expenses.length === 0 ? (
                <EmptyState label="expenses" />
              ) : expenses.map(e => (
                <DetailRow
                  key={e.id}
                  left={e.vendor_name || e.category}
                  right={fmt(Number(e.amount))}
                  sub={`${fmtDate(e.payment_date)} · ${e.category} · ${e.notes || '—'}`}
                />
              ))}
            </TabsContent>

            {/* PAYROLL */}
            <TabsContent value="payroll" className="space-y-2">
              {payroll.length > 0 && <SectionTotal label="Total payroll" amount={totalPayroll} />}
              {payroll.length === 0 ? (
                <EmptyState label="payroll runs" />
              ) : payroll.map(r => (
                <DetailRow
                  key={r.id}
                  left={r.staff?.full_name || 'Unknown staff'}
                  right={fmt(Number(r.amount))}
                  sub={
                    <span className="flex items-center gap-1.5">
                      {r.staff?.role_title && <span>{r.staff.role_title}</span>}
                      <Badge variant="outline" className={`text-xs capitalize ${r.status === 'paid' ? 'text-success border-success/30' : 'text-warning border-warning/30'}`}>
                        {r.status}
                      </Badge>
                    </span>
                  }
                />
              ))}
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
