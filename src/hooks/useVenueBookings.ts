import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface VenueDefaults {
  venue_name: string;
  address: string | null;
  contact: string | null;
  facilities: string;
  inclusions: string;
  conditions: string;
  receipt_copy_to: string[];
}

export interface VenueBooking {
  id: string;
  other_income_id: string;
  venue_name: string;
  usage_date: string;
  end_date: string | null;
  start_time: string;
  end_time: string;
  guests: number | null;
  purpose: string | null;
  facilities: string;
  inclusions: string;
  conditions: string;
  details_sent_at: string | null;
}

export type BookingInput = Omit<VenueBooking, 'id' | 'other_income_id' | 'details_sent_at'>;

const table = (name: string) => supabase.from(name as never);

// Hall rentals recorded under Other Income: their booking details, the hub's default
// booking text, and the emails (receipt + booking confirmation) sent to the payer.
export function useVenueBookings() {
  const queryClient = useQueryClient();
  const { data, isLoading: loading, error } = useQuery({
    queryKey: ['venue-bookings'],
    queryFn: async () => {
      const [{ data: bookings, error: bErr }, { data: defaults, error: dErr }] = await Promise.all([
        table('venue_bookings').select('*'),
        table('venue_booking_defaults').select('venue_name, address, contact, facilities, inclusions, conditions, receipt_copy_to').maybeSingle(),
      ]);
      if (bErr) throw bErr;
      if (dErr) throw dErr;
      return {
        byIncome: new Map(((bookings ?? []) as VenueBooking[]).map(b => [b.other_income_id, b])),
        defaults: (defaults ?? null) as VenueDefaults | null,
      };
    },
    staleTime: 30_000,
  });
  const refetch = () => queryClient.invalidateQueries({ queryKey: ['venue-bookings'] });

  const saveBooking = async (incomeId: string, booking: BookingInput) => {
    const { error } = await table('venue_bookings').upsert({ ...booking, other_income_id: incomeId } as never, { onConflict: 'other_income_id' });
    if (error) throw error;
    refetch();
  };

  const saveDefaults = async (defaults: VenueDefaults, hubId: string) => {
    const { error } = await table('venue_booking_defaults').upsert({ ...defaults, hub_id: hubId, updated_at: new Date().toISOString() } as never);
    if (error) throw error;
    refetch();
  };

  const sendEmails = async (incomeId: string, opts: { receipt: boolean; booking: boolean }) => {
    const res = await supabase.functions.invoke('send-income-receipt', { body: { other_income_id: incomeId, ...opts } });
    if (res.error) throw res.error;
    if (res.data?.error) throw new Error(res.data.error);
    queryClient.invalidateQueries({ queryKey: ['other-income'] });
    refetch();
    return res.data as { sent_to: string; sent: string[] };
  };

  return { data: data ?? { byIncome: new Map<string, VenueBooking>(), defaults: null }, loading, error, refetch, saveBooking, saveDefaults, sendEmails };
}
