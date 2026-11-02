import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ launch: vi.fn(), error: vi.fn() }));
vi.mock('@/services/projectTracker', () => ({
  launchProjectTracker: mocks.launch,
  TrackerAuthenticationError: class extends Error {},
  TrackerAccessError: class extends Error {},
}));
vi.mock('sonner', () => ({ toast: { error: mocks.error } }));
import { ProjectTrackerLink } from '@/components/shared/ProjectTrackerLink';
import { TrackerAccessError } from '@/services/projectTracker';
beforeEach(() => vi.resetAllMocks());
it('disables repeat clicks while launching and reports failures', async () => {
  let reject: (reason: Error) => void = () => {};
  mocks.launch.mockReturnValue(new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
  render(<MemoryRouter><ProjectTrackerLink /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Project Tracker' }));
  const loading = screen.getByRole('button', { name: 'Opening Project Tracker...' });
  expect(loading).toBeDisabled();
  fireEvent.click(loading);
  expect(mocks.launch).toHaveBeenCalledOnce();
  reject(new Error('network'));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());
  expect(screen.getByRole('button', { name: 'Project Tracker' })).toBeEnabled();
});
it('tells people without access to ask the administrator', async () => {
  mocks.launch.mockRejectedValue(new TrackerAccessError());
  render(<MemoryRouter><ProjectTrackerLink /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Project Tracker' }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('do not have Project Tracker access')));
});
