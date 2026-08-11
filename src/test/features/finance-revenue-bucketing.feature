Feature: Finance revenue bucketing by hub
  Per CLAUDE.md, revenue is bucketed differently by hub: FutureLabs revenue
  is bucketed by installments.due_date where status = 'paid'; RhemaHub
  revenue is bucketed by payments.created_at. Getting this wrong misstates
  monthly revenue for one hub without necessarily breaking anything visibly.

  This rule is implemented entirely inside a Postgres RPC (the finance
  summary function) — there is currently no equivalent logic in the
  frontend for a test to call. Pending database-layer test infrastructure
  (pgTAP or a dedicated test Supabase project — see Phase 3/5 of the test
  gauntlet plan) to actually execute it against real rows.

  @pending-db-infra
  Scenario: FutureLabs revenue is bucketed by installment due date
    Given a FutureLabs invoice with an installment due in March, paid in April
    When the finance summary is computed for March
    Then the installment's amount counts toward March revenue

  @pending-db-infra
  Scenario: RhemaHub revenue is bucketed by payment date
    Given a RhemaHub invoice with a payment recorded in April for a March due date
    When the finance summary is computed for April
    Then the payment's amount counts toward April revenue
