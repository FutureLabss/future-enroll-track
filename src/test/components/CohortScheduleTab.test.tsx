import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQueryWrapper } from '@/test/testUtils';

const { mockFrom, mockUpdate, mockRpc } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockUpdate: vi.fn(), mockRpc: vi.fn() }));

let cohort: Record<string, unknown> = {};
const classes = [
  { id: 's1', title: 'python-cohort-6-2026', scheduled_date: '2099-01-05', start_time: '10:00:00', end_time: '11:00:00', location: 'Lab 2', meeting_link: null, status: 'scheduled' },
  { id: 's2', title: 'python-cohort-6-2026', scheduled_date: '2099-01-07', start_time: '10:00:00', end_time: '11:00:00', location: 'Lab 2', meeting_link: null, status: 'cancelled' },
];

function chain(data: unknown) {
  const p = Promise.resolve({ data, error: null });
  const self: Record<string, unknown> = {};
  Object.assign(self, {
    select: () => self, eq: () => self, order: () => self,
    single: () => p,
    update: (patch: unknown) => { mockUpdate(patch); return self; },
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => p.then(res, rej),
  });
  return self;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => mockFrom(t),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: vi.fn(),
  },
}));
vi.mock('@/lib/untypedRpc', () => ({ untypedRpc: (...a: unknown[]) => mockRpc(...a) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/components/cohort/CohortScheduleSetupDialog', () => ({
  CohortScheduleSetupDialog: ({ cohort: c }: { cohort: { cohort_label: string } | null }) => (c ? <div>Pattern dialog for {c.cohort_label}</div> : null),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CohortScheduleTab } from '@/components/cohort/CohortCollaboration';

beforeEach(() => {
  mockUpdate.mockReset();
  mockRpc.mockResolvedValue({ data: true, error: null });
  mockFrom.mockImplementation((t: string) => chain(t === 'cohorts' ? cohort : classes));
});

describe('CohortScheduleTab', () => {
  it('shows the weekly pattern and opens the schedule dialog from the button', async () => {
    cohort = { id: 'c1', cohort_label: 'python-cohort-6-2026', class_days: ['monday', 'wednesday', 'friday'], class_start_time: '10:00:00', class_end_time: '11:00:00', class_location: 'Lab 2' };
    render(<CohortScheduleTab cohortId="c1" />, { wrapper: createQueryWrapper() });
    expect(await screen.findByText('Mon, Wed & Fri, 10am–11am')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Change weekly schedule/ }));
    expect(screen.getByText('Pattern dialog for python-cohort-6-2026')).toBeInTheDocument();
  });

  it('offers to set a pattern when there is none', async () => {
    cohort = { id: 'c1', cohort_label: 'SQL Cohort 4', class_days: null };
    render(<CohortScheduleTab cohortId="c1" />, { wrapper: createQueryWrapper() });
    expect(await screen.findByRole('button', { name: /Set weekly schedule/ })).toBeInTheDocument();
  });

  it('cancels a single class and restores a cancelled one', async () => {
    cohort = { id: 'c1', cohort_label: 'python-cohort-6-2026', class_days: ['monday'], class_start_time: '10:00:00', class_end_time: '11:00:00' };
    render(<CohortScheduleTab cohortId="c1" />, { wrapper: createQueryWrapper() });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel class' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel class' }).at(-1)!);
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ status: 'cancelled' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ status: 'scheduled' }));
  });
});
