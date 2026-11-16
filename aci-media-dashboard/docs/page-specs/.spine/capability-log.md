# .spine/capability-log.md — capability tracking (Phase 3, review-correction depth)

Appended by the controller after each task review and each whole-branch review.
Not enforced, not a gate — visibility only. The question this answers: are
reviewers catching LOGIC errors (real correctness bugs), or drifting toward
STYLE-only findings (naming, formatting, taste)? Drift toward style-only over
several tasks/branches is the skill-atrophy early warning — it does not fix
anything by itself, but it beats not knowing.

Format: `<task-or-branch>: logic=<N> style=<N> verdict=<approved|needs-fixes>`

<!-- entries appended below, oldest first -->
