# Reviewed Country UI inventory and placeholder verification

## Reproducible scope

Run `node tooling/scripts/verification/inventory-entity-ui.mjs` for the full
candidate inventory, including text/value excerpts. The adjacent JSON report
records per-file hashes, locations and counts for the captured working tree.
Scope: shared form-detail, list-view and collaboration-ui source, not BP or every
application in the monorepo. Tests and generated application outputs are excluded.

Results: 114 files; 419 text candidates across 36 files; 558 literal CSS declaration
candidates. These do not reproduce the earlier 544/2,166 claims: scope and detection
rules are explicit and different. Candidates are not automatically confirmed bugs.
The AST scanner excludes imports, catalog lookups and ordinary identifiers, but
copy-shaped metadata can be a false positive. Conditional/dynamic strings and inline
styles need a later coverage extension; this is not an exhaustive translation audit.

## Prioritized disposition

1. List runtime index: 175 text candidates. Next translation slice should cover
   search/filter/sort/group/column controls and their accessible names together.
2. Data operations: 71 candidates; transfer workspace: 40. Translate import/export
   validation, progress and recovery copy as a separate slice with ICU parameters.
3. Overview: 10; intake and protected-value: 9 each. Preserve field-security behavior
   and safe fallback errors while migrating copy. Remaining per-file locations are
   recorded in the JSON inventory.
4. CSS semantic candidates (typography, color, borders and outlines) should use the
   established theme vocabulary where equivalent. Layout widths, percentages,
   viewport dimensions and responsive breakpoints are reviewed separately; do not
   mechanically replace them or introduce unsupported var() media queries.

The existing theme checker reports `--a-page-sticky-top` across two detail files.
It is defined by `.athyper-shell__body` in the shared shell stylesheet, so this is
an inherited layout contract, not evidence that the token is undefined repository-wide.
The checker only considers global theme authority and definitions within each file.
Standalone rendering still needs the shell or a documented fallback; no authority
token was invented to silence this contextual finding.

## Three placeholders verified

`content-ui`, `workflow-ui`, and `cascade` each have exactly one source file,
`src/index.ts`, containing only `export {};`. No package/source consumers were found
under apps, packages or server. The regression test repeats this check and requires
re-review if an implementation or consumer is added.

Only workflow-ui appears in the frontend spine inventory (and a historical BP
phase-zero plan). Neither is proof of runtime activation. The current spine entry
now explicitly records reserved-placeholder status. A separate placeholder inventory
covers all three. Nothing was deleted; historical plans and BP metadata were not edited.

## Commit boundary and release status

This reviewed commit contains only the inventory tool/tests, captured inventory,
placeholder classification and this review. The index was empty before staging.
It intentionally excludes the hundreds of existing modifications, deletions and
untracked runtime files. It is an audit/governance checkpoint, **not a self-contained
commit of the runtime fixes or a signed release**.

In particular, the prior Country implementation includes untracked detail/navigation,
localization and test files plus changes overlapping existing work. Committing the
whole runtime directory would silently absorb that work; committing individual new
files alone would produce an unqualified dependency-incomplete release revision.
An integration/release commit requires explicit review of that larger dependency
closure. Release 8 acceptance and historical payloads remain untouched.

Inventory completion is not translation completion: the candidates above are an
actionable backlog, not 419 strings automatically migrated in this change.
