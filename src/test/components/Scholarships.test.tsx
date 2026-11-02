import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScholarshipAction } from '@/components/scholarships/ScholarshipAction';
import ScholarshipsPage from '@/pages/admin/ScholarshipsPage';

const award = vi.fn().mockResolvedValue(undefined);
const revoke = vi.fn().mockResolvedValue(undefined);
let state: { scholarship: Record<string, unknown> | null; canAward: boolean } = { scholarship: null, canAward: true };
let rows: Record<string, unknown>[] = [];

vi.mock('@/hooks/useScholarships', () => ({
  useEnrollmentScholarship: () => ({ data: state, award, revoke }),
  useScholarships: () => ({ data: rows, loading: false, revoke }),
}));

const row = (over: Record<string, unknown> = {}) => ({
  id: 's1', enrollment_id: 'e1', amount: 100000, applied_amount: 0, funded_by: 'FutureLabs', reason: 'Staff: free place',
  awarded_at: '2026-11-02T10:00:00Z', revoked_at: null, revoke_reason: null, student_name: 'Gideon Oboh',
  program_name: 'Web Development', cohort_label: 'Javascript Cohort 1 2026', outstanding: 0, awarded_by_name: 'Udim Manasseh', can_manage: true, ...over,
});

describe('ScholarshipAction', () => {
  beforeEach(() => { vi.clearAllMocks(); state = { scholarship: null, canAward: true }; });

  it('awards against the balance with a reason', async () => {
    render(<ScholarshipAction enrollmentId="e1" studentName="Ada Obi" outstanding={80000} />);
    fireEvent.click(screen.getByRole('button', { name: /Award scholarship/ }));
    expect(screen.getByLabelText('Amount (₦)')).toHaveValue(80000);
    const submit = within(screen.getByRole('dialog')).getByRole('button', { name: 'Award scholarship' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Hardship' } });
    fireEvent.click(submit);
    await waitFor(() => expect(award).toHaveBeenCalledWith(80000, 'Hardship', 'FutureLabs'));
  });

  it('shows an existing scholarship and hides controls from people who cannot award', () => {
    state = { scholarship: { id: 's1', amount: 100000, applied_amount: 0, funded_by: 'FutureLabs', reason: 'Staff', awarded_at: '2026-11-02' }, canAward: false };
    render(<ScholarshipAction enrollmentId="e1" studentName="Ada Obi" outstanding={0} />);
    expect(screen.getByText('Scholarship ₦100,000')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });

  it('renders nothing when there is no scholarship and the viewer cannot award', () => {
    state = { scholarship: null, canAward: false };
    const { container } = render(<ScholarshipAction enrollmentId="e1" studentName="Ada Obi" outstanding={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ScholarshipsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); rows = [row(), row({ id: 's2', enrollment_id: 'e2', student_name: 'Ada Obi', amount: 30000, applied_amount: 30000, reason: 'Merit' })]; });

  it('totals the fees waived and explains a free place', () => {
    render(<MemoryRouter><ScholarshipsPage /></MemoryRouter>);
    expect(screen.getByText('₦130,000')).toBeInTheDocument();
    expect(screen.getByText('Free place, no invoice')).toBeInTheDocument();
  });

  it('needs a reason to revoke', async () => {
    render(<MemoryRouter><ScholarshipsPage /></MemoryRouter>);
    fireEvent.click(within(screen.getByText('Ada Obi').closest('tr')!).getByRole('button', { name: 'Revoke' }));
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Left the programme' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('s2', 'Left the programme'));
  });
});
