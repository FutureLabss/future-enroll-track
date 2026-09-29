-- Add overdue_sent_at to track when the overdue reminder was dispatched,
-- matching the existing reminder_1d_sent_at / reminder_3d_sent_at pattern.
ALTER TABLE public.recurring_income
  ADD COLUMN IF NOT EXISTS overdue_sent_at timestamptz;
