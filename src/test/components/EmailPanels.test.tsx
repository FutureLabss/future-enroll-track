import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StaffPicker } from '@/components/email/StaffPicker';

const saveSettings = vi.fn().mockResolvedValue(undefined);

vi.mock('@/hooks/useEmailDigest', () => ({
  useEmailDigest: () => ({
    data: {
      settings: { enabled: true, include_contacts: true, contact_lists: [], include_leads: true, excluded_lead_statuses: ['not_interested'], staff_ids: ['s1'] },
      digests: [
        { id: 'd1', subject: 'Week 1 news', body: 'Hello', status: 'sent', scheduled_for: '2026-10-26T06:00:00Z', send_immediately: false, recipient_count: 40, sent_count: 39, failed_count: 1, created_at: '2026-10-20T10:00:00Z', sent_at: '2026-10-26T06:05:00Z' },
        { id: 'd2', subject: 'Week 2 news', body: 'Hi {{first_name}}', status: 'scheduled', scheduled_for: '2026-11-02T06:00:00Z', send_immediately: false, recipient_count: 0, sent_count: 0, failed_count: 0, created_at: '2026-10-27T10:00:00Z', sent_at: null },
      ],
      current: { id: 'd2', subject: 'Week 2 news', body: 'Hi {{first_name}}', status: 'scheduled', scheduled_for: '2026-11-02T06:00:00Z', send_immediately: false, recipient_count: 0, sent_count: 0, failed_count: 0, created_at: '2026-10-27T10:00:00Z', sent_at: null },
      audience: { total: 42, staff: 1, contacts: 30, leads: 11, suppressed: 2 },
    },
    loading: false,
    saveSettings, saveDraft: vi.fn(), schedule: vi.fn(), unschedule: vi.fn(), sendNow: vi.fn(), sendTest: vi.fn(),
  }),
}));

vi.mock('@/hooks/useEmailEngagement', () => ({
  useEmailEngagement: () => ({ data: {
    digests: { d1: { sent: 39, delivered: 38, opened: 20, clicked: 6, bounced: 1, complained: 0 } },
    steps: { w: { sent: 12, delivered: 12, opened: 9, clicked: 3, bounced: 0, complained: 1 } },
  }, loading: false }),
}));

vi.mock('@/hooks/useEmailContacts', () => ({
  useEmailContacts: () => ({
    data: {
      contacts: [{ id: 'c1', email: 'old@example.com', full_name: 'Old Student', list_name: 'Past students 2025', created_at: '2026-10-01T00:00:00Z' }],
      lists: [{ name: 'Past students 2025', count: 30 }],
      suppressions: [{ id: 'x1', normalized_email: 'gone@example.com', reason: 'unsubscribed', source: 'digest_link', created_at: '2026-10-02T00:00:00Z' }],
    },
    loading: false, importContacts: vi.fn(), removeContact: vi.fn(), removeList: vi.fn(),
  }),
}));

const staff = [
  { id: 's1', full_name: 'Ada Tutor', email: 'ada@futurelabs.ng', role_title: 'Tutor' },
  { id: 's2', full_name: 'Bayo Admin', email: 'bayo@futurelabs.ng', role_title: null },
  { id: 's3', full_name: 'No Email', email: null, role_title: null },
];

vi.mock('@/hooks/useStaffDirectory', () => ({
  useStaffDirectory: () => ({ data: staff, loading: false }),
}));

describe('StaffPicker', () => {
  it('selects individuals, all mailable staff, or none', () => {
    const onChange = vi.fn();
    render(<StaffPicker staff={staff} value={['s1']} onChange={onChange} />);
    expect(screen.getByText('1 of 2 staff selected')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Bayo Admin'));
    expect(onChange).toHaveBeenLastCalledWith(['s1', 's2']);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onChange).toHaveBeenLastCalledWith(['s1', 's2']);
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('does not let staff without an email be chosen', () => {
    const onChange = vi.fn();
    render(<StaffPicker staff={staff} value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText('No Email'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('No email address')).toBeInTheDocument();
  });
});

describe('WeeklyDigestPanel', () => {
  beforeEach(() => saveSettings.mockClear());

  it('shows the scheduled issue, audience breakdown and history', async () => {
    const { WeeklyDigestPanel } = await import('@/components/email/WeeklyDigestPanel');
    render(<WeeklyDigestPanel />);
    expect(screen.getByDisplayValue('Week 2 news')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Unschedule/ })).toBeInTheDocument();
    expect(screen.getByText('42 people')).toBeInTheDocument();
    expect(screen.getByText(/30 imported · 11 leads · 1 staff · 2 unsubscribed/)).toBeInTheDocument();
    expect(screen.getByText('Week 1 news')).toBeInTheDocument();
    expect(screen.getByText(/1 failed/)).toBeInTheDocument();
    expect(screen.getByText('20 opened (51%) · 6 clicked · 1 bounced')).toBeInTheDocument();
  });

  it('turning the only list off stops emailing imported contacts', async () => {
    const { WeeklyDigestPanel } = await import('@/components/email/WeeklyDigestPanel');
    render(<WeeklyDigestPanel />);
    fireEvent.click(screen.getByText('Past students 2025'));
    expect(saveSettings).toHaveBeenCalledWith({ include_contacts: false, contact_lists: [] });
  });
});

describe('EmailContactsPanel', () => {
  it('lists contacts, lists and unsubscribed addresses', async () => {
    const { EmailContactsPanel } = await import('@/components/email/EmailContactsPanel');
    render(<EmailContactsPanel />);
    expect(screen.getByText('old@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('Past students 2025').length).toBeGreaterThan(0);
    expect(screen.getByText('gone@example.com')).toBeInTheDocument();
  });
});
