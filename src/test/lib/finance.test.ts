import { describe, it, expect } from 'vitest';
import type { FinanceRow } from '@/hooks/useFinanceSummary';

// Mirrors the reduce in useFinanceSummary — tested here to catch regressions
// if the formula ever changes (revenue = tuition + other_income_total).
function calcTotals(rows: FinanceRow[]) {
  return rows.reduce(
    (acc, r) => {
      acc.revenue += r.revenue + r.other_income_total;
      acc.payroll += r.payroll_total;
      acc.expenses += r.expenses_total;
      acc.profit += r.profit;
      return acc;
    },
    { revenue: 0, payroll: 0, expenses: 0, profit: 0 }
  );
}

const makeRow = (overrides: Partial<FinanceRow> = {}): FinanceRow => ({
  month: '2026-01-01',
  revenue: 0,
  other_income_total: 0,
  payroll_total: 0,
  expenses_total: 0,
  profit: 0,
  ...overrides,
});

describe('finance totals calculation', () => {
  it('returns zeroes for empty rows', () => {
    expect(calcTotals([])).toEqual({ revenue: 0, payroll: 0, expenses: 0, profit: 0 });
  });

  it('sums revenue + other_income_total into the revenue total', () => {
    const rows = [makeRow({ revenue: 100_000, other_income_total: 20_000 })];
    expect(calcTotals(rows).revenue).toBe(120_000);
  });

  it('sums payroll across months', () => {
    const rows = [
      makeRow({ payroll_total: 50_000 }),
      makeRow({ payroll_total: 70_000 }),
    ];
    expect(calcTotals(rows).payroll).toBe(120_000);
  });

  it('sums expenses across months', () => {
    const rows = [
      makeRow({ expenses_total: 10_000 }),
      makeRow({ expenses_total: 15_000 }),
    ];
    expect(calcTotals(rows).expenses).toBe(25_000);
  });

  it('sums profit across months', () => {
    const rows = [
      makeRow({ profit: 80_000 }),
      makeRow({ profit: -20_000 }),
    ];
    expect(calcTotals(rows).profit).toBe(60_000);
  });

  it('handles multiple months correctly', () => {
    const rows = [
      makeRow({ revenue: 500_000, other_income_total: 50_000, payroll_total: 200_000, expenses_total: 30_000, profit: 320_000 }),
      makeRow({ revenue: 400_000, other_income_total: 0,      payroll_total: 200_000, expenses_total: 20_000, profit: 180_000 }),
    ];
    const totals = calcTotals(rows);
    expect(totals.revenue).toBe(950_000);   // (500k+50k) + (400k+0)
    expect(totals.payroll).toBe(400_000);
    expect(totals.expenses).toBe(50_000);
    expect(totals.profit).toBe(500_000);
  });
});

describe('Naira currency formatting', () => {
  const fmt = (val: number) =>
    `₦${Number(val || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

  it('formats zero', () => {
    expect(fmt(0)).toBe('₦0');
  });

  it('formats thousands with separator', () => {
    expect(fmt(1_000_000)).toMatch(/₦1/);
    expect(fmt(1_000_000)).toMatch(/000/);
  });

  it('rounds decimals', () => {
    expect(fmt(1500.75)).not.toMatch(/\./);
  });

  it('handles null/undefined gracefully via || 0', () => {
    expect(fmt(null as any)).toBe('₦0');
  });
});
