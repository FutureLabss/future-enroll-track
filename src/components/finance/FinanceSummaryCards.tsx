import { StatCard } from '@/components/shared/StatCard';
import { TrendingUp, Banknote, Receipt, Wallet } from 'lucide-react';

const fmt = (val: number) => `₦${Number(val || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

interface Totals {
  revenue: number;
  payroll: number;
  expenses: number;
  profit: number;
}

export function FinanceSummaryCards({ totals }: { totals: Totals }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard title="Total Revenue" value={fmt(totals.revenue)} icon={Wallet} />
      <StatCard title="Total Payroll" value={fmt(totals.payroll)} icon={Banknote} />
      <StatCard title="Total Expenses" value={fmt(totals.expenses)} icon={Receipt} />
      <StatCard title="Net Profit" value={fmt(totals.profit)} icon={TrendingUp} />
    </div>
  );
}
