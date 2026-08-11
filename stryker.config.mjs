// Mutation testing, scoped deliberately narrow: only files that already
// have unit tests. Mutation testing on untested files just reports "100%
// of mutants survived" everywhere, which is already known from the
// coverage report (Phase 1) — the useful question here is narrower and
// different: for the tests that DO exist, do they actually assert
// anything, or do they just execute lines? Runs on-demand / nightly, not
// on every push — too slow to gate a PR.
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  reporters: ['html', 'clear-text', 'progress'],
  coverageAnalysis: 'perTest',
  mutate: [
    'src/hooks/useAttendance.ts',
    'src/hooks/useCurriculum.ts',
    'src/hooks/useCurriculumV2.ts',
    'src/hooks/useFinanceSummary.ts',
    'src/lib/csv.ts',
    'src/lib/ics.ts',
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: null,
  },
};
