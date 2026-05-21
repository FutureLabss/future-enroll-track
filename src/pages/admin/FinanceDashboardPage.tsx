import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { FinanceFilterBar } from '@/components/finance/FinanceFilterBar';
import { FinanceSummaryCards } from '@/components/finance/FinanceSummaryCards';
import { FinanceChart } from '@/components/finance/FinanceChart';
import { MonthSummaryTable } from '@/components/finance/MonthSummaryTable';
import { MonthDetailSheet } from '@/components/finance/MonthDetailSheet';
import EnrollmentTargets from '@/components/admin/EnrollmentTargets';
import { useFinanceSummary, FilterMode } from '@/hooks/useFinanceSummary';

export default function FinanceDashboardPage() {
  const [mode, setMode] = useState<FilterMode>('preset');
  const [months, setMonths] = useState(12);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const { rows, loading, error, totals } = useFinanceSummary({ mode, months, startDate, endDate });

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

      {error && (
        <div className="mb-4 p-4 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <FinanceSummaryCards totals={totals} />

      <FinanceChart rows={rows} loading={loading} />

      <div className="mb-6">
        <EnrollmentTargets />
      </div>

      <MonthSummaryTable
        rows={rows}
        selectedMonth={selectedMonth}
        onSelectMonth={month => setSelectedMonth(prev => prev === month ? null : month)}
      />

      <MonthDetailSheet
        month={selectedMonth}
        onClose={() => setSelectedMonth(null)}
      />
    </div>
  );
}
