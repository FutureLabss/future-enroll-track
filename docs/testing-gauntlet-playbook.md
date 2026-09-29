# The testing gauntlet playbook

A portable checklist for setting up the "don't read the code, trust the gauntlet"
testing approach in any project. Built and proven on `future-enroll-track`
(see PR #1); copy this file into any other repo and work through it fresh —
every check here is meant to be re-verified per project, not assumed.

## The core rule, before anything else

**A gate is either automatic and honest, or it's theater — there's no third
option.** Two failure modes to watch for constantly:

1. **Not automatic.** A test suite nobody is forced to run is a suggestion,
   not a gate. If it's not wired into CI and blocking, it doesn't count as
   done, no matter how good the tests are.
2. **Not honest.** A test that claims to verify a rule but can't actually
   reach the code that enforces it (because the logic lives in a database,
   a third-party service, or another layer your test runner can't touch) is
   worse than no test — it's a green checkmark that means nothing. If you
   can't test something for real, say so out loud (a visibly skipped test,
   a comment, a doc note) rather than fake it.

Every phase below exists to serve one or the other of these two rules.

---

## Phase 0 — a lint gate that's honest about legacy debt

**Goal:** new code meets the standard immediately; old code doesn't block it.

Don't just run the linter on the whole repo and make it blocking — any
project with history will have pre-existing debt, and a gate that's red on
day one from unrelated code trains everyone to ignore it.

**The mistake to avoid:** a "changed *files*" gate is not good enough. If
someone touches one line in a legacy file that already has 200 pre-existing
errors, a whole-file gate blames all 200 on their one-line change. **Gate on
changed *lines*, not changed files** — parse the diff hunks (`git diff -U0
<base>...HEAD`), extract the actual added/changed line numbers per file, run
the linter with a JSON/structured formatter, and only fail on lint messages
whose line number falls inside a changed range.

Steps:
1. Add a script that resolves the merge-base against the default branch,
   lists changed files, and filters lint output to changed lines only.
2. **Prove it against your own real diff before trusting it** — touch a
   legacy file with known pre-existing errors, confirm the gate stays quiet
   about the old errors and only flags your new ones.
3. Wire it into CI as a blocking step, separate from a full-repo lint pass
   that stays informational (`continue-on-error`) until the backlog is
   politically worth paying down.
4. In CI, `actions/checkout` needs `fetch-depth: 0` (or enough history) —
   a shallow clone breaks `git merge-base`.

## Phase 1 — coverage baseline before any threshold

Add the coverage tool, run it once, **look at the real number** before
deciding anything. Don't invent a threshold — report the baseline as
informational in CI, and only turn it into a blocking minimum once a human
has actually seen it and decided it's the right bar. A surprising number
(e.g. single-digit % because only hooks/logic are tested and UI pages
aren't) is itself useful information — report it plainly, don't round up.

## Phase 2 — Gherkin/BDD, but only where it's real

Pick a handful (2-4) of the business rules that have already caused a
production incident or would be expensive to get wrong — not everything.

**Before writing a scenario, ask: can my test runner actually reach the code
that enforces this rule?** If the rule lives entirely in a database function,
an RLS policy, a third-party webhook handler, or anything else outside your
test runner's process, a "passing" JS/whatever step for it is fake — it
executes nothing real. In that case:
- Write the `.feature` file anyway (it's a genuine, readable spec — value on
  its own, and something a non-reader-of-code can review and approve).
- Write the step definitions as explicitly **skipped** (e.g.
  `Scenario.skip(...)`), with a comment explaining *why* and what
  infrastructure would need to exist to make it real.
- Never write a step that doesn't actually exercise the real code path just
  to make the run look green.

For the scenario(s) that genuinely are testable: **prove the test can fail.**
Temporarily reintroduce the bug it's meant to catch, run it, confirm it goes
red, then revert. A test that has never been observed to fail is unverified.

## Phase 3 — the layer your primary test runner can't reach

Every project has one: a database layer, a queue consumer, a webhook, a
cron job. Identify it explicitly rather than letting it stay invisible.

- If you have Docker and the scale justifies it: spin up a real local
  instance of that layer (e.g. Postgres via your platform's local dev CLI)
  and test against it directly.
- If you don't (small team, small scale, "we are not using Docker" is a
  legitimate answer): the honest fallback is a dedicated *test* instance of
  that layer (a second database/project, seeded, isolated from prod) — not
  production, and not skipped forever. Until that exists, Phase 2's skipped
  scenarios above are the correct, honest placeholder.
- Never run destructive or exploratory tests against production to avoid
  standing up test infrastructure.

## Phase 4 — mutation testing (verify the tests are real gates)

Coverage tells you code was *executed* by a test. It doesn't tell you the
test *asserts* anything meaningful. Mutation testing answers that: it
deliberately breaks your source code in small ways and checks whether any
test notices.

- Scope it narrow on purpose — only files that already have unit tests.
  Running it against untested files just reproduces what the coverage
  report already told you.
- It's slow. Don't gate every push on it — run it on a schedule (nightly)
  as a separate CI job, informational/reported, not blocking.
- Pin the mutation tool's version to match your test runner's major
  version — these tools have strict peer dependencies and "latest" will
  often want a newer major version of your test runner than you're
  actually running. Check `npm view <package> peerDependencies` before
  installing, and pick the newest version that matches what's already
  installed, rather than force-upgrading your test runner as a side effect.

## Wiring it all into CI

- **Trigger scope matters.** A workflow that only listens on `push:
  branches: [main]` and `pull_request: branches: [main]` will *not* run on
  a plain feature-branch push — only once a PR exists targeting the
  branch it's scoped to. If nothing seems to be running, check this first
  before debugging the workflow itself.
- Split "every push" concerns (lint, typecheck, unit tests, coverage) from
  "too slow for every push" concerns (mutation testing, e2e against a real
  environment) into separate jobs, gated by `if: github.event_name == ...`
  or a `schedule:` trigger.
- After first wiring CI, **open a real PR and watch it actually run** —
  don't consider it done from reading the YAML. It will very likely catch
  something on the first real run (a pre-existing issue, a version
  mismatch, a path assumption that didn't hold in the CI environment) —
  that's the gate working, not a sign something's wrong with the setup.

---

## Pitfalls actually hit building this (read before you hit them again)

- **macOS ships an old bash** (3.2, no `mapfile`/associative-array support).
  Prefer a small Node script over a bash script for anything beyond trivial
  glue — it's portable and JSON-friendly for parsing lint/diff output.
- **BDD step lifecycle surprises.** Frameworks that turn `Given`/`When`/
  `Then` into separate test cases (rather than one function body) mean a
  normal `beforeEach` will fire *between* your steps and can wipe mock
  state before your assertion step runs. Use whatever the framework's
  once-per-scenario hook is (e.g. `BeforeEachScenario`), and consider
  capturing values into scenario-scoped variables during `When` rather
  than relying on a mock's call history surviving into `Then`.
- **Long-running background jobs are not guaranteed to survive** a session
  or environment restart — a mutation-testing run left going in the
  background can be silently killed with no report and no error, hours in.
  Don't treat "I started it in the background" as "it will finish." The
  durable home for a slow check is a scheduled CI job, not a local
  long-running terminal command you're hoping to check back on.
- **A gate you just built will find real issues immediately** — including
  in code that isn't yours (a teammate's already-merged commit, an old
  file nobody's touched in months). Fix what's clearly safe and in-scope
  (a type annotation, a lint fix with no behavior change); flag anything
  bigger rather than silently expanding scope.

---

## Adapting to a different stack

Everything above is written stack-agnostic on purpose except the concrete
examples (TypeScript/ESLint/Vitest/Supabase). The mapping to a different
stack:

| Concept here | Equivalent to find in your stack |
|---|---|
| ESLint + changed-lines gate | Whatever linter/formatter your language has, run in diff mode |
| `@vitest/coverage-v8` | Your test runner's native coverage flag |
| `@amiceli/vitest-cucumber` | Any Gherkin runner that plugs into your existing test runner, or your language's standard Cucumber binding |
| Postgres/Supabase RLS as "the untestable layer" | Whatever in your stack lives outside your primary test runner's process — often a database, a queue, or a third-party integration |
| StrykerJS | A mutation-testing tool for your language (Stryker also covers JS/TS/C#; most major languages have one — check peer/runtime version compatibility the same way) |

The philosophy — automatic, honest, narrow-scoped, prove-it-can-fail — is
the part to actually replicate. The specific tool names are just what
happened to fit this project's stack.
