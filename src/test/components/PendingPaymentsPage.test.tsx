import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryWrapper } from '@/test/testUtils';

const { usePendingPayments, refetch } = vi.hoisted(() => ({ usePendingPayments: vi.fn(), refetch: vi.fn() }));
vi.mock('@/hooks/usePayments', () => ({ usePendingPayments }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
import PendingPaymentsPage from '@/pages/admin/PendingPaymentsPage';

beforeEach(() => { vi.clearAllMocks(); });
describe('pending payments request states', () => {
  it('shows a request error and retry instead of an empty submission message', () => {
    usePendingPayments.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, error: { message: 'Invoice relationship unavailable' }, refetch });
    render(<PendingPaymentsPage />, { wrapper: createQueryWrapper() });
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load payment submissions');
    expect(screen.getByRole('alert')).toHaveTextContent('Invoice relationship unavailable');
    expect(screen.queryByText('No bank-transfer receipts found')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
  it('explains the successful empty state and allows refreshing newly submitted receipts', () => {
    usePendingPayments.mockReturnValue({ data: [], isLoading: false, isFetching: false, error: null, refetch });
    render(<PendingPaymentsPage />, { wrapper: createQueryWrapper() });
    expect(screen.getByText('No bank-transfer receipts found')).toBeInTheDocument();
    expect(screen.getByText(/Paystack payments are recorded automatically/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
