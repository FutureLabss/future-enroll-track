import { useMemo, useState } from 'react';
import { useProgrammeMargin, type ProgrammeMarginRow } from '@/hooks/useProgrammeMargin';
import { DataTable } from '@/components/shared/DataTable';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const money = (n: number) => `₦${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

// Periods offered: year to date, the last 12 months one by one, and last year.
export function marginPeriods(today = new Date()) {
  const y = today.getFullYear();
  const periods = [{ value: 'ytd', label: `${y} so far`, from: `${y}-01-01`, to: iso(today) }];
  for (let i = 0; i < 12; i++) {
    const start = new Date(Date.UTC(y, today.getMonth() - i, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
    periods.push({
      value: iso(start).slice(0, 7),
      label: start.toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      from: iso(start),
      to: iso(end),
    });
  }
  periods.push({ value: String(y - 1), label: String(y - 1), from: `${y - 1}-01-01`, to: `${y - 1}-12-31` });
  return periods;
}

export function ProgrammeMarginSection() {
  const periods = useMemo(() => marginPeriods(), []);
  const [period, setPeriod] = useState('ytd');
  const p = periods.find(x => x.value === period) ?? periods[0];
  const { data, loading, error } = useProgrammeMargin(p.from, p.to, true);

  const totals = data.rows.reduce((a, r) => ({ revenue: a.revenue + Number(r.revenue), pay: a.pay + Number(r.tutor_pay) }), { revenue: 0, pay: 0 });
  const afterOverhead = totals.revenue - totals.pay - Number(data.overhead.amount);

  const columns = useMemo(() => [
    { key: 'program_name', header: 'Programme', render: (r: ProgrammeMarginRow) => (
      <div>
        <p className="font-medium">{r.program_name}</p>
        <p className="text-xs text-muted-foreground">{r.paying_students} paying student{r.paying_students === 1 ? '' : 's'}</p>
      </div>
    ) },
    { key: 'revenue', header: 'Fees received', render: (r: ProgrammeMarginRow) => money(r.revenue) },
    { key: 'tutor_pay', header: 'Tutor pay', render: (r: ProgrammeMarginRow) => (
      <div>
        <p>{money(r.tutor_pay)}</p>
        {r.tutors.length > 0 && <p className="text-xs text-muted-foreground">{r.tutors.map(t => `${t.name.trim()} ${money(t.amount)}`).join(', ')}</p>}
      </div>
    ) },
    { key: 'margin', header: 'After tutor pay', render: (r: ProgrammeMarginRow) => {
      const m = Number(r.revenue) - Number(r.tutor_pay);
      return <span className={m < 0 ? 'font-medium text-destructive' : 'font-medium text-success'}>{money(m)}</span>;
    } },
    { key: 'ratio', header: 'Pay as % of fees', render: (r: ProgrammeMarginRow) =>
      Number(r.revenue) > 0 ? `${Math.round((Number(r.tutor_pay) / Number(r.revenue)) * 100)}%` : r.tutor_pay > 0 ? 'No fees' : '—' },
  ], []);

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold">Fees vs tutor pay by programme</h2>
          <p className="text-sm text-muted-foreground">Fees actually received (bank date where known). A tutor's pay is split evenly across the programmes they teach.</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="sm:w-48" aria-label="Period"><SelectValue /></SelectTrigger>
          <SelectContent>{periods.map(x => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {error && <p className="text-sm text-destructive">Could not load: {(error as Error).message}</p>}
      {loading ? <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div> : (
        <>
          <DataTable columns={columns} data={data.rows} emptyMessage="No fees or tutor pay in this period" />
          <div className="mt-3 grid gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-4">
            <div><p className="text-muted-foreground">Fees received</p><p className="font-semibold">{money(totals.revenue)}</p></div>
            <div><p className="text-muted-foreground">Tutor pay</p><p className="font-semibold">{money(totals.pay)}</p></div>
            <div>
              <p className="text-muted-foreground">Overhead (non-teaching pay)</p>
              <p className="font-semibold">{money(data.overhead.amount)}</p>
              {data.overhead.staff.length > 0 && <p className="text-xs text-muted-foreground">{data.overhead.staff.map(s => `${s.name.trim()} ${money(s.amount)}`).join(', ')}</p>}
            </div>
            <div><p className="text-muted-foreground">Left after all pay</p><p className={`font-semibold ${afterOverhead < 0 ? 'text-destructive' : 'text-success'}`}>{money(afterOverhead)}</p></div>
          </div>
        </>
      )}
    </section>
  );
}
