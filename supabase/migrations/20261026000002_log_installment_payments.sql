-- FutureLabs records most money by marking an installment paid (InvoiceDetailPage,
-- confirm_bank_match), not by inserting into payments, so trg_activity_payments
-- never saw it and the Activity Report timeline showed almost no payments.
-- Log the transition to 'paid' on UPDATE only: admin_update_invoice deletes and
-- re-inserts every installment on each invoice edit, and those re-inserts are not
-- new money. When a payments row already backs the installment (PaymentsPage and
-- PendingPaymentsPage insert the payment first), trg_activity_payments has logged it.

CREATE OR REPLACE FUNCTION public.trg_activity_installments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hub  uuid;
  _name text;
  _inv  text;
BEGIN
  BEGIN
    IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid'
       AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.installment_id = NEW.id) THEN
      SELECT pr.hub_id, e.full_name, i.invoice_number INTO _hub, _name, _inv
      FROM public.invoices i
      JOIN public.enrollments e ON e.id = i.enrollment_id
      LEFT JOIN public.programs pr ON pr.id = e.program_id
      WHERE i.id = NEW.invoice_id;

      PERFORM public.record_activity(_hub, 'payment_recorded', 'finance', 'installment', NEW.id, NULL, NULL,
        '₦' || to_char(NEW.amount, 'FM999,999,999,990') || ' payment recorded for ' || COALESCE(_name, 'a student')
          || COALESCE(' (' || _inv || ')', ''),
        jsonb_build_object('amount', NEW.amount, 'invoice_id', NEW.invoice_id,
                           'paid_at', COALESCE(NEW.paid_at_actual, NEW.paid_at)));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_activity_installments: %', SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_activity_installments() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_activity_installments ON public.installments;
CREATE TRIGGER trg_activity_installments
  AFTER UPDATE OF status ON public.installments
  FOR EACH ROW EXECUTE FUNCTION public.trg_activity_installments();
