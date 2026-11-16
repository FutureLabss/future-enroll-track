import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommunityLinksCard } from '@/components/community/CommunityLinksCard';
import { CommunityLinksSettings } from '@/components/community/CommunityLinksSettings';

let myLinks: Array<{ hub_name: string; whatsapp_group_url: string | null; slack_invite_url: string | null }> = [];
const save = vi.fn().mockResolvedValue(undefined);
const toastError = vi.fn();
const hubLinks = { whatsapp_group_url: 'https://chat.whatsapp.com/abc', slack_invite_url: null };

vi.mock('@/hooks/useCommunityLinks', () => ({
  useMyCommunityLinks: () => ({ data: myLinks }),
  useHubCommunityLinks: () => ({ data: hubLinks, save }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (m: string) => toastError(m) } }));

beforeEach(() => { save.mockClear(); toastError.mockClear(); });

describe('CommunityLinksCard', () => {
  it('shows nothing to a student without a live enrollment', () => {
    myLinks = [];
    const { container } = render(<CommunityLinksCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('links to the WhatsApp group and Slack', () => {
    myLinks = [{ hub_name: 'FutureLabs', whatsapp_group_url: 'https://chat.whatsapp.com/abc', slack_invite_url: 'https://join.slack.com/t/x' }];
    render(<CommunityLinksCard />);
    expect(screen.getByRole('link', { name: /WhatsApp group/ })).toHaveAttribute('href', 'https://chat.whatsapp.com/abc');
    expect(screen.getByRole('link', { name: /Slack/ })).toHaveAttribute('href', 'https://join.slack.com/t/x');
  });
});

describe('CommunityLinksSettings', () => {
  it('saves both links', async () => {
    render(<CommunityLinksSettings />);
    fireEvent.change(screen.getByLabelText('Slack invite'), { target: { value: 'https://join.slack.com/t/futurelabs-hq/x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save links' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('https://chat.whatsapp.com/abc', 'https://join.slack.com/t/futurelabs-hq/x'));
  });

  it('rejects a link that is not a Slack invite', () => {
    render(<CommunityLinksSettings />);
    fireEvent.change(screen.getByLabelText('Slack invite'), { target: { value: 'https://futurelabs.slack.com/archives/C1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save links' }));
    expect(save).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('The Slack link should start with https://join.slack.com/');
  });
});
