import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';

// Both scenarios are Scenario.skip, not omitted, so the gap shows up in
// every test run (skipped, not silently absent) until pgTAP or a test
// Supabase project exists to run these for real. See the .feature file for
// why this can't be a real JS test today.
const feature = await loadFeature('src/test/features/finance-revenue-bucketing.feature');

describeFeature(feature, ({ Scenario }) => {
  Scenario.skip('Coriftech revenue is bucketed by installment due date', ({ Given, When, Then }) => {
    Given('a Coriftech invoice with an installment due in March, paid in April', () => {});
    When('the finance summary is computed for March', () => {});
    Then('the installment\'s amount counts toward March revenue', () => {});
  });

});
