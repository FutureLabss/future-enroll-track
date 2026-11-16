-- Enrolled students as a digest audience. Before this the list held only imported
-- contacts, CRM leads and picked staff, so a student who never became a lead or a
-- contact got nothing. Placeholder addresses from the payment-register import
-- (@no-email.invalid) and cancelled enrollments are skipped; unsubscribes still win.

ALTER TABLE public.email_digest_settings
  ADD COLUMN IF NOT EXISTS include_students boolean NOT NULL DEFAULT false;

ALTER TABLE public.email_digest_deliveries DROP CONSTRAINT IF EXISTS email_digest_deliveries_recipient_kind_check;
ALTER TABLE public.email_digest_deliveries
  ADD CONSTRAINT email_digest_deliveries_recipient_kind_check CHECK (recipient_kind IN ('staff', 'student', 'contact', 'lead'));

CREATE OR REPLACE FUNCTION public._digest_audience(p_hub_id uuid)
RETURNS TABLE (normalized_email text, full_name text, recipient_kind text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (
    SELECT * FROM public.email_digest_settings WHERE hub_id = p_hub_id
  ),
  candidates AS (
    SELECT lower(trim(st.email)) AS normalized_email, st.full_name, 'staff' AS recipient_kind, 1 AS priority
    FROM public.staff st, s
    WHERE st.hub_id = p_hub_id AND st.active AND st.id = ANY (s.staff_ids)
      AND position('@' IN COALESCE(st.email, '')) > 1
    UNION ALL
    SELECT lower(trim(e.email)), e.full_name, 'student', 2
    FROM public.enrollments e JOIN public.programs p ON p.id = e.program_id, s
    WHERE s.include_students AND p.hub_id = p_hub_id
      AND e.enrollment_status <> 'cancelled'
      AND position('@' IN COALESCE(e.email, '')) > 1
      AND lower(trim(e.email)) NOT LIKE '%@no-email.invalid'
    UNION ALL
    SELECT c.normalized_email, c.full_name, 'contact', 3
    FROM public.email_contacts c, s
    WHERE s.include_contacts AND c.hub_id = p_hub_id
      AND (cardinality(s.contact_lists) = 0 OR c.list_name = ANY (s.contact_lists))
    UNION ALL
    SELECT l.normalized_email, l.full_name, 'lead', 4
    FROM public.crm_leads l, s
    WHERE s.include_leads AND l.hub_id = p_hub_id
      AND l.normalized_email IS NOT NULL AND position('@' IN l.normalized_email) > 1
      AND l.suppressed_at IS NULL
      AND NOT (l.lifecycle_status = ANY (s.excluded_lead_statuses))
  )
  SELECT DISTINCT ON (c.normalized_email) c.normalized_email, c.full_name, c.recipient_kind
  FROM candidates c
  WHERE NOT EXISTS (SELECT 1 FROM public.email_suppressions x WHERE x.hub_id = p_hub_id AND x.normalized_email = c.normalized_email)
    AND NOT EXISTS (SELECT 1 FROM public.crm_leads l WHERE l.hub_id = p_hub_id AND l.normalized_email = c.normalized_email AND l.suppressed_at IS NOT NULL)
  ORDER BY c.normalized_email, c.priority;
$$;

REVOKE ALL ON FUNCTION public._digest_audience(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.preview_digest_audience()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub uuid := public.get_my_hub_id();
BEGIN
  IF NOT (public.is_superadmin() OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'total', count(*),
      'staff', count(*) FILTER (WHERE recipient_kind = 'staff'),
      'students', count(*) FILTER (WHERE recipient_kind = 'student'),
      'contacts', count(*) FILTER (WHERE recipient_kind = 'contact'),
      'leads', count(*) FILTER (WHERE recipient_kind = 'lead'),
      'suppressed', (SELECT count(*) FROM public.email_suppressions WHERE hub_id = _hub)
    )
    FROM public._digest_audience(_hub)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_digest_audience() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_digest_audience() TO authenticated;
