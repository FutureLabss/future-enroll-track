import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';

// Scenario.skip, not omitted — the gap is visible in every test run
// (skipped, not silently absent) until pgTAP or a test Supabase project
// exists to call the real RPC as a real authenticated non-member. See the
// .feature file for why this can't be a real JS test today.
const feature = await loadFeature('src/test/features/rls-cohort-boundary.feature');

describeFeature(feature, ({ Scenario }) => {
  Scenario.skip('Student outside the session\'s cohort cannot mark attendance', ({ Given, When, Then, And }) => {
    Given('a student who is enrolled in the classroom but not in Cohort A', () => {});
    And('an open attendance session scoped to Cohort A', () => {});
    When('the student submits the session\'s code', () => {});
    Then('the request is rejected with "You are not in the cohort for this session"', () => {});
    And('no attendance_records row is created for the student', () => {});
  });
});
