import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { CertificateAction } from '@/components/certificates/CertificateAction';
import { CertificateView } from '@/components/certificates/CertificateView';

const base = { enrollment_id: 'e1', certificate_id: null, code: null, issued_at: null, issued_by_name: null, emailed_at: null, can_issue: true };
const handlers = () => ({
  onIssue: vi.fn().mockResolvedValue({ sent_to: 'ada@example.com' }),
  onRevoke: vi.fn().mockResolvedValue(undefined),
  onResend: vi.fn().mockResolvedValue({ sent_to: 'ada@example.com' }),
});

describe('CertificateAction', () => {
  it('lets an issuer correct the name and issue with an email', async () => {
    const h = handlers();
    render(<MemoryRouter><CertificateAction enrollmentId="e1" studentName="ada obi" programName="Web Development" state={base} {...h} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Issue certificate/ }));
    fireEvent.change(screen.getByLabelText('Name on the certificate'), { target: { value: 'Ada Obi' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Issue certificate' }).at(-1)!);
    await waitFor(() => expect(h.onIssue).toHaveBeenCalledWith('e1', 'Ada Obi', true));
  });

  it('shows nothing to issue for someone who may not issue', () => {
    render(<MemoryRouter><CertificateAction enrollmentId="e1" studentName="Ada" state={{ ...base, can_issue: false }} {...handlers()} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /Issue certificate/ })).not.toBeInTheDocument();
  });

  it('shows an issued certificate', () => {
    render(<MemoryRouter><CertificateAction enrollmentId="e1" studentName="Ada" {...handlers()}
      state={{ ...base, certificate_id: 'c1', code: 'AB12C-9F00D', issued_at: '2026-10-28T09:00:00Z' }} /></MemoryRouter>);
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
