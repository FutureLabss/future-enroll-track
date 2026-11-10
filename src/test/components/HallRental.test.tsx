import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HallBookingFields } from '@/components/finance/HallBookingFields';
import { VenueDefaultsDialog } from '@/components/finance/VenueDefaultsDialog';
import type { BookingInput } from '@/hooks/useVenueBookings';

const booking: BookingInput = {
  venue_name: 'FutureLabs Hall', usage_date: '2026-11-20', end_date: null, start_time: '09:00', end_time: '17:00',
  guests: null, purpose: null, facilities: '- Projector', inclusions: '- Water', conditions: '1. No smoking',
};

describe('HallBookingFields', () => {
  it('edits the booking without touching other fields', () => {
    const onChange = vi.fn();
    render(<HallBookingFields value={booking} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Guests'), { target: { value: '40' } });
    expect(onChange).toHaveBeenCalledWith({ ...booking, guests: 40 });
    fireEvent.change(screen.getByLabelText('Conditions of use'), { target: { value: '1. No smoking\n2. Leave it clean' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...booking, conditions: '1. No smoking\n2. Leave it clean' });
  });

  it('starts with the defaults it was given', () => {
    render(<HallBookingFields value={booking} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Facilities they can use')).toHaveValue('- Projector');
    expect(screen.getByLabelText('Start time *')).toHaveValue('09:00');
  });
});

describe('VenueDefaultsDialog', () => {
  it('saves the edited defaults and needs every section filled', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const defaults = { venue_name: 'FutureLabs Hall', address: 'Chubb Road', contact: '0703', facilities: '- Wi-Fi', inclusions: '- Staff on site', conditions: '1. No smoking' };
    render(<VenueDefaultsDialog defaults={defaults} onClose={vi.fn()} onSave={onSave} />);
    const save = screen.getByRole('button', { name: 'Save defaults' });
    fireEvent.change(screen.getByLabelText('Conditions of use'), { target: { value: '' } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Conditions of use'), { target: { value: '1. No smoking\n2. Pay overtime' } });
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...defaults, conditions: '1. No smoking\n2. Pay overtime' }));
  });
});
