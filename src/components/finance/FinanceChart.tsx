import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FinanceRow } from '@/hooks/useFinanceSummary';

const fmt = (val: number) => `₦${Number(val || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const fmtMonth = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' });

interface Props {
  rows: FinanceRow[];
  loading: boolean;
}

export function FinanceChart({ rows, loading }: Props) {
  const data = useMemo(() => [...rows]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(r => ({
      month: fmtMonth(r.month),
      Revenue: r.revenue + r.other_income_total,
      Payroll: r.payroll_total,
      Expenses: r.expenses_total,
      Profit: r.profit,
    })), [rows]);

  return (
    <Card className="mb-6">
      <CardHeader><CardTitle>Monthly Breakdown</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
        ) : data.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No data yet.</div>
        ) : (
          <div className="h-[320px] w-full">
            <ResponsiveContainer>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `₦${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Payroll" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expenses" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Profit" fill="hsl(var(--secondary-foreground))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
