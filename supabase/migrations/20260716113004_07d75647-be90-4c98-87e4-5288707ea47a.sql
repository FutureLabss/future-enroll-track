
-- Helper: is the given user enrolled in this cohort?
CREATE OR REPLACE FUNCTION public.is_cohort_member(_user_id uuid, _cohort_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments
    WHERE cohort_id = _cohort_id AND user_id = _user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_cohort_member(uuid, uuid) TO authenticated;

-- =========================================================================
-- Cohort Schedules
-- =========================================================================
CREATE TABLE public.cohort_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  scheduled_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  location text,
  meeting_link text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cohort_schedules TO authenticated;
GRANT ALL ON public.cohort_schedules TO service_role;

ALTER TABLE public.cohort_schedules ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_cohort_schedules_cohort ON public.cohort_schedules(cohort_id, scheduled_date, start_time);

CREATE TRIGGER update_cohort_schedules_updated_at BEFORE UPDATE ON public.cohort_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Admins manage cohort schedules"
  ON public.cohort_schedules FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Cohort members view schedules"
  ON public.cohort_schedules FOR SELECT
  USING (public.is_cohort_member(auth.uid(), cohort_id));

-- =========================================================================
-- Cohort Announcements
-- =========================================================================
CREATE TABLE public.cohort_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cohort_announcements TO authenticated;
GRANT ALL ON public.cohort_announcements TO service_role;

ALTER TABLE public.cohort_announcements ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_cohort_announcements_cohort ON public.cohort_announcements(cohort_id, created_at DESC);

CREATE TRIGGER update_cohort_announcements_updated_at BEFORE UPDATE ON public.cohort_announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Admins manage cohort announcements"
  ON public.cohort_announcements FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Cohort members view announcements"
  ON public.cohort_announcements FOR SELECT
  USING (public.is_cohort_member(auth.uid(), cohort_id));

-- =========================================================================
-- Cohort Messages (shared chat)
-- =========================================================================
CREATE TABLE public.cohort_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cohort_messages TO authenticated;
GRANT ALL ON public.cohort_messages TO service_role;

ALTER TABLE public.cohort_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_cohort_messages_cohort ON public.cohort_messages(cohort_id, created_at);

-- Admins can do anything
CREATE POLICY "Admins manage cohort messages"
  ON public.cohort_messages FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Cohort members can read the whole thread
CREATE POLICY "Cohort members view messages"
  ON public.cohort_messages FOR SELECT
  USING (public.is_cohort_member(auth.uid(), cohort_id));

-- Cohort members can post as themselves
CREATE POLICY "Cohort members post messages"
  ON public.cohort_messages FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_cohort_member(auth.uid(), cohort_id)
  );

-- Anyone can delete their own message
CREATE POLICY "Users delete own messages"
  ON public.cohort_messages FOR DELETE
  USING (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.cohort_schedules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cohort_announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cohort_messages;
