import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { CertificateAction } from '@/components/certificates/CertificateAction';
import { CertificateView } from '@/components/certificates/CertificateView';

const base = {
  enrollment_id: 'e1', certificate_id: null, code: null, issued_at: null, issued_by_name: null, emailed_at: null,
  request_id: null, requested_at: null, requested_by_name: null, outstanding: 0, can_request: true, can_approve: false, is_ceo: false,
};
type State = typeof base & { certificate_id: string | null; code: string | null; issued_at: string | null; request_id: string | null; requested_by_name: string | null };

const certsWith = (state: Partial<State>) => ({
  data: new Map([['e1', { ...base, ...state }]]),
  issue: vi.fn().mockResolvedValue({ sent_to: 'ada@example.com' }),
  request: vi.fn().mockResolvedValue(undefined),
  revoke: vi.fn().mockResolvedValue(undefined),
  sendEmail: vi.fn().mockResolvedValue({ sent_to: 'ada@example.com' }),
  cancelRequest: vi.fn(), refetch: vi.fn(), loading: false, error: null,
}) as unknown as ReturnType<typeof import('@/hooks/useCertificates').useCertificates>;

const renderAction = (certs: ReturnType<typeof certsWith>) =>
  render(<MemoryRouter><CertificateAction enrollmentId="e1" studentName="ada obi" programName="Web Development" certs={certs} /></MemoryRouter>);

describe('CertificateAction', () => {
  it('lets a tutor request a certificate with a corrected name and a note', async () => {
    const certs = certsWith({});
    renderAction(certs);
    fireEvent.click(screen.getByRole('button', { name: /Request certificate/ }));
    fireEvent.change(screen.getByLabelText('Name on the certificate'), { target: { value: 'Ada Obi' } });
    fireEvent.change(screen.getByLabelText(/Note for the approver/), { target: { value: 'Finished everything' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(certs.request).toHaveBeenCalledWith('e1', 'Ada Obi', 'Finished everything'));
  });

  it('blocks a request while fees are outstanding', () => {
    renderAction(certsWith({ outstanding: 50000 }));
    expect(screen.getByRole('button', { name: /Request certificate/ })).toBeDisabled();
    expect(screen.getByText('₦50,000 outstanding')).toBeInTheDocument();
  });

  it('lets the CEO issue despite a balance, but only with a reason', async () => {
    const certs = certsWith({ outstanding: 50000, can_approve: true, is_ceo: true });
    renderAction(certs);
    fireEvent.click(screen.getByRole('button', { name: /Issue certificate/ }));
    const issueButton = screen.getAllByRole('button', { name: 'Issue certificate' }).at(-1)!;
    expect(issueButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/still outstanding/), { target: { value: 'Full scholarship' } });
    fireEvent.click(issueButton);
    await waitFor(() => expect(certs.issue).toHaveBeenCalledWith('e1', 'ada obi', true, 'Full scholarship'));
  });

  it('shows a pending request to the requester and a review link to approvers', () => {
    const { unmount } = renderAction(certsWith({ request_id: 'r1', requested_by_name: 'Princewill' }));
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument();
    expect(screen.getByText('Requested by Princewill')).toBeInTheDocument();
    unmount();
    renderAction(certsWith({ request_id: 'r1', can_approve: true }));
    expect(screen.getByRole('link', { name: 'Review request' })).toHaveAttribute('href', '/admin/certificates');
  });

  it('shows nothing to people who can neither request nor approve', () => {
    renderAction(certsWith({ can_request: false }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows an issued certificate', () => {
    renderAction(certsWith({ certificate_id: 'c1', code: 'AB12C-9F00D', issued_at: '2026-10-28T09:00:00Z' }));
    expect(screen.getByText(/Issued 28\/10\/2026/)).toBeInTheDocument();
  });
});

describe('CertificateView', () => {
  const cert = {
    code: 'AB12C-9F00D', student_name: 'Ada Obi', program_name: 'Web Development', cohort_label: 'Cohort 3',
    completed_on: '2026-10-25', issued_at: '2026-10-28T09:00:00Z', issued_by_name: null, hub_name: 'FutureLabs',
    hub_logo_url: null, revoked: false, revoked_at: null,
  };

  it('prints the name, programme, date and verification code', () => {
    render(<CertificateView cert={cert} verifyUrl="https://admin.futurelabs.ng/certificate/AB12C-9F00D" />);
    expect(screen.getByText('Ada Obi')).toBeInTheDocument();
    expect(screen.getByText('Web Development')).toBeInTheDocument();
    expect(screen.getByText('25/10/2026')).toBeInTheDocument();
    expect(screen.getByText('Verified Certificate of Completion')).toBeInTheDocument();
    expect(screen.getByText('Udim Manasseh')).toBeInTheDocument();
    expect(screen.getByText('FutureLabs has confirmed the participation of the individual in the program')).toBeInTheDocument();
    expect(screen.getByText('Certificate ID AB12C-9F00D · Verify at admin.futurelabs.ng/certificate/AB12C-9F00D')).toBeInTheDocument();
    expect(screen.queryByText('Revoked')).not.toBeInTheDocument();
  });

  it('marks a revoked certificate', () => {
    render(<CertificateView cert={{ ...cert, revoked: true, revoked_at: '2026-10-29T09:00:00Z' }} verifyUrl="x" />);
    expect(screen.getByText('Revoked')).toBeInTheDocument();
  });
});
