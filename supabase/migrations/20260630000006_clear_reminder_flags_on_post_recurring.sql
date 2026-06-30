-- When a recurring payment is posted and next_due_date advances, clear all three
-- reminder sent-at flags so the new cycle gets its own reminders.
-- Previously only last_posted_date and next_due_date were updated, causing
-- reminder_1d_sent_at / reminder_3d_sent_at / overdue_sent_at to carry over
-- and silently block every subsequent cycle's notifications.

CREATE OR REPLACE FUNCTION public.post_recurring_income(
  p_id           uuid,
  p_payment_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r          public.recurring_income%ROWTYPE;
  _new_id    uuid;
  _post_date date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can post recurring income';
  END IF;

  SELECT * INTO r FROM public.recurring_income WHERE id = p_id AND active = true;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Recurring income not found or inactive'; END IF;

  _post_date := COALESCE(p_payment_date, r.next_due_date);

  INSERT INTO public.other_income (category, payer_name, amount, payment_date, payment_method, notes, recorded_by, hub_id)
  VALUES (r.category, r.payer_name, r.amount, _post_date, r.payment_method,
          COALESCE(r.notes, '') || ' [recurring]', auth.uid(),
          public.get_my_hub_id())
  RETURNING id INTO _new_id;

  UPDATE public.recurring_income
     SET last_posted_date     = _post_date,
         next_due_date        = public.compute_next_recurrence(r.next_due_date, r.frequency),
         reminder_1d_sent_at  = NULL,
         reminder_3d_sent_at  = NULL,
         overdue_sent_at      = NULL,
         updated_at           = now()
   WHERE id = p_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'post_recurring', 'other_income', _new_id,
          jsonb_build_object('recurring_id', p_id, 'amount', r.amount, 'date', _post_date));

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_recurring_income(uuid, date) TO authenticated;
