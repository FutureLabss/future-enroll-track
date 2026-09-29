import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FinanceRow } from '@/hooks/useFinanceSummary';

const fmt = (val: number) => `₦${Number(val || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const fmtMonth = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' });

interface Props {
  rows: FinanceRow[];
  selectedMonth: string | null;
  onSelectMonth: (month: string) => void;
}

export function MonthSummaryTable({ rows, selectedMonth, onSelectMonth }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Per-Month Details</CardTitle>
        <p className="text-sm text-muted-foreground">Click a row to see the individual payments for that month.</p>
      </CardHeader>
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
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No data</TableCell>
              </TableRow>
            ) : (
              rows.map(r => (
                <TableRow
                  key={r.month}
                  className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedMonth === r.month ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                  onClick={() => onSelectMonth(r.month)}
                >
                  <TableCell className="font-medium">{fmtMonth(r.month)}</TableCell>
                  <TableCell className="text-right">{fmt(r.revenue)}</TableCell>
                  <TableCell className="text-right">{fmt(r.other_income_total)}</TableCell>
                  <TableCell className="text-right">{fmt(r.payroll_total)}</TableCell>
                  <TableCell className="text-right">{fmt(r.expenses_total)}</TableCell>
                  <TableCell className={`text-right font-semibold ${r.profit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {fmt(r.profit)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
