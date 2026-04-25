import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Banknote, Receipt, Wallet } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

type Row = {
  month: string;
  revenue: number;
  other_income_total: number;
  payroll_total: number;
  expenses_total: number;
  profit: number;
};

const formatCurrency = (val: number) => `₦${Number(val || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const formatMonth = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

export default function FinanceDashboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(12);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_finance_summary', { p_months: months });
      if (!active) return;
      if (error) {
        console.error(error);
        setRows([]);
      } else {
        const normalized = (data || []).map((r: any) => ({
          month: r.month,
          revenue: Number(r.revenue) || 0,
          other_income_total: Number(r.other_income_total) || 0,
          payroll_total: Number(r.payroll_total) || 0,
          expenses_total: Number(r.expenses_total) || 0,
          profit: Number(r.profit) || 0,
        }));
        setRows(normalized);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [months]);

  const totals = rows.reduce(
    (acc, r) => {
      acc.revenue += r.revenue + r.other_income_total;
      acc.payroll += r.payroll_total;
      acc.expenses += r.expenses_total;
      acc.profit += r.profit;
      return acc;
    },
    { revenue: 0, payroll: 0, expenses: 0, profit: 0 }
  );

  const chartData = [...rows]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(r => ({
      month: formatMonth(r.month),
      Revenue: r.revenue + r.other_income_total,
      Payroll: r.payroll_total,
      Expenses: r.expenses_total,
      Profit: r.profit,
    }));

  return (
    <div>
      <PageHeader
        title="Finance Dashboard"
        description="Monthly revenue, payroll, expenses and profit"
        actions={
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs">Period</Label>
              <Select value={String(months)} onValueChange={v => setMonths(Number(v))}>
                <SelectTrigger className="w-[160px] mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Last 3 months</SelectItem>
                  <SelectItem value="6">Last 6 months</SelectItem>
                  <SelectItem value="12">Last 12 months</SelectItem>
                  <SelectItem value="24">Last 24 months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Revenue" value={formatCurrency(totals.revenue)} icon={Wallet} />
        <StatCard title="Total Payroll" value={formatCurrency(totals.payroll)} icon={Banknote} />
        <StatCard title="Total Expenses" value={formatCurrency(totals.expenses)} icon={Receipt} />
        <StatCard title="Net Profit" value={formatCurrency(totals.profit)} icon={TrendingUp} />
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>Monthly Breakdown</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : chartData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No data yet.</div>
          ) : (
            <div className="h-[320px] w-full">
              <ResponsiveContainer>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₦${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
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

      <Card>
        <CardHeader><CardTitle>Per-Month Details</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Tuition Revenue</TableHead>
                <TableHead className="text-right">Other Income</TableHead>
                <TableHead className="text-right">Payroll</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No data</TableCell></TableRow>
              ) : rows.map(r => (
                <TableRow key={r.month}>
                  <TableCell className="font-medium">{formatMonth(r.month)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.revenue)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.other_income_total)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.payroll_total)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.expenses_total)}</TableCell>
                  <TableCell className={`text-right font-semibold ${r.profit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {formatCurrency(r.profit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
