-- Hall rentals recorded as other income: the payer gets an emailed receipt and a
-- booking confirmation (date, time, facilities, what is included, conditions).
-- Each hub keeps default booking text that pre-fills every new rental and can be
-- edited per booking; the booking keeps its own copy so later edits to the defaults
-- never change what a past renter was sent.

ALTER TABLE public.other_income
  ADD COLUMN IF NOT EXISTS payer_email text,
  ADD COLUMN IF NOT EXISTS receipt_number text,
  ADD COLUMN IF NOT EXISTS receipt_sent_at timestamptz;

CREATE SEQUENCE IF NOT EXISTS public.income_receipt_seq;
CREATE UNIQUE INDEX IF NOT EXISTS uq_other_income_receipt_number ON public.other_income (receipt_number) WHERE receipt_number IS NOT NULL;

-- Numbered when first sent, so only income that actually got a receipt uses a number.
CREATE OR REPLACE FUNCTION public.assign_income_receipt_number(p_income_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n text;
BEGIN
  UPDATE public.other_income
     SET receipt_number = COALESCE(receipt_number, 'RCT-' || lpad(nextval('public.income_receipt_seq')::text, 6, '0'))
   WHERE id = p_income_id
  RETURNING receipt_number INTO _n;
  RETURN _n;
END;
$$;

CREATE TABLE IF NOT EXISTS public.venue_bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id           uuid REFERENCES public.hubs(id) ON DELETE CASCADE,
  other_income_id  uuid NOT NULL UNIQUE REFERENCES public.other_income(id) ON DELETE CASCADE,
  venue_name       text NOT NULL,
  usage_date       date NOT NULL,
  end_date         date,
  start_time       time NOT NULL,
  end_time         time NOT NULL,
  guests           integer CHECK (guests IS NULL OR guests > 0),
  purpose          text,
  facilities       text NOT NULL,
  inclusions       text NOT NULL,
  conditions       text NOT NULL,
  details_sent_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= usage_date)
);
CREATE INDEX IF NOT EXISTS idx_venue_bookings_hub_date ON public.venue_bookings (hub_id, usage_date);

CREATE TABLE IF NOT EXISTS public.venue_booking_defaults (
  hub_id      uuid PRIMARY KEY REFERENCES public.hubs(id) ON DELETE CASCADE,
  venue_name  text NOT NULL,
  address     text,
  contact     text,
  facilities  text NOT NULL,
  inclusions  text NOT NULL,
  conditions  text NOT NULL,
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_venue_bookings_set_hub_id ON public.venue_bookings;
CREATE TRIGGER trg_venue_bookings_set_hub_id BEFORE INSERT ON public.venue_bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();
DROP TRIGGER IF EXISTS trg_venue_booking_defaults_set_hub_id ON public.venue_booking_defaults;
CREATE TRIGGER trg_venue_booking_defaults_set_hub_id BEFORE INSERT ON public.venue_booking_defaults
  FOR EACH ROW EXECUTE FUNCTION public.set_hub_id_from_context();

ALTER TABLE public.venue_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_booking_defaults ENABLE ROW LEVEL SECURITY;

-- Same people who manage other income.
CREATE POLICY "Admins manage venue bookings" ON public.venue_bookings FOR ALL
  USING ((public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) AND hub_id = public.get_my_hub_id())
  WITH CHECK ((public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) AND hub_id = public.get_my_hub_id());
CREATE POLICY "Admins manage venue booking defaults" ON public.venue_booking_defaults FOR ALL
  USING ((public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) AND hub_id = public.get_my_hub_id())
  WITH CHECK ((public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) AND hub_id = public.get_my_hub_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_bookings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_booking_defaults TO authenticated;
GRANT ALL ON public.venue_bookings, public.venue_booking_defaults TO service_role;
REVOKE ALL ON FUNCTION public.assign_income_receipt_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_income_receipt_number(uuid) TO service_role;
GRANT USAGE ON SEQUENCE public.income_receipt_seq TO service_role;

-- Draft defaults for FutureLabs; staff edit them under Other Income > Hall rental defaults.
INSERT INTO public.venue_booking_defaults (hub_id, venue_name, address, contact, facilities, inclusions, conditions)
VALUES ('00000000-0000-0000-0000-000000000001', 'FutureLabs Hall', 'No. 3 Chubb Road, Ikot Ekpene, Akwa Ibom State', '0703 240 0529',
$f$- Air-conditioned hall with seating for up to 50 guests (chairs and tables arranged to your layout)
- Projector and screen with HDMI connection
- Sound system with two wireless microphones
- High-speed Wi-Fi for the organiser and guests
- Uninterrupted power (grid with generator/inverter backup)
- Clean restrooms
- Parking space on the premises (subject to availability)$f$,
$i$- Exclusive use of the hall for the booked date and time
- 30 minutes before the start time to set up, and 30 minutes after the end time to pack up, at no extra charge
- A FutureLabs staff member on site to open the hall, help with the projector, sound and Wi-Fi, and lock up
- Drinking water for the organiser and speakers
- Use of the reception area for registration or check-in$i$,
$c$1. The booking is confirmed once full payment is received. This receipt is your confirmation.
2. Access is limited to the booked date and time. Staying past the end time is charged at 25% of the booking fee for each extra hour or part of an hour, and only if the hall is free.
3. The organiser is responsible for the conduct of their guests and for any damage to the hall, furniture or equipment, which will be charged at repair or replacement cost.
4. Leave the hall as you found it: remove decorations, materials and rubbish. A cleaning charge applies if extra cleaning is needed.
5. No smoking, open flames or illegal substances on the premises. Alcohol only with written approval from FutureLabs.
6. Do not move or connect FutureLabs equipment without our staff. Bring adapters for your own devices.
7. Food and drinks are allowed only in the areas we show you.
8. Changes to the date or time must be requested at least 72 hours before the booking and depend on availability.
9. Cancellation: 7 or more days before the booking, 80% refund; 3 to 6 days before, 50% refund; less than 72 hours before, no refund.
10. FutureLabs is not responsible for personal items lost or left behind.
11. If FutureLabs must cancel (for example, an emergency at the venue), you get a full refund or a new date of your choice.$c$)
ON CONFLICT (hub_id) DO NOTHING;
