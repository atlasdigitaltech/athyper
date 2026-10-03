# MDG source reorganization — 2026-09-21

## Completed boundary

Moved all 132 non-cache files from the `New_Entity` working-tree package,
including modified and untracked BP2/collaboration definitions. All 108 entity
JSON files plus schema/review JSON were byte-identical to the pre-move inventory.
Logical artifact identities, hashes, release membership and draft status were
not rewritten. No Git reset, staging, database write, publication or deployment
was performed by this reorganization.

Physical destinations:

- Entity/dependency artifacts: `metadata/products/mdg/entities/`.
- Registry/storage/review evidence: `metadata/products/mdg/review/`.
- Package README and contract: `metadata/products/mdg/`.
- Draft artifact schemas: `metadata/schemas/entity-artifacts-v2/`.
- Python validation tools/tests/requirements: `tooling/scripts/metadata/`.

Updated compiler/contract/capability tests, the CA integration fixture, the local
compiled-runtime publisher, reconciliation tooling, CI and documentation paths.
Replaced the legacy root `metadata/` ignore rule with an explicit source-layout
allowlist so the moved files are visible to Git while unknown local exports stay ignored.
The publisher and compiler tests resolve review evidence separately while keeping
artifact references relative to the entity root. Corrected the publisher's default
repository-relative root depth while updating its path.

The only old-path executable is a delegating live-schema verifier because the
unchanged hashed review envelope records that command. No old-path entity JSON
copies or symlink aliases remain. `relocation-map.json` provides the complete map.

## Verification

| Check | Result |
| --- | --- |
| Layout + original JSON byte baseline | Pass: 132 mapped files, 108 entity JSON files |
| Publication compiler/BP2 admission tests | 8 pass |
| Publication contract/capability tests | 26 pass |
| Capability policy tests | 10 pass |
| Layout guard regressions | 4 pass |
| Platform-host typecheck | Pass |
| Updated metadata Markdown links | 8 checked, no broken targets |
| `git diff --check` | Pass |
| Full Python artifact validator | Pass: 107 source artifacts; compiler-owned hashes are materialized in memory |
| Python mutation suite | Pass: 35 tests |

The source validator now distinguishes authoring input from compiled output:
new sources remain hash-free, legacy source hashes are non-authoritative, and
the immutable hashes are verified only by `validate.py --release-ready` against
a complete signed release receipt. Shared-reference bindings have pinned DDL
evidence. Live database gates were not run; this change did not deploy.

## Coordination and remaining scope

All teams should now edit the new source paths. Do not restore the old directory
from a stale branch; apply incoming artifact edits at their mapped destination.
The inventory hashes are historical move evidence; ordinary feature edits may
change them. `metadata:check-layout` checks the current structure; `--baseline`
is only the one-time byte-preservation qualification.

Native graph assemblers, server providers, runtime code and DDL remain in their
existing packages. Older definition bundles/compiled descriptor captures remain
as explicitly historical documentation evidence. Their locations are recorded in
the root metadata README, rather than incorrectly relabelled as deployable source.
Further extraction of native-builder data and cross-product shared dependencies
requires a separate typed assembly/dependency change, not another blind file move.

The native BP publication prerequisite remains unchanged: moving split-artifact
review JSON does not create the missing native intake surfaces in Studio's
published graph. No release-readiness or full migration completion is claimed.
