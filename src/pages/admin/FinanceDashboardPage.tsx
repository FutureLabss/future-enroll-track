import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Banknote, Receipt, Wallet } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
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

type Mode = 'preset' | 'custom';

export default function FinanceDashboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('preset');
  const [months, setMonths] = useState(12);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setErrorMsg(null);
      const args: any =
        mode === 'custom' && startDate && endDate
          ? {
              p_months: 12,
              p_start_date: format(startDate, 'yyyy-MM-dd'),
              p_end_date: format(endDate, 'yyyy-MM-dd'),
            }
          : { p_months: months };
      const { data, error } = await supabase.rpc('get_finance_summary', args);
      if (!active) return;
      if (error) {
        console.error('Finance RPC error:', error);
        setErrorMsg(error.message || 'Could not load finance data. Make sure you are signed in as an admin.');
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
  }, [months, mode, startDate, endDate]);

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
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-xs">Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger className="w-[140px] mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="preset">Preset</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === 'preset' ? (
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
            ) : (
              <>
                <div>
                  <Label className="text-xs">From</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn('w-[160px] mt-1 justify-start text-left font-normal', !startDate && 'text-muted-foreground')}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, 'MMM yyyy') : 'Pick start'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus className={cn('p-3 pointer-events-auto')} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn('w-[160px] mt-1 justify-start text-left font-normal', !endDate && 'text-muted-foreground')}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, 'MMM yyyy') : 'Pick end'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={endDate} onSelect={setEndDate} disabled={(d) => (startDate ? d < startDate : false)} initialFocus className={cn('p-3 pointer-events-auto')} />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}
          </div>
        }
      />

      {errorMsg && (
        <div className="mb-4 p-4 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm">
          {errorMsg}
        </div>
      )}

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
