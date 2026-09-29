---
name: hard-tasks
description: Working method for hard, multi-step, or production-touching tasks — how to decompose them, verify each change at the right layer, and decide what to do next. Use whenever a task spans more than one file or system, touches production data, involves debugging a reported symptom, or follows an incident. Also use when a "simple" fix has failed once already.
---

# Hard Tasks: Decompose, Verify, Decide

The failure mode this skill prevents: producing plausible work that is wrong — a fix for
the wrong cause, a sweep that breaks an invariant the type checker can't see, an
optimization that takes production down. Every rule below was paid for.

## 1. Decompose from evidence, not from the request

**Restate the goal as an observable outcome.** "Users who fully paid still get reminder
emails" decomposes differently depending on *which* system sends the email — so the first
task is never "fix X", it's "find which component actually produced the observed behavior."

**Gather evidence before proposing structure.** In order of trustworthiness:
1. Live state (database rows, deployed code versions, config) — what IS.
2. Logs of the failing moment (find the exact request/row/timestamp the user hit).
3. The code in the repo — what SHOULD be. Treat repo/deployed divergence as a prime
   suspect: a fix that exists locally but was never deployed looks identical to a bug.
4. Your assumptions — label them as such in your notes.

**Rank subtasks by leverage and reversibility.** Do first: changes that are systemic (one
migration fixes 15 tables), directly verifiable (backend you can query), and reversible
(snapshot exists). Do last: broad mechanical sweeps across many files — and treat those as
their own project with their own verification gate (see §2).

**Batch mechanical changes, but classify before scripting.** When applying one pattern to
N files, first scan all N and split them: cases the script handles safely vs. cases
needing hands-on judgment (a closure over changing state, a guard clause above the edit
site). Script the safe ones; do the rest by hand. Never let the script touch a file you
haven't classified.

**Before any risky mass change, create the rollback artifact.** Snapshot the current state
somewhere durable (a backup table, a git tag) *before* the change, and know the exact
command that restores it. If you can't write the restore command in one line, the change
is not ready.

## 2. Verify at the layer the change lives — passing checks prove less than you think

**Match the verification to the failure surface.** This is the core discipline:
- Typecheck and build catch syntax and types — nothing else.
- Framework invariants need the framework's own linter (e.g. React hook-order bugs pass
  tsc and vite build cleanly; only `eslint react-hooks/rules-of-hooks` sees them).
- Database changes need live queries **as the affected identity**, not as admin. Simulate:
  `BEGIN; set_config('request.jwt.claims', '{"sub":"<uid>",...}', true); SET LOCAL ROLE
  authenticated; <the exact failing query>; ROLLBACK;`
- Deployed functions need one real invocation whose expected result you can predict
  (best: an idempotent call where you can assert "sends 0 because dedup").
- Performance claims need `EXPLAIN` — and distinguish *planning* time from *execution*
  time from *lock waits*; they have different causes and different fixes.

**Re-test the original complaint, verbatim.** Pull the failing action from the logs (the
exact row id, the exact user) and run it after the fix. "My new code looks right" and
"the thing the user reported now works" are different claims; only the second closes a task.

**Verify both directions of an access-control change.** After touching permissions: the
allowed identity sees exactly its rows (count them), AND a restricted identity still sees
only its own. One direction alone can hide a wide-open or fully-broken policy.

**When a fix doesn't work, bisect — don't re-theorize.** Split the failing path into
halves you can test independently (plan vs. execution; this user vs. that user; with
feature X off vs. on) and let the results eliminate hypotheses. Two cheap experiments
beat five clever theories. And when new evidence contradicts your published diagnosis,
say so plainly and correct the record — the earlier confident explanation is now a bug too.

**After every incident, ask: which of my checks SHOULD have caught this?** If none could,
add one (a lint, a live-query gate, a planning-time check) and record it where the next
session will see it. A regression that recurs is a process failure, not bad luck.

## 3. Deciding what to do next

**Triage order is absolute:** production down > production wrong (bad data, wrong emails
to real people) > blocked users > everything else. Interrupt any in-progress work for a
higher tier. A refactor can wait; a student getting a false payment demand cannot.

**When production breaks after your change: restore first, understand second.** Roll back
using the artifact from §1, verify service is restored with the §2 identity tests, and
only then investigate at leisure. Diagnosis is cheaper on a healthy system — and the root
cause is often *not* your change but something your change pushed over a threshold; the
rollback buys the time to find that out.

**Fix causes, not symptoms — but bound the blast radius.** When the root cause is a
pattern repeated across the system, fix the instance the user reported, verify it, then
*name* the sibling instances and their risk rather than silently rewriting everything.
Offer the preventive sweep as an explicit next step. Unrequested scope is how one bug
becomes three.

**Distinguish "the task" from "what I found on the way."** Side discoveries (a security
hole, a broken config, data that contradicts the user's description) get surfaced
immediately and explicitly — but they change the plan only if they outrank the current
tier in triage. Otherwise: note, report, continue.

**Know what only the user can decide.** Destructive actions on data you didn't create,
spending, outward-facing sends beyond the request, and product-behavior choices (what a
rejection email should say) need the user. Everything reversible that serves the stated
goal does not — do it, then report what you did and how you verified it.

**Write down what changes future behavior.** When a task ends, three things must survive
the session: (a) state you changed that isn't visible in the repo (disabled jobs, rotated
keys, config edits) with the re-enable command; (b) failure classes discovered, with the
check that now guards them; (c) the follow-ups you deliberately deferred. If a rule was
paid for with an outage, put it where it will be read *before* the next attempt — in
CLAUDE.md, not in a summary that scrolls away.

## Quick pre-finish gate

Before declaring any hard task done:
1. Did I run the user's exact failing case, and did it pass?
2. Did every changed layer get its own layer-appropriate check (types, lint, live query,
   deployed invocation)?
3. Can I state the root cause in one sentence that names a mechanism, not a symptom?
4. Is the rollback path for what I changed written down and tested?
5. Did I record the durable lessons and the deferred follow-ups where they'll be found?
