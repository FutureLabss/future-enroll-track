-- Prevent the same email from enrolling in the same program more than once.
-- Uses a partial unique index so cancelled/withdrawn enrollments don't block re-enrollment.
CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollments_email_program_active
  ON enrollments (lower(email), program_id)
  WHERE enrollment_status NOT IN ('cancelled', 'withdrawn');
