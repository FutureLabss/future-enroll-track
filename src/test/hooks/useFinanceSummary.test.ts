import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: mockRpc },
}));

import { useFinanceSummary } from '@/hooks/useFinanceSummary';

const RAW_ROWS = [
  { month: '2026-01-01', revenue: '500000', other_income_total: '50000', payroll_total: '200000', expenses_total: '30000', profit: '320000' },
  { month: '2026-02-01', revenue: '400000', other_income_total: '0',     payroll_total: '200000', expenses_total: '20000', profit: '180000' },
];

beforeEach(() => {
  mockRpc.mockReset();
});

describe('useFinanceSummary', () => {
  it('normalises raw string numbers from RPC into Numbers', async () => {
    mockRpc.mockResolvedValue({ data: RAW_ROWS, error: null });
    const { result } = renderHook(() => useFinanceSummary({ mode: 'preset', months: 12 }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.rows[0].revenue).toBe(500_000);
    expect(result.current.rows[0].other_income_total).toBe(50_000);
  });

  it('computes totals: revenue = tuition + other_income_total', async () => {
    mockRpc.mockResolvedValue({ data: RAW_ROWS, error: null });
    const { result } = renderHook(() => useFinanceSummary({ mode: 'preset', months: 12 }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // (500k + 50k) + (400k + 0) = 950k
    expect(result.current.totals.revenue).toBe(950_000);
    expect(result.current.totals.payroll).toBe(400_000);
    expect(result.current.totals.expenses).toBe(50_000);
    expect(result.current.totals.profit).toBe(500_000);
  });

  it('sets error and clears rows on RPC failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const { result } = renderHook(() => useFinanceSummary({ mode: 'preset', months: 12 }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('permission denied');
    expect(result.current.rows).toHaveLength(0);
  });

  it('calls RPC with p_months in preset mode', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    renderHook(() => useFinanceSummary({ mode: 'preset', months: 6 }));

    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(mockRpc).toHaveBeenCalledWith('get_finance_summary', { p_months: 6 });
  });

  it('calls RPC with date range in custom mode', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const start = new Date('2026-01-01');
    const end   = new Date('2026-03-31');

    renderHook(() => useFinanceSummary({ mode: 'custom', months: 12, startDate: start, endDate: end }));

    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(mockRpc).toHaveBeenCalledWith('get_finance_summary', {
      p_months: 12,
      p_start_date: '2026-01-01',
      p_end_date: '2026-03-31',
    });
  });

  it('handles null/missing numeric fields gracefully', async () => {
    mockRpc.mockResolvedValue({
      data: [{ month: '2026-01-01', revenue: null, other_income_total: undefined, payroll_total: '', expenses_total: null, profit: null }],
      error: null,
    });
    const { result } = renderHook(() => useFinanceSummary({ mode: 'preset', months: 12 }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const row = result.current.rows[0];
    expect(row.revenue).toBe(0);
    expect(row.other_income_total).toBe(0);
    expect(row.payroll_total).toBe(0);
  });
});
