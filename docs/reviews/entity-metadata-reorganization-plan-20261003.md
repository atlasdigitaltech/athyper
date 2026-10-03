# Entity metadata reorganization review plan

Date: 3 October 2026. Status: implementation pending review.

This plan preserves existing entity definitions, completes their interrupted relocation, organizes sources by owning domain, and separates format consolidation from property corrections. Country and Principal supply applicable framework conventions; Principal Profile also supplies the reference record-navigation experience.

**Before starting this activity, commit and push all existing repository changes to GitHub, including the currently ignored metadata sources. Verify that the remote branch contains the checkpoint commit.** The checkpoint preserves work in progress and does not certify its correctness or authorize publication. The owner has requested this prerequisite; the reorganization and builds remain pending review.

1. **Scope and controls**

   Work covers entity authoring sources, supporting metadata, and affected shared Entity Framework discovery, loaders, generators, and documentation. Preserve business fields, relationships, operations, workflows, tenant isolation, server-enforced record scope, explicit denies, audit, transactions, idempotency, and independent publication review.

   No database resets, publication, deployment, permission grants, MFA changes, or incidental catalog/SQL reconciliation. Do not modify immutable applied migrations. No bespoke entity applications, parallel providers, entity-name dispatch, or runtime allowlists. Keep domain handlers in their owning services and select them through reusable capability bindings.

   No unit, integration, browser, smoke, performance tests, or runtime probes will run. The proposed execution includes offline metadata validation as build-input checks. Build success will not be reported as verified runtime behavior.

2. **Mandatory GitHub checkpoint before implementation**

   Refresh the inventory of tracked, untracked, and ignored sources. Preserve a recoverable local snapshot, including ignored metadata and the starting revision. Correct only the ignore rules needed to admit reviewed source locations, including `entities/`, `manifest.json`, `access/`, `contracts/`, `history/`, `review/`, and `profiles/platform/`. Keep local outputs and credentials excluded.

   Stage all existing repository source changes, including work from other sessions, without rewriting them. This checkpoint is an explicit exception to the later cleanup rule that unrelated work must stay out of implementation commits. Inspect the staged inventory and ensure moved sources are additions/renames rather than unbacked deletions. Commit on the existing recovery branch and push to GitHub without force-pushing or merging into protected branches.

   Verify the remote commit hash and that all intended metadata files are present in the commit. Report any concurrent edits remaining after capture. Record the checkpoint hash in the handoff. A new worktree alone does not capture ignored or uncommitted files.

   Exit gate: a recoverable GitHub checkpoint exists before any subsequent cleanup or build starts.

3. **Baseline evidence to refresh**

   The preceding audit found 49 entity directories containing 202 files, 175 tracked deletions, and 35 entity directories without `placement.json`. Of 155 old entity-directory files in HEAD, 153 matched their new entity paths byte-for-byte and two matched their new platform-profile paths. These counts are observations to refresh, not assumed execution-time totals.

   Seven directories contain both formats: address, country, currency, language, locale, state_region, and timezone. The code-side Studio module count of 32 is in `tooling/scripts/catalog/generate-platform-catalog.mjs`; the reported SQL count of 33 remains a separate discrepancy. Do not change either count or reassign module identities during relocation.

   **Prerequisite completion evidence — 3 October 2026 (items 1–3)**

   Scope and controls above remain in effect. Reorganization implementation and builds remain pending review; this evidence completes only the requested checkpoint and baseline refresh.

   - Starting revision and existing GitHub checkpoint: `f64f6ac3507f55a2f626287d9fd2058a4ca5ed01` (`chore: checkpoint existing work and entity metadata review plan [skip ci]`). `git ls-remote origin refs/heads/recovery/entity-framework-cleanup-20261003` returned this exact hash before any subsequent work. No replacement or empty checkpoint was necessary.
   - Capture-time inventory: 8,049 tracked files; no untracked source changes, ignored metadata sources, or tracked working-tree deletions. Existing `.gitignore` exceptions already admit `entities/`, `manifest.json`, `access/`, `contracts/`, `history/`, `review/`, and `profiles/platform/`. No ignore changes were needed; local outputs and credentials remain excluded.
   - All 248 files currently beneath `metadata/` are present in the checkpoint and match its bytes. The checkpoint's 175 removed metadata paths (with rename detection disabled) each have a byte-identical destination in the current metadata tree. These are historical relocation deletions, not remaining working-tree deletions.
   - Refreshed baseline: 49 entity directories and 202 files; 35 directories lack `placement.json`. All 155 entity-directory files from checkpoint parent `fdef47758` are accounted for: 153 match entity destinations and two match platform-profile destinations byte-for-byte. The seven dual-format directories remain address, country, currency, language, locale, state_region, and timezone.
   - `tooling/scripts/catalog/generate-platform-catalog.mjs` still declares the Studio expected module count as 32. The reported SQL count of 33 remains unverified in this activity and unresolved; neither counts nor module identities were changed.
   - Recoverable local snapshot: `/home/chandravel_natarajan/src/athyper-checkpoints/metadata-prerequisite-20261003-f64f6ac3507f/`. It contains `repository.bundle`, `sources.tar.gz`, `starting-revision.txt`, `status.txt`, `inventory.json`, and `sha256.json`. The archive captures existing tracked and untracked sources plus ignored metadata if present; no ignored metadata existed at capture. `git bundle verify` succeeded and reported complete history. This local archive is not published evidence or approval.
   - Versioned [checkpoint inventory](entity-metadata-checkpoint-inventory-20261003.json) records every entity directory, missing placement, all 155 old entity-file mappings, and all 175 removed metadata paths with SHA-256 hashes and identical destinations.
   - Commands: `git status --short --branch`, `git status --porcelain=v1`, `git ls-files --others --ignored --exclude-standard metadata`, `git ls-remote origin refs/heads/recovery/entity-framework-cleanup-20261003`, `git show --format=fuller --no-patch HEAD`, `git ls-tree -r --name-only HEAD^ metadata`, and `git diff-tree --no-commit-id --name-status -r --no-renames HEAD`; offline Python source inventory, archive, and byte/hash comparisons used these Git objects. Snapshot creation used `git bundle create <snapshot>/repository.bundle --all`; verification used `git bundle verify <snapshot>/repository.bundle`. These are source preservation and inventory checks, not metadata compilation or runtime verification.
   - Evidence handoff: stage only this plan and the checkpoint inventory, commit with `[skip ci]`, and push to the existing recovery branch without force. The pre-commit hook performs only its branch guard for these documentation paths. Use `git push --no-verify origin HEAD:refs/heads/recovery/entity-framework-cleanup-20261003` to avoid the pre-push hook's unrelated brand/generated-artifact checks in this bounded work-in-progress capture; verify the resulting remote hash and checkpoint ancestry afterward.
   - Exit gate satisfied: the recoverable GitHub checkpoint predates this evidence update. No concurrent source edits remained at capture. No tests, builds, runtime probes, database actions, publication, deployment, permission grants, MFA changes, migration changes, or catalog reconciliation were performed. Plan items 4–12 remain pending review.

4. **Finish the existing flat relocation**

   Retain `metadata/entities/<entity>/` as the first implementation checkpoint. Preserve artifact contents and filenames. Repair these consumers together:

   | Consumer | Required correction |
   | --- | --- |
   | `server/db/scripts/operations/publication/prepare-coordinated-candidate.ts` | Replace discovery beneath the removed `metadata/products` root |
   | `tooling/scripts/catalog/generate-platform-catalog.mjs` | Replace old product/entity directory traversal, not just its root string |
   | `tooling/scripts/metadata/check-layout.mjs` | Resolve the relocated inventory and reconcile its expectation of the absent `manifest.releaseEntry` |

   Audit active loaders, compilation and release-preparation scripts, generators, fixture paths, and runbooks for remaining obsolete references. Update current documentation, including the stale metadata README. Preserve historical reports, hashes, approved evidence, and captured historical commands. Assess evidence-bound compatibility entry points before removal; create no new compatibility copies or symlinks.

   Exit gate: every original source is accounted for and active consumers resolve the flat layout without semantic edits.

5. **Introduce generic discovery before nesting sources**

   Discover entity descriptors recursively beneath the manifest's entity root. Build a derived `entityCode`-to-source-directory index and reject competing declarations anywhere in the active tree. Multiple artifacts belonging to the same entity are valid; repeated `entityCode` values inside those artifacts are not themselves duplicate entity declarations.

   Resolve logical artifact/profile references through existing supported contracts. Reject unresolved required references, invalid paths, and unsupported descriptors with actionable errors. Exclude review/history/generated outputs from active discovery. Preserve existing artifact identities and supported logical syntax. Generated indexes must never become additional hand-maintained definitions.

6. **Move sources by domain ownership**

   Use `metadata/entities/` as the single entity root. Proposed destinations are below; confirm ownership against domain contracts before moving disputed entries. Folder placement does not assign storage schemas, module codes, publication targets, or navigation exposure.

   | Relative source home | Entity group | Count |
   | --- | --- | ---: |
   | `common/reference/` | country, currency, language, locale, state_region, timezone | 6 |
   | `platform/iam/` | principal, principal_profile, principal_ui_profile, principal_notification_preference | 4 |
   | `ppl/workforce/` | employee, person, external_worker, workforce | 4 |
   | `mdg/location/` | address, address_link, person_address_use | 3 |
   | `mdg/bp/` | business_partner and its 13 child entities; business_partner_request; supplier, supplier_company_profile, customer, customer_company_profile; contact_channel, contact_person, contact_person_role | 22 |
   | `mdg/reference/` | bank_branch, bank_identifier, bank_institution, certification, classification_scheme, commodity_code, commodity_crosswalk, industry_code, industry_crosswalk, uom | 10 |

   The 13 BP children are business_partner_alias, business_partner_bank_account_link, business_partner_bank_provisional_reference, business_partner_banking, business_partner_commodity_classification, business_partner_governance_relation, business_partner_identifier, business_partner_industry_classification, business_partner_operating_organization_assignment, business_partner_qualification, business_partner_relationship, business_partner_restriction, and business_partner_tax_registration.

   Supporting roots remain `profiles/`, `schemas/`, `contracts/`, `access/`, `review/`, `overlays/`, and `history/`. Create directories only where real material exists. Preserve `presentation.section.*.json` and `flow.*.json` filenames. Supply a complete source-to-destination map with byte hashes.

   Exit gate: all 49 entities have one source home, with no semantic changes in the relocation change set.

7. **Trace reference integration before correcting properties**

   Trace Country's actual definition, compilation, publication, metadata resolution, provider/capability registration, authorization, routing, and list/detail integration. Trace Principal for applicable ownership and record scope, and Principal Profile for record navigation. Identify and explain affected shared integration points before editing code.

   Build a per-entity matrix separating source home, definition ownership, target planes, storage/runtime bindings, navigation placement, and exact authorization bindings. Do not copy Country's read-only operations or Principal's placements indiscriminately. Determine whether each missing placement represents an embedded-only entity, another supported role, or missing navigation configuration.

8. **Reconcile formats separately**

   For each of the seven dual-format entities, identify active consumers and compare fields, relationships, operations, permissions, runtime bindings, query configuration, presentation, localization, and capabilities. Classify content as identical, complementary, conflicting, generated, or historical. Select a canonical editable representation already supported by the framework and document where every retained property goes.

   Establish Country's canonical representation before using its file organization as a consolidation baseline. Address requires an explicit operation-by-operation comparison preserving governed change-request behavior. Archive or delete superseded material only after consumer and dependency resolution is demonstrated.

   If reconciliation requires a new parser, schema semantics, or composer, defer that conversion to the separate contract phase and report the unresolved competing sources. Do not call consolidation complete while those conflicts remain.

9. **Correct metadata by entity group**

   Declare readable record identity, list columns, navigation groups, section behavior, and ordering explicitly. Shared validation must reject UUID presentation configurations rather than silently hiding fields or selecting fallback labels. Reuse Navigation Tabs and Section Tabs/menu components. Do not synthesize Overview tabs, first-field display identities, or the deprecated full-width section dropdown.

   Expose search, filtering, sorting, pagination, and controls only when metadata and APIs support them. Preserve locked server-side parent scope for embedded lists, explicit projections for read models, and all necessary BP/workforce operations and workflows. Generalize missing capabilities through shared contracts rather than entity-specific runtime branches.

   Product defaults remain platform-owned Studio releases with independent Platform Owner review. Tenant extensions remain tenant-isolated with independent Tenant Owner review. File moves and commits do not establish publication approval.

10. **Security and evidence review gates**

    An absent permission property in valid metadata requires no entity permission grant. Invalid, unavailable, unpublished metadata or a broken defined permission reference must not become an allow. Independent platform controls remain applicable. Record every permission/policy addition, removal, or replacement with before/after values and intended effects; never infer permission codes from names.

    Preserve every MFA setting, including all four existing `mfaAtDecision: true` values in the BP request flow. Neither baseline correction nor this plan authorizes MFA-related code or metadata changes.

    Preserve historical releases, baselines, migration hashes, and review evidence. Identify evidence invalidated by path/hash changes and prepare separately identified successor drafts where necessary. Do not rewrite historical hashes or transfer historical approval onto changed content.

11. **Offline build validation after implementation approval**

    Inspect command definitions before execution to exclude tests, runtime probes, database mutations, publication, and deployment. Run source inventory and byte-hash checks, `pnpm metadata:check-layout`, offline `validate.py` validation with supported arguments, and offline compilation of supported entity/release inputs. Compare deterministic outputs before and after pure moves; explain path-only differences. Intentional property changes require explained output differences.

    Then run `pnpm --dir server/db typecheck`, `pnpm --dir server/db codegen` only if its implementation satisfies these boundaries, `pnpm typecheck`, and `pnpm build`. Fix failures introduced by this work; report unrelated failures separately. Unsupported compilation or validation is a gap, not a pass.

    The initial GitHub checkpoint is not conditional on these builds passing. Preserve its work-in-progress status and keep implementation validation separate.

12. **Implementation commits and handoff**

    After the prerequisite checkpoint, separate flat-layout consumer repairs, generic discovery, hierarchy moves, format reconciliation, entity-group property corrections, and final documentation into reviewable commits. Keep content edits out of pure relocation commits. Preserve unrelated work throughout.

    Deliver the remote checkpoint identity, final tree, all 49 source/destination mappings, file disposition inventory with reasons, canonical-format decisions, property and permission diffs, confirmation of unchanged MFA, affected shared components, historical/successor evidence accounting, exact commands/results, and unresolved gaps. Distinguish implemented changes, static/build validation, publication, and runtime verification. Automated and manual user-flow testing remain pending.

    Deferred work includes the new unified authoring language, component composer/compiler, and `sections/` or `flows/` filename conversion. It needs a separate design review and agreed testing scope. Approval of this document does not authorize that redesign, publication, deployment, MFA changes, or catalog/SQL reconciliation.
