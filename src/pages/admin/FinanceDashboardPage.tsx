import { useCallback, useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { FinanceFilterBar } from '@/components/finance/FinanceFilterBar';
import { FinanceSummaryCards } from '@/components/finance/FinanceSummaryCards';
import { FinanceChart } from '@/components/finance/FinanceChart';
import { MonthSummaryTable } from '@/components/finance/MonthSummaryTable';
import { MonthDetailSheet } from '@/components/finance/MonthDetailSheet';
import EnrollmentTargets from '@/components/admin/EnrollmentTargets';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Label } from '@/components/ui/label';
import { useFinanceSummary, FilterMode } from '@/hooks/useFinanceSummary';

type RevenueBasis = 'due' | 'paid';

export default function FinanceDashboardPage() {
  const [mode, setMode] = useState<FilterMode>('preset');
  const [months, setMonths] = useState(12);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  // Cash-basis (paid_at) is the default: revenue counts when the money actually lands,
  // matching how expenses/payroll are already bucketed here (payment_date/pay_month) —
  // due-date (accrual) stays available as a second view. See CLAUDE.md "Finance bucketing".
  const [revenueBasis, setRevenueBasis] = useState<RevenueBasis>('paid');

  const { rows, loading, error, totals } = useFinanceSummary({ mode, months, startDate, endDate });

  // Payment-date basis re-buckets FutureLabs installments by paid_at instead of due_date,
  // so a payment approved this month shows up this month rather than under whenever it
  // was originally due. Derived once here so the chart/cards/table below stay unchanged.
  const displayRows = useMemo(() => rows.map(r => {
    const revenue = revenueBasis === 'paid' ? r.revenue_cash : r.revenue;
    return { ...r, revenue, profit: revenue + r.other_income_total - r.payroll_total - r.expenses_total };
  }), [rows, revenueBasis]);

  const displayTotals = useMemo(() => {
    const revenue = revenueBasis === 'paid' ? totals.revenueCash : totals.revenue;
    return { ...totals, revenue, profit: revenue - totals.payroll - totals.expenses };
  }, [totals, revenueBasis]);

  const handleSelectMonth = useCallback((month: string) => {
    setSelectedMonth(prev => prev === month ? null : month);
  }, []);

  return (
    <div>
      <PageHeader
        title="Finance Dashboard"
        description="Monthly revenue, payroll, expenses and profit"
        actions={
          <FinanceFilterBar
            mode={mode}
            onModeChange={setMode}
            months={months}
            onMonthsChange={setMonths}
            startDate={startDate}
            onStartDateChange={setStartDate}
            endDate={endDate}
            onEndDateChange={setEndDate}
          />
        }
      />

      <div className="mb-4">
        <Label className="text-xs">Revenue basis</Label>
        <div className="flex items-center gap-2 mt-1">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={revenueBasis}
            onValueChange={v => v && setRevenueBasis(v as RevenueBasis)}
          >
            <ToggleGroupItem value="due">Due date</ToggleGroupItem>
            <ToggleGroupItem value="paid">Payment date</ToggleGroupItem>
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">
            {revenueBasis === 'due'
              ? 'Counted in the month it was originally owed.'
              : 'Counted in the month the money actually came in.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <FinanceSummaryCards totals={displayTotals} />

      <FinanceChart rows={displayRows} loading={loading} />

      <div className="mb-6">
        <EnrollmentTargets />
      </div>

      <MonthSummaryTable
        rows={displayRows}
        selectedMonth={selectedMonth}
        onSelectMonth={handleSelectMonth}
      />

      <MonthDetailSheet
        month={selectedMonth}
        onClose={() => setSelectedMonth(null)}
        basis={revenueBasis}
      />
    </div>
  );
}
