# Wave 1: repository drift

## Studio dependency review

The Studio app budget is 22 runtime dependencies, including 18 workspace dependencies.
The additional workspace dependency is `@athyper/platform-entity-list-view`: the app
layout imports its public stylesheet for the bank-directory list. Loading global list
styles belongs to application composition, so this dependency stays in the app.

The Studio business-partner budget is six runtime/workspace dependencies. Its existing
API client and app-foundation hooks remain necessary. The four additions are:

| Dependency                           | Actual consumer and purpose                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `@athyper/platform-shell`            | `bank-directory.tsx` and `bank-directory-manage.tsx`: management navigation, headers and toolbar |
| `@athyper/platform-entity-list-view` | `bank-directory-manage.tsx`: the shared sticky table                                             |
| `@athyper/platform-ui`               | Both bank-directory screens: shared buttons and input controls                                   |
| `@athyper/platform-icons`            | Both screens: bank, search, filter and table-settings icons                                      |

These imports use shared platform UI rather than another plane or server code. Moving
or hiding them behind a forwarding package would obscure the actual dependency graph.
The budgets are increased to exactly these reviewed counts, with no spare allowance.
Future additions must still fail the existing budget check until separately reviewed.

## Independent policy diagnostics

`pnpm policy:static` runs the checked-in `ci` profile in
`governance/config/governance/static-policy-profiles.json`. It contains the union of
existing workspace and release-boundary checks plus the independent static CI steps.
Duplicate script names run once. Each required script is validated before execution;
missing, recursive or empty profiles fail. Each subprocess has a five-minute timeout.

The runner collects failures without stopping later checks and returns a failing exit
status if any required check fails, crashes or times out. It writes individual logs,
`results.json`, `summary.md` and `source.json` under `~/.athyper/instances/dev/artifacts/static-policy/<run-id>/<profile>/`.
CI uploads these artifacts even after failure and writes the table to its job summary.
A dirty source report describes local diagnostics, not qualification of a committed SHA.

`pnpm policy` and `pnpm policy:release-boundaries` retain their existing check selections
but now aggregate results. `pnpm policy:wave1` provides the focused dependency-budget,
route-manifest and changed-format checks. Broader Wave 0 failures remain blocking.

Database provisioning, seeding, fixture validation and assertions are outside this
runner and stay sequential. Code generation still precedes generated-file validation,
typechecking and tests. A failed static-policy step still fails the Quality Gate.

## Changed-file formatting

`pnpm format:changed:check` checks changed files; `pnpm format:changed` writes formatting.
The existing Prettier defaults and `.prettierignore` remain authoritative. This replaces
the former misleading `format:changed` command that formatted the entire source tree.

- Locally, selection includes staged, unstaged and untracked files relative to HEAD.
- On pull requests, selection starts at the merge base with the PR base SHA.
- On pushes, selection starts at the event's previous SHA.
- For new branches or manual CI runs, selection uses the default-branch merge base.
  If no meaningful prior baseline is available, the check fails and requires `--base`
  (or the manual workflow’s `format_base` input).
- `pnpm format:changed:check --base <commit>` explicitly checks the whole candidate
  against that base. Missing Git history fails; it never silently selects nothing.

Deleted files are excluded. Renames use the destination path; filenames are passed as
literal paths through the Prettier API. Ignored and unsupported file counts are reported.
An empty formatting selection is reported explicitly and does not imply test coverage.
Generated route manifests and the URL catalogue are excluded from Prettier because their
own generator checks enforce exact contents. Other established ignore rules are retained.

## Qualification

Run focused tooling tests, `pnpm test:url-catalogue`, and `pnpm policy:wave1` while editing.
Regenerate the route manifest after any route-source formatting changes, and run its check
again to verify deterministic output. Review route additions/removals and legacy provenance;
do not refresh the historical baseline just to clear drift.

Before joint Wave 0/Wave 1 closure, run `pnpm policy:static` and the full dependent suites
on a frozen candidate, inspect the retained logs, then commit and qualify that exact SHA
through both required GitHub checks and active merge protection. No commit is made by
these tooling commands. Implementation readiness alone does not close the phase.

## Neon review dependency

Neon's budget is now 27 runtime dependencies, including 23 workspace dependencies.
The one added dependency is `@athyper/platform-iam-governance-review`: it owns the
existing Node-only authenticated review handlers and their transitive decision logic.
This replaces the undeclared imports into `tooling/scripts/verification`; it does not
add a new review authority. CLI callers re-export the same implementation. Production
bundles may include these handlers, but their development-origin, explicit enablement,
authentication, CSRF, step-up, and revision checks remain in force. The package itself
has no runtime dependencies. The frontend policy now rejects relative imports escaping
an app package, so this dependency cannot silently move back into tooling.

The same check exposed Studio's existing qualification JSON imports outside its app.
`@athyper/governance-qualification-data` now explicitly exports those two source
artifacts from their existing governance directory. No copies or inferred qualification
results are created. Studio's budget therefore increases by one to 23 runtime / 19
workspace dependencies, with no unused allowance.
