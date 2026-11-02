import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CertificatesPage from '@/pages/admin/CertificatesPage';

const approve = vi.fn().mockResolvedValue({ sent_to: 'ada@example.com' });
const decline = vi.fn().mockResolvedValue(undefined);
let isSuperadmin = false;

const row = (over: Record<string, unknown>) => ({
  id: 'r1', enrollment_id: 'e1', student_name: 'Ada Obi', note: 'Finished all modules', status: 'pending',
  requested_at: '2026-10-28T09:00:00Z', decided_at: null, decision_note: null, requested_by_name: 'Princewill',
  decided_by_name: null, program_name: 'Web Development', cohort_label: 'Cohort 3', email: 'ada@example.com',
  outstanding: 0, can_approve: true, mine: false, code: null, ...over,
});
let rows = [row({}), row({ id: 'r2', enrollment_id: 'e2', student_name: 'Bayo Owing', outstanding: 50000 })];

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ isSuperadmin }) }));
vi.mock('@/hooks/useCertificateRequests', () => ({
  useCertificateRequests: () => ({ data: rows, loading: false, approve, decline, cancel: vi.fn() }),
}));

const renderPage = () => render(<MemoryRouter><CertificatesPage /></MemoryRouter>);
const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

describe('CertificatesPage', () => {
  beforeEach(() => { vi.clearAllMocks(); isSuperadmin = false; rows = [row({}), row({ id: 'r2', enrollment_id: 'e2', student_name: 'Bayo Owing', outstanding: 50000 })]; });

  it('shows who asked, the note and the fee position', () => {
    renderPage();
    expect(screen.getAllByText('Princewill')).toHaveLength(2);
    expect(screen.getAllByText(/Finished all modules/)).toHaveLength(2);
    expect(within(rowOf('Bayo Owing')).getByText('₦50,000 owing')).toBeInTheDocument();
    expect(within(rowOf('Ada Obi')).getByText('Cleared')).toBeInTheDocument();
  });

  it('lets the training manager approve a cleared student but not one who owes', async () => {
    renderPage();
    expect(within(rowOf('Bayo Owing')).getByRole('button', { name: 'Approve' })).toBeDisabled();
    fireEvent.click(within(rowOf('Ada Obi')).getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve and issue' }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }), 'Ada Obi', true, ''));
  });

  it('lets the CEO approve a student who owes, with a reason', async () => {
    isSuperadmin = true;
    renderPage();
    fireEvent.click(within(rowOf('Bayo Owing')).getByRole('button', { name: 'Approve' }));
    const confirm = screen.getByRole('button', { name: 'Approve and issue' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/still outstanding/), { target: { value: 'Full scholarship' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(approve).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2' }), 'Bayo Owing', true, 'Full scholarship'));
  });

  it('needs a reason to decline', async () => {
    renderPage();
    fireEvent.click(within(rowOf('Ada Obi')).getByRole('button', { name: 'Decline' }));
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Decline' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Final project missing' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(decline).toHaveBeenCalledWith('r1', 'Final project missing'));
  });
});
