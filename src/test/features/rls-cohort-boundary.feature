Feature: Cross-cohort attendance access is denied
  A student who is not a member of a session's cohort must not be able to
  mark attendance for it — mark_attendance() raises "You are not in the
  cohort for this session". This is enforced entirely inside the Postgres
  RPC and its RLS policies; there is nothing on the frontend that performs
  or could perform this check, since the frontend's job here is only to
  send a code, not to decide who's allowed to redeem it.

  Testing this for real means calling the actual RPC as an authenticated
  user who is deliberately outside the cohort, which needs a real (or
  local) Postgres to run against. Pending database-layer test
  infrastructure (pgTAP or a dedicated test Supabase project — see Phase
  3/5 of the test gauntlet plan).

  @pending-db-infra
  Scenario: Student outside the session's cohort cannot mark attendance
    Given a student who is enrolled in the classroom but not in Cohort A
    And an open attendance session scoped to Cohort A
    When the student submits the session's code
    Then the request is rejected with "You are not in the cohort for this session"
    And no attendance_records row is created for the student
