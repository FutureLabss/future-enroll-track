import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '@/test/testUtils';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

import { useMonthDetail } from '@/hooks/useMonthDetail';

type Call = { method: string; args: unknown[] };
type QueryResult = { data: unknown[]; error: null };

interface MockChain extends PromiseLike<QueryResult> {
  select: (...args: unknown[]) => MockChain;
  eq: (...args: unknown[]) => MockChain;
  neq: (...args: unknown[]) => MockChain;
  gte: (...args: unknown[]) => MockChain;
  lt: (...args: unknown[]) => MockChain;
  order: (...args: unknown[]) => Promise<QueryResult>;
  catch: (fn: (reason: unknown) => unknown) => Promise<unknown>;
}

// Chainable mock that records every method call (so tests can assert on
// exactly which columns/filters a query used) and resolves with `data`
// whenever the chain is awaited or `.order()` is called.
function makeChain(data: unknown[] = []): { calls: Call[]; builder: MockChain } {
  const calls: Call[] = [];
  const result: QueryResult = { data, error: null };
  const builder = {} as MockChain;
  for (const method of ['select', 'eq', 'neq', 'gte', 'lt'] as const) {
    builder[method] = (...args: unknown[]) => { calls.push({ method, args }); return builder; };
  }
  builder.order = (...args: unknown[]) => { calls.push({ method: 'order', args }); return Promise.resolve(result); };
  builder.then = ((fn: (r: QueryResult) => unknown, rej: (reason: unknown) => unknown) => Promise.resolve(result).then(fn, rej)) as MockChain['then'];
  builder.catch = (fn: (reason: unknown) => unknown) => Promise.resolve(result).catch(fn);
  return { calls, builder };
}

function setupChains(overrides: Record<string, unknown[]> = {}) {
  const chains: Record<string, ReturnType<typeof makeChain>> = {
    installments: makeChain(overrides.installments ?? []),
    payments: makeChain(overrides.payments ?? []),
    other_income: makeChain(overrides.other_income ?? []),
    expenses: makeChain(overrides.expenses ?? []),
    payroll_runs: makeChain(overrides.payroll_runs ?? []),
  };
  mockFrom.mockImplementation((table: string) => chains[table]?.builder ?? makeChain([]).builder);
  return chains;
}

function hasCall(calls: Call[], method: string, ...args: unknown[]) {
  return calls.some(c => c.method === method && JSON.stringify(c.args) === JSON.stringify(args));
}

beforeEach(() => {
  mockFrom.mockReset();
});

describe('useMonthDetail', () => {
  it('excludes cancelled invoices on both the installments and payments legs', async () => {
    const chains = setupChains();
    const { result } = renderHook(() => useMonthDetail('2026-03-01'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(hasCall(chains.installments.calls, 'neq', 'invoices.status', 'cancelled')).toBe(true);
    expect(hasCall(chains.payments.calls, 'neq', 'invoices.status', 'cancelled')).toBe(true);
  });

  it('buckets payments by payment_date, not created_at', async () => {
    const chains = setupChains();
    const { result } = renderHook(() => useMonthDetail('2026-03-01'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(hasCall(chains.payments.calls, 'gte', 'payment_date', '2026-03-01')).toBe(true);
    expect(hasCall(chains.payments.calls, 'lt', 'payment_date', '2026-04-01')).toBe(true);
    expect(chains.payments.calls.some(c => c.method === 'gte' && c.args[0] === 'created_at')).toBe(false);
  });

  it('defaults to due_date for the installments leg', async () => {
    const chains = setupChains();
    const { result } = renderHook(() => useMonthDetail('2026-03-01'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(hasCall(chains.installments.calls, 'gte', 'due_date', '2026-03-01')).toBe(true);
  });

  it('switches the installments leg to paid_at when basis is "paid"', async () => {
    const chains = setupChains();
    const { result } = renderHook(() => useMonthDetail('2026-03-01', 'paid'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(hasCall(chains.installments.calls, 'gte', 'paid_at', '2026-03-01')).toBe(true);
    expect(chains.installments.calls.some(c => c.method === 'gte' && c.args[0] === 'due_date')).toBe(false);
  });

  it('merges installments and payments into one payments array, tagged by source', async () => {
    setupChains({
      installments: [{ id: 'inst-1', amount: 50000, due_date: '2026-03-05', paid_at: null }],
      payments: [{ id: 'pay-1', amount: 30000, payment_date: '2026-03-10' }],
    });
    const { result } = renderHook(() => useMonthDetail('2026-03-01'), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const sources = result.current.payments.map((p: { _source: string }) => p._source).sort();
    expect(sources).toEqual(['installment', 'payment']);
    const paymentRow = result.current.payments.find((p: { _source: string }) => p._source === 'payment');
    expect(paymentRow._date).toBe('2026-03-10');
  });

  it('does nothing when month is null', () => {
    setupChains();
    const { result } = renderHook(() => useMonthDetail(null), { wrapper: createQueryWrapper() });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });
});
