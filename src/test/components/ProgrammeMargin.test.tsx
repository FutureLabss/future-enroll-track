import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProgrammeMarginSection, marginPeriods } from '@/components/admin/ProgrammeMarginSection';

vi.mock('@/hooks/useProgrammeMargin', () => ({
  useProgrammeMargin: () => ({
    loading: false, error: null,
    data: {
      rows: [
        { program_id: 'p1', program_name: 'Web Development', revenue: 2600000, paying_students: 50, tutor_pay: 1400000, tutors: [{ name: 'Usenmfon Uko', amount: 350000 }] },
        { program_id: 'p2', program_name: 'Product Design', revenue: 0, paying_students: 0, tutor_pay: 50000, tutors: [{ name: 'Abraham', amount: 50000 }] },
      ],
      overhead: { amount: 1000000, staff: [{ name: 'Front Desk', role: 'Front Desk', amount: 1000000 }] },
    },
  }),
}));

describe('ProgrammeMarginSection', () => {
  it('shows fees, tutor pay and what is left per programme', () => {
    render(<ProgrammeMarginSection />);
    const row = screen.getByText('Web Development').closest('tr')!;
    expect(within(row).getByText('₦2,600,000')).toBeInTheDocument();
    expect(within(row).getByText('₦1,200,000')).toBeInTheDocument();
    expect(within(row).getByText('54%')).toBeInTheDocument();
  });

  it('flags a programme with pay but no fees, and totals overhead separately', () => {
    render(<ProgrammeMarginSection />);
    const row = screen.getByText('Product Design').closest('tr')!;
    expect(within(row).getByText('No fees')).toBeInTheDocument();
    expect(screen.getByText('₦150,000')).toBeInTheDocument(); // 2.6m - 1.45m - 1m left after all pay
  });

  it('offers this year, the last 12 months and last year', () => {
    const p = marginPeriods(new Date('2026-11-10T12:00:00Z'));
    expect(p[0]).toMatchObject({ value: 'ytd', from: '2026-01-01', to: '2026-11-10' });
    expect(p[1]).toMatchObject({ value: '2026-11', from: '2026-11-01', to: '2026-11-30' });
    expect(p[12]).toMatchObject({ value: '2025-12', from: '2025-12-01', to: '2025-12-31' });
    expect(p[13]).toMatchObject({ value: '2025', from: '2025-01-01', to: '2025-12-31' });
  });
});
