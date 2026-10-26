import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnboardingPanel } from '@/components/email/OnboardingPanel';

const setEnabled = vi.fn().mockResolvedValue(undefined);
const saveStep = vi.fn().mockResolvedValue(undefined);
const sendTest = vi.fn().mockResolvedValue({ sent_to: 'admin@futurelabs.ng' });
let enabled = false;

vi.mock('@/hooks/useOnboarding', () => ({
  useOnboarding: () => ({
    data: {
      enabled,
      steps: [
        { id: 'w', delay_days: 0, subject: 'Welcome to {{hub}}', body: 'Hi {{first_name}}', active: true },
        { id: 'c', delay_days: 7, subject: 'How is it going?', body: 'Check-in', active: false },
      ],
      stepStats: { w: { sent: 12, failed: 1, skipped: 0, queued: 2 } },
      journeys: [
        { id: 'j1', email: 'ada@example.com', full_name: 'Ada Obi', status: 'active', stop_reason: null, started_at: '2026-10-20T10:00:00Z', program_name: 'Data Analysis', sent: 1, last_sent_at: null },
        { id: 'j2', email: 'gone@example.com', full_name: 'Gone Away', status: 'stopped', stop_reason: 'unsubscribed', started_at: '2026-10-18T10:00:00Z', program_name: null, sent: 1, last_sent_at: null },
      ],
    },
    loading: false,
    setEnabled, saveStep, removeStep: vi.fn(), stopJourney: vi.fn().mockResolvedValue(undefined), sendTest,
  }),
}));

describe('OnboardingPanel', () => {
  beforeEach(() => { vi.clearAllMocks(); enabled = false; });

  it('lists steps with timing and delivery counts, and the students in the sequence', () => {
    render(<OnboardingPanel />);
    expect(screen.getByText('Right after enrolling')).toBeInTheDocument();
    expect(screen.getByText('Day 7 · 09:00 WAT')).toBeInTheDocument();
    expect(screen.getByText('12 sent · 2 queued · 1 failed')).toBeInTheDocument();
    expect(screen.getByText('Not sent yet')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('1 of 1')).toHaveLength(2);
    expect(screen.getByText('unsubscribed')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Stop' })).toHaveLength(1);
  });

  it('explains that it is off and switches on', () => {
    render(<OnboardingPanel />);
    expect(screen.getByText(/existing students are never emailed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Send onboarding emails' }));
    expect(setEnabled).toHaveBeenCalledWith(true);
  });

  it('edits a step, sends a test and saves', async () => {
    render(<OnboardingPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit “Welcome to {{hub}}”' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Days after joining'), { target: { value: '1' } });
    expect(within(dialog).getByText('Day 1 · 09:00 WAT')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Send test to me/ }));
    expect(sendTest).toHaveBeenCalledWith('Welcome to {{hub}}', 'Hi {{first_name}}');
    const save = within(dialog).getByRole('button', { name: 'Save' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    expect(saveStep).toHaveBeenCalledWith({ id: 'w', delay_days: 1, subject: 'Welcome to {{hub}}', body: 'Hi {{first_name}}', active: true });
  });

  it('new emails default to the day after the last one', () => {
    render(<OnboardingPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Add email/ }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Days after joining')).toHaveValue(8);
  });
});
