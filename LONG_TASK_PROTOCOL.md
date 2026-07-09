# Long-Task Working Protocol

Instructions for sustained, multi-step engineering work. Follow every phase in order. Do not skip gates.

---

## Phase 0: Orient (before touching anything)

Before any modification, build a verified model of the current system.

1. **Map the territory.** Identify every file, module, table, and external service the task touches. List them explicitly. For database work, read the actual schema, not the schema you expect.
2. **Trace, don't assume.** Follow the real data flow end to end for at least one representative case (e.g. one enrollment, one payment, one message). Note where behavior diverges from what the docs or naming suggest.
3. **Find the invariants.** Identify what must remain true when you're done: existing tests, API contracts, DB constraints, integrations that depend on current behavior.
4. **State your model.** Write a short summary: "Here is how this currently works, here is what I verified, here is what I'm assuming." Anything in the assumption list is a risk to check before relying on it.

**Gate:** Do not proceed to planning until you can explain the current behavior without guessing.

---

## Phase 1: Plan

1. **Restate the goal as an outcome.** One sentence describing the end state, testable and unambiguous. Not "add Paystack integration" but "a student can pay via Paystack, the webhook confirms it, and their enrollment status flips to active with no manual step."
2. **Decompose into stages.** Each stage must be independently verifiable and leave the system in a working state. Order stages so the riskiest or most uncertain work comes first, when context is freshest.
3. **Define done for each stage.** For every stage, write the specific check that proves it works: a test that passes, a query that returns the right rows, a request that returns the right response.
4. **Identify rollback points.** Note which stages are easily reversible and which are not (migrations, data backfills, external API state). Anything irreversible gets extra verification before execution.
5. **Surface the plan.** Present the staged plan before executing. Flag any stage where you're less than confident in the approach.

**Gate:** Every stage has a definition of done. No stage depends on an unverified assumption from Phase 0.

---

## Phase 2: Execute (per stage)

1. **One stage at a time.** Complete and verify the current stage before starting the next. Do not interleave stages, even when it seems efficient.
2. **Coherent chunks.** Within a stage, make changes in logical units: a full function, a complete migration, an entire endpoint. Avoid scattering micro-edits across files, which loses the thread.
3. **Preserve the working state.** After each chunk, the codebase should still build and existing tests should still pass. If a chunk necessarily breaks things temporarily, say so and state when it will be whole again.
4. **When something surprises you, stop.** Unexpected behavior means your Phase 0 model was wrong somewhere. Return to investigation, correct the model, update the plan if needed, then resume. Never push through a surprise with a workaround you don't understand.
5. **No silent scope changes.** If you discover the task is bigger, smaller, or different than planned, update the plan visibly and say what changed and why. Do not quietly absorb scope.

---

## Phase 3: Verify (per stage, then globally)

1. **Run the stage's definition of done.** Actually execute the check defined in Phase 1. "It should work" is not verification; the passing test or correct output is.
2. **Check the blast radius.** Re-run anything that touches what you changed: adjacent tests, dependent endpoints, downstream consumers. Changed code that passes its own test but breaks its neighbors is not done.
3. **Adversarial pass.** Before declaring a stage complete, actively try to break it: empty inputs, duplicate submissions, failed webhooks, expired sessions, concurrent writes, missing rows. Fix the plausible failures, explicitly list the ones you deliberately deferred.
4. **Final integration check.** After the last stage, verify the original outcome statement from Phase 1 end to end, not just each stage in isolation.

**Gate:** A stage is complete only when its check has actually run and passed. Never mark done from memory or intention.

---

## Working Notes (maintain throughout)

Keep a running notes block or file (e.g. `NOTES.md` or a pinned summary) updated at every stage boundary. It must contain:

- **Goal:** the one-sentence outcome, unchanged unless scope explicitly changed
- **Current stage:** what you're on, what's left
- **Decisions log:** each significant choice, the alternative rejected, and why (one line each)
- **Corrections:** anywhere your Phase 0 model turned out wrong, and the corrected understanding
- **Deferred items:** known issues, edge cases, and cleanup intentionally left for later
- **Open questions:** anything unresolved that could invalidate later work

**Rules for the notes:**
- Consult the notes before re-deriving anything. If you find yourself re-investigating something, the answer probably should have been in the notes; add it once found.
- After any long stretch of work, re-read the goal and decisions log before continuing. This is the primary defense against drift.
- Notes are for state, not narration. Terse and current beats detailed and stale.

---

## Context Discipline

- **Front-load reads.** Read all files relevant to a stage before editing any of them, so edits are made with full local context.
- **Re-verify before editing stale reads.** If significant work happened since you last read a file, re-read it before modifying. Never edit from a memory of the file.
- **Summarize before context gets heavy.** On very long sessions, periodically compress what's been done into the notes so decisions survive even if earlier detail fades.
- **Anchor on the goal, not the conversation.** When instructions across a long session conflict, flag the conflict and resolve it against the stated outcome rather than silently following the most recent message.

---

## Ambiguity and Escalation

1. **Investigate first.** When something is unclear, check the codebase, schema, docs, and prior notes before asking.
2. **Ask precisely and rarely.** If investigation can't resolve it, ask one specific question with your best-guess answer attached ("I'll assume X unless you say otherwise"), so a non-answer doesn't block progress.
3. **Escalate irreversibility.** Confirm before: destructive migrations, deleting data, changing live payment or messaging behavior, or anything hitting a production external API. Everything else, proceed.

---

## Communication

- **Report by stage, not by keystroke.** At each stage boundary: what was done, what was verified, what's next. Skip play-by-play narration.
- **Show diffs, not files.** Present what changed and why. Do not re-print unchanged code.
- **Confidence honestly.** Distinguish "verified working" from "written and believed correct" from "assumed." Never present the second or third as the first.
- **Failures loudly.** If something can't be made to work, say so directly with what was tried, rather than delivering a degraded version silently.
