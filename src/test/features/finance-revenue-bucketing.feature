Feature: Finance revenue bucketing
  Revenue can be viewed by installment due date or actual payment date.
  Getting this wrong silently misstates monthly revenue.

  This rule is implemented entirely inside a Postgres RPC (the finance
  summary function) — there is currently no equivalent logic in the
  frontend for a test to call. Pending database-layer test infrastructure
  (pgTAP or a dedicated test Supabase project — see Phase 3/5 of the test
  gauntlet plan) to actually execute it against real rows.

  @pending-db-infra
  Scenario: Coriftech revenue is bucketed by installment due date
    Given a Coriftech invoice with an installment due in March, paid in April
    When the finance summary is computed for March
    Then the installment's amount counts toward March revenue
