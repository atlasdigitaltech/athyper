# Reports

Dated evidence and review reports. Each records what was observed for one source revision, deployment and time; none establishes current health or renews an approval. Business Partner reports (`bp-*`, `athyper-bp-*`, `business-partner-*`, `bp-integration-20260921/`) predate the removal of the bespoke Business Partner app (commit `870f08f52`). Index generated 2026-09-30.

## Comprehensive Country review (2026-09-29)

[country-route-comprehensive-review-20260929.md](country-route-comprehensive-review-20260929.md) reviews `/app/entity/country` on the shared Entity Framework. Its `path:line` citations are **pinned to `HEAD = 63fc9492b` plus a dirty worktree that other sessions were editing during the review**; line numbers will have drifted, and some items may already be fixed. The report says which were re-verified. Its seven supporting sweeps are in [review/](review/):

- [Review — Collaboration & Attachments (current working tree, 2026-09-29)](review/collaboration-attachments-20260929.md)
- [Entity Framework runtime — exhaustive per-file sweep (read-only)](review/entity-runtime-sweep-20260929.md)
- [Experience / Metadata / Collaboration review — 2026-09-29](review/experience-metadata-20260929.md)
- [Frontend Entity Framework review — `/app/entity/country` (list + detail)](review/frontend-runtime-bugs-20260929.md)
- [READ-ONLY Review — platform-host composition, db scripts, repo tests](review/host-composition-db-tests-20260929.md)
- [Meta-entity authoring plane — exhaustive per-file review](review/meta-entity-authoring-20260929.md)
- [READ-ONLY review — publication compilation & platform-host publication composition](review/publication-compilation-20260929.md)

## Bulk evidence: do not move without checking consumers

- `bp-integration-20260921/` (logs, `native-intake-exact-release.json`, runtime-workload runs) is referenced by `governance/policy/reviews/business-partner-intake-runtime-workflow*.dev.json`, `tooling/scripts/local-dev/qualify-runtime-publication.mts`, `tooling/scripts/metadata/prepare-compiled-review.mts`, `server/db/scripts/operations/upgrades/bp-integration-20260921/README.md`, and the authorization inventory.
- `attachment-discovery-*-20260928.json` were moved to [../archive/attachment-discovery-20260928/](../archive/attachment-discovery-20260928/).
- `*.log` files are git-ignored local output.

## Markdown reports

- [Activity calendar date ranges](activity-calendar-date-ranges-20260929.md)
- [Activity deliveries — Country publication handoff](activity-delivery-publication-20260928.md)
- [Snapshot comparison after publication](activity-snapshot-compatibility-fix-20260928.md)
- [Athyper BP adoption: verified preflight](athyper-bp-adoption-preflight-20260925.md)
- [BP governed-operation catalog reconciliation — DEV, 2026-09-25](athyper-bp-governed-operation-catalog-20260925.md)
- [BP adoption read-contract reconciliation](athyper-bp-read-contract-reconciliation-20260925.md)
- [Athyper BP multi-company DEV preparation](athyper-partner-demo-context-20260925.md)
- [Initial Business Partner package candidate](bp-package-candidate-20260925.md)
- [BP qualification handler contract correction](bp-qualification-contract-20260925.md)
- [Shared capability-driven panel header](capability-panel-header-20260928.md)
- [Capability profile implementation progress — 2026-09-28](capability-profile-implementation-progress-20260928.md)
- [Collaboration and MetaEntity architecture review](collaboration-metaentity-architecture-review-20260923.md)
- [Collaboration UI audit remediation](collaboration-ui-audit-remediation-20260923.md)
- [Generic compilation recovery — 2026-09-28](compilation-recovery-implementation-20260928.md)
- [Compiled-only runtime cutover — 2026-09-25](compiled-only-runtime-cutover-20260925.md)
- [Compiled publication signature representation correction](compiled-publication-signature-review-20260928.md)
- [Country activation recovery — 2026-09-27](country-activation-recovery-20260927.md)
- [Country Entity App — Comprehensive Code Review](country-entity-app-code-review-20260928.md)
- [Country Entity App — Round-2 Code Review](country-entity-app-code-review-round2-20260928.md)
- [Country DEV policy enrollment](country-policy-enrollment-20260927.md)
- [Country DEV baseline and draft disposition](country-publication-baseline-20260927.md)
- [DEV Country publication execution — 2026-09-27](country-publication-execution-20260927.md)
- [DEV platform publication workload checkpoint](country-publication-workload-20260927.md)
- [Country route denial after DEV restart](country-restart-routing-fix-20260928.md)
- [Comprehensive review — `/app/entity/country` on the shared Entity Framework](country-route-comprehensive-review-20260929.md)
- [Country route review, round 2: eight dimensions, with localization](country-route-review-round2-20260930.md)
- [Country entity route TypeScript file inventory](country-route-typescript-inventory-20260928.md)
- [Country runtime release: integration boundary review](country-runtime-release-scope-review-20260928.md)
- [Disposable DDL execution and local DEV audit — 24 September 2026](ddl-disposable-dev-audit-20260924.md)
- [DEV publication ownership correction and BP history cleanup](dev-publication-ownership-cleanup-20260927.md)
- [DEV and QA database rebuild — 24 September 2026](dev-qa-database-rebuild-20260924.md)
- [Activity DEV rollout — 2026-09-28](entity-activity-rollout-20260928.md)
- [Entity collaboration acceptance — 2026-09-28](entity-collaboration-acceptance-20260928.md)
- [Phase 1: comments and attachments code review](entity-collaboration-phase1-review-20260922.md)
- [Generic detail collaboration integration](entity-detail-collaboration-20260927.md)
- [Country hardening release — DEV completion](entity-hardening-release-completion-20260928.md)
- [Generic entity list styling parity](entity-list-plane-parity-20260927.md)
- [Phase C — Country localization vertical slice](entity-localization-foundation-20260928.md)
- [Navigation successor publication — preparation](entity-navigation-publication-20260927.md)
- [Country onboarding audit follow-up](entity-onboarding-followup-20260928.md)
- [Entity operation projection repair — 2026-09-27](entity-operation-projection-repair-20260927.md)
- [DEV successor publication — 2026-09-27](entity-successor-activation-20260927.md)
- [Entity successor build — 2026-09-27](entity-successor-build-20260927.md)
- [DEV entity successor wiring — 2026-09-27](entity-successor-wiring-20260927.md)
- [Entity surface hardening — 2026-09-28](entity-surface-hardening-20260928.md)
- [Reviewed Country UI inventory and placeholder verification](entity-ui-inventory-review-20260928.md)
- [Generic Summary and advanced collaboration enablement](generic-summary-collaboration-enablement-20260927.md)
- [Phase D — measured collaboration and detail performance](measured-entity-performance-20260928.md)
- [Metadata detail functionality parity — implementation in progress](metadata-detail-parity-20260927.md)
- [Product metadata publication and Athyper DEV adoption](product-metadata-tenant-adoption-20260925.md)
- [Publication and collaboration correctness — Phase A / B](publication-collaboration-correctness-20260928.md)
- [Record navigation behavior review](record-navigation-behavior-review-20260927.md)
- [Toolbar-first Comments and Files](record-tools-toolbar-layout-20260929.md)
- [Shared contextual panels](shared-context-panels-20260928.md)
- [Restricted system-entity publication commands — 2026-09-27](system-entity-publication-commands-20260927.md)
- [CATL Inbox 403 — local repair](workflow-inbox-access-fix-20260923.md)

JSON/CSV/JSONL files alongside these are machine evidence named after the report they support (same prefix and date).
