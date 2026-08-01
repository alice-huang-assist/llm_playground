---
name: finn-review
description: Review open PRs against their linked Linear issues and required GitHub checks, then post a three-group verdict with Finn-loop labels. On loop-approved with green required CI, enable squash auto-merge. Use when asked to run Finn-loop's reviewer or review its PR queue. Designed for /loop; never pushes code to the PR branch.
---

# Finn-loop reviewer

One pass = one PR reviewed (or one already-approved PR nudged onto auto-merge).
Under `/loop`, each iteration runs this skill once.

## 1. Find a PR needing review

```bash
gh pr list --state open --json number,title,labels,isDraft,headRefOid,updatedAt,url,autoMergeRequest
```

Skip drafts. For each PR, find the latest comment whose first line is
`Finn-loop review of COMMIT_SHA`.

**Already approved for this SHA:** If that recorded SHA equals the current
`headRefOid`, the PR has `loop-approved`, and it does **not** have
`needs-human-review`, go to step 5 (enable auto-merge if needed) and end.
Do not re-review unchanged commits.

Skip a PR when that recorded SHA equals its current `headRefOid` and it has
`loop-changes-requested` or `needs-human-review` (repair or human queue).

Review it again when new commits landed after the recorded SHA. If nothing
needs review or an auto-merge nudge, say so and end the pass.

## 2. Read the contract and code

- Parse the linked issue identifier from `Closes ALI-NNN` in the PR body and
  fetch the full Linear issue, including comments and relations. No linked
  issue is a must-fix finding.
- Read the full diff and every changed file in context.
- Review only against the linked issue: acceptance-criteria gaps, defects,
  broken data flow, unnecessary scope expansion, security problems, missing
  loading/error states, and code future agents will struggle to modify.
- Do not suggest unrelated improvements unless they are severe.

Every must-fix code finding starts with one of:

- `[AC-N]` — the PR does not satisfy that acceptance criterion
- `[DEFECT]` — the implementation is broken while staying inside scope
- `[SECURITY]` — a severe security issue blocks shipping
- `[CI]` — a required GitHub check failed

Non-goals are binding. If fixing a finding would require behavior excluded by
an `NG-N`, do not prescribe code. Record
`[SCOPE-CONFLICT AC-N ↔ NG-N]` with the exact contradiction and mark the PR for
human escalation.

## 3. Check merge evidence

Inspect the current PR head, mergeability, and required checks:

```bash
gh pr view NUMBER --json headRefOid,mergeable,mergeStateStatus,autoMergeRequest
gh pr checks NUMBER --required --json bucket,name,state,link
```

- If required checks are pending or mergeability is still unknown, report that
  the PR is waiting and end without posting a verdict or changing labels. A
  later loop pass will retry it.
- Failed required checks are `[CI]` must-fix findings.
- A merge conflict is a `[DEFECT]` must-fix finding.
- If the repository has no required checks, mark the PR for human escalation;
  do not apply `loop-approved`. Finn-loop does not treat missing CI as green.

Review the exact `headRefOid` used for this evidence. Re-fetch it immediately
before posting. If it changed, discard the review and start again on a future
pass.

## 4. Post one verdict

Post one comment in this structure:

```md
Finn-loop review of COMMIT_SHA

CI: required checks passed | failed | not configured
Mergeability: clean | conflicting

## Review

Summary: one or two plain-language sentences on what this PR does.

## 1. Must fix before merge

None.

## 2. Should fix soon

None.

## 3. Safe to merge

Yes — automated review evidence is complete. Enabling squash auto-merge.
```

Then set labels based on the verdict, checking existing labels before removing
them so an absent label does not fail the command:

- No must-fix and no new escalation: add `loop-approved`; remove
  `loop-changes-requested`. Preserve a pre-existing `needs-human-review` label
  because it may represent a separate high-risk human gate. If
  `needs-human-review` is present, set "Safe to merge" to
  `No — needs-human-review; not enabling auto-merge.` and skip step 5.
- Must-fix present: add `loop-changes-requested`; remove `loop-approved`.
  Set "Safe to merge" to `No — must-fix items remain.` Skip step 5.
- Scope conflict or no required CI: add `needs-human-review`; remove both
  `loop-approved` and `loop-changes-requested`; set "Safe to merge" to
  `No — human decision required.` Skip step 5.

The escalation path deliberately leaves the automated repair queue. A human
must resolve the reason, change the issue or repository configuration as
needed, and remove `needs-human-review` before Finn-loop reviews that unchanged
commit again.

When the verdict is `loop-approved` and `needs-human-review` is absent,
continue to step 5 in the same pass.

## 5. Enable squash auto-merge

Only when **all** of the following hold:

- PR has `loop-approved`
- PR does **not** have `needs-human-review`
- Required checks passed for the current `headRefOid`
- PR is mergeable (no conflicts; `mergeStateStatus` is not `DIRTY`)
- Auto-merge is not already enabled

Then enable GitHub auto-merge with squash:

```bash
gh pr merge NUMBER --auto --squash
```

If auto-merge is already enabled, report that and end. If enabling fails
(permissions, branch protection, merge queue rules), comment the exact error on
the PR, leave `loop-approved` in place, and end the pass so a human can fix
repo settings. Do not fall back to an immediate non-auto merge.

Re-fetch `headRefOid` immediately before enabling. If it changed since the
verdict, do not enable auto-merge; a later pass will re-review.

## 6. Hard limits

- Never push commits to the PR branch.
- Never approve or request changes through a formal GitHub review. Use one
  comment plus labels because the loop may run on the PR author's token and
  GitHub rejects self-reviews.
- Never merge immediately with `gh pr merge` without `--auto`. Auto-merge waits
  for required checks; that is intentional.
- Never enable auto-merge when `needs-human-review` is present or the verdict
  was not `loop-approved`.
- `/finn-build` still never merges; only this reviewer enables auto-merge.
