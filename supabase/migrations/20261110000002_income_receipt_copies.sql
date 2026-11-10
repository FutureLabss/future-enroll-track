-- Staff who must see every income receipt (FutureLabs: the hub manager, Gideon Oboh).
-- Blind-copied, so payers never see a staff member's personal address.
ALTER TABLE public.venue_booking_defaults
  ADD COLUMN IF NOT EXISTS receipt_copy_to text[] NOT NULL DEFAULT '{}';

UPDATE public.venue_booking_defaults SET receipt_copy_to = ARRAY['obohpromise123@gmail.com']
WHERE hub_id = '00000000-0000-0000-0000-000000000001';
