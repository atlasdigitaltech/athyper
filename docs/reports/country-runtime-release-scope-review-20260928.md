# Country runtime release: integration boundary review

Status: blocked on a scope decision before creating a complete runtime commit.
No runtime commit, GitHub push, service restart or successor publication was
performed during this review. The existing inventory commit is ef5dc508b.

## Verified repository state

- Branch: stack-v2-foundation; origin: atlasdigitaltech/athyper on GitHub.
- Remote branch still points to 535bc01045ae1d6009eb87759009c767b646f9cb.
- Working tree had 934 status entries at review start; 359 tracked deletions.
- Index was empty. No unrelated work was staged, reverted or deleted.
- pnpm-lock.yaml has 62 added lines requiring review with package manifests.

## Mixed integration points

| File | Existing working-tree changes | Boundary concern |
| --- | --- | --- |
| server/apps/platform-host/src/composition/register-services.ts | 399 additions / 3,729 deletions | New generic entity runtime/publication wiring and legacy BP integration removal share one file. |
| server/apps/platform-host/src/composition/create-container.ts | 1 addition / 31 deletions | Service container removes legacy master-data/BP service types. |
| server/packages/services/publication/src/index.ts | 16 additions / 11 deletions | Generic compilation exports and legacy BP export replacement are mixed. |
| server/packages/planes/studio/meta-entity-authoring/src/index.ts | 9 additions / 1 deletion | New authoring/successor exports plus BP intake export replacement. |

The new host shared composition subtree is untracked, as are many required Country
source/runtime files. Selecting directory names that contain no 'business-partner'
is therefore not a sufficient scope filter. Prior passing tests exercised this
combined working tree, not an isolated proposed Git revision.

## Deployment boundary

Docker inspection confirms DEV API mounts the whole current repository at its
original absolute path. Restarting that service would load all existing workspace
changes, not only files selected into a commit. An exact-revision deployment needs
a separate clean source checkout and explicit source-mount configuration, followed
by verification of the resulting compiler identity and active metadata compatibility.
No database isolation or new database is required for this source separation.

## Decision required

Recommended: authorize review and separation of the existing BP-retirement changes
as an explicit prerequisite commit, then create the Country/shared-runtime commit
on that reviewed base. This is review/packaging of existing removals, not restoration
of BP metadata. Keep unrelated business-domain changes outside both commits.

Alternative: extract Country onto the current committed base while preserving its
existing legacy integration. This requires a compatibility merge and independent
qualification; it is not the source currently tested in DEV and may retain BP paths
the user intends to retire. Do not deploy that alternative without agreement.

After scope agreement: qualify an isolated source revision, review exact commit
contents, push without force, deploy the exact checkout to existing local DEV,
verify all planes, and assess metadata/compiler differences before proposing any
signed successor. No historical signed payload should be edited.
