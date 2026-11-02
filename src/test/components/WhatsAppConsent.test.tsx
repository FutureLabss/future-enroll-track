import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppConsentCard } from '@/components/enrollment/WhatsAppConsentCard';

const save = vi.fn().mockResolvedValue(undefined);
let data: Record<string, unknown> | null = null;

vi.mock('@/hooks/useWhatsAppConsent', () => ({ useWhatsAppConsent: () => ({ data, save }) }));

const base = { has_enrollment: true, asked: false, whatsapp: false, guardian: false, phone: '+2348031234567', guardian_phone: null };

describe('WhatsAppConsentCard', () => {
  beforeEach(() => { vi.clearAllMocks(); data = { ...base }; });

  it('asks a student who has not answered and saves their choice', async () => {
    render(<WhatsAppConsentCard onlyUnanswered />);
    expect(screen.queryByText(/contact my parent or guardian/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(false, false));
  });

  it('asks separately about the guardian when there is a guardian number', async () => {
    data = { ...base, guardian_phone: '+2348039876543' };
    render(<WhatsAppConsentCard />);
    expect(screen.getByText(/contact my parent or guardian \(\+2348039876543\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(true, true));
  });

  it('stays off the dashboard once answered, but shows on the profile', () => {
    data = { ...base, asked: true, whatsapp: true };
    const { container, rerender } = render(<WhatsAppConsentCard onlyUnanswered />);
    expect(container).toBeEmptyDOMElement();
    rerender(<WhatsAppConsentCard />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('shows nothing to someone with no enrollment', () => {
    data = { ...base, has_enrollment: false };
    const { container } = render(<WhatsAppConsentCard />);
    expect(container).toBeEmptyDOMElement();
  });
});
