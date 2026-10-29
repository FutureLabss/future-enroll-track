import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DropoutsPage from '@/pages/admin/DropoutsPage';
import ReconnectPage from '@/pages/public/ReconnectPage';
import { AccessPausedBanner, AccessPausedCard } from '@/components/payments/AccessPaused';

const move = vi.fn().mockResolvedValue(undefined);
const resolve = vi.fn().mockResolvedValue(undefined);
const rpc = vi.fn();

const dropout = (over: Record<string, unknown> = {}) => ({
  id: 'd1', enrollment_id: 'e1', status: 'open', detected_at: '2026-10-28T07:45:00Z', last_attended_at: '2026-09-30T10:00:00Z',
  chosen_at: null, choice_note: null, messages_sent: 1, resolution_note: null, resolved_at: null,
  student_name: 'Ada Obi', email: 'ada@example.com', phone: '08031234567', guardian_name: 'Mrs Obi', guardian_phone: '08039876543',
  program_name: 'Web Development', cohort_label: 'Cohort 3', classroom_id: 'c1',
  next_cohort_id: 'k4', next_cohort_label: 'Cohort 4', next_cohort_start: '2026-11-15', outstanding: 50000,
  cohort_options: [{ id: 'k4', label: 'Cohort 4', start_date: '2026-11-15' }], ...over,
});
let rows = [dropout()];

vi.mock('@/hooks/useDropouts', () => ({
  useDropouts: () => ({ data: rows, loading: false, error: null, refetch: vi.fn(), move, resolve }),
}));
vi.mock('@/lib/untypedRpc', () => ({ untypedRpc: (...a: unknown[]) => rpc(...a) }));

const withClient = (ui: React.ReactNode) =>
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;

describe('DropoutsPage', () => {
  beforeEach(() => { vi.clearAllMocks(); rows = [dropout()]; });

  it('shows the student, their last attendance, guardian and balance', () => {
    render(<MemoryRouter><DropoutsPage /></MemoryRouter>);
    const row = screen.getByText('Ada Obi').closest('tr')!;
    expect(within(row).getByText(/Last attended/)).toBeInTheDocument();
    expect(within(row).getByText(/Guardian: Mrs Obi/)).toBeInTheDocument();
    expect(within(row).getByText('₦50,000')).toBeInTheDocument();
    expect(within(row).getByText('1 message sent, no reply yet')).toBeInTheDocument();
  });

  it('moves a student into the next cohort', async () => {
    render(<MemoryRouter><DropoutsPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Move to cohort' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(move).toHaveBeenCalledWith('d1', 'k4'));
  });

  it('needs a note to record an outcome', async () => {
    render(<MemoryRouter><DropoutsPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Record outcome' }));
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Called: will rejoin in January' } });
    fireEvent.click(save);
    await waitFor(() => expect(resolve).toHaveBeenCalledWith('d1', 'rejoin_requested', 'Called: will rejoin in January'));
  });

  it('offers no actions on a settled case', () => {
    rows = [dropout({ status: 'withdrawn', resolution_note: 'Moved abroad' })];
    render(<MemoryRouter><DropoutsPage /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Move to cohort' })).not.toBeInTheDocument();
    expect(screen.getByText('Moved abroad')).toBeInTheDocument();
  });
});

describe('ReconnectPage', () => {
  beforeEach(() => vi.clearAllMocks());
  const choice = { first_name: 'Ada', program_name: 'Web Development', cohort_label: 'Cohort 3', next_cohort_label: 'Cohort 4',
    next_cohort_start: '2026-11-15', hub_name: 'FutureLabs', status: 'open', outstanding: 50000 };
  const renderAt = () => render(withClient(
    <MemoryRouter initialEntries={['/reconnect/tok']}><Routes><Route path="/reconnect/:token" element={<ReconnectPage />} /></Routes></MemoryRouter>,
  ));

  it('offers only rejoin or withdraw and saves the choice', async () => {
    rpc.mockImplementation((fn: string) => Promise.resolve(fn === 'get_dropout_choice'
      ? { data: choice, error: null } : { data: 'rejoin_requested', error: null }));
    renderAt();
    expect(await screen.findByText(/We've missed you, Ada/)).toBeInTheDocument();
    expect(screen.getByText(/balance of ₦50,000 remains outstanding/)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByText('Rejoin the next cohort'));
    fireEvent.click(confirm);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('choose_dropout_option', { p_token: 'tok', p_choice: 'rejoin', p_note: null }));
    expect(await screen.findByText(/We'll place you in Cohort 4/)).toBeInTheDocument();
  });

  it('rejects an unknown link', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    renderAt();
    expect(await screen.findByText(/This link isn't valid/)).toBeInTheDocument();
  });
});

describe('AccessPaused', () => {
  const paused = { enrollment_id: 'e1', program_id: 'p1', program_name: 'Web Development', outstanding: 50000, due_date: '2026-09-01', invoice_id: 'i1' };

  it('locks the classroom with a way to pay', () => {
    render(<MemoryRouter><AccessPausedCard paused={paused} classroomName="Web Dev Cohort 3" /></MemoryRouter>);
    expect(screen.getByText('Your access to Web Dev Cohort 3 is paused')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pay now' })).toHaveAttribute('href', '/student/invoices/i1?pay=1');
  });

  it('shows nothing on the dashboard when nothing is paused', () => {
    const { container } = render(<MemoryRouter><AccessPausedBanner paused={[]} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});
