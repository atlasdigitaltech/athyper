# Increment A P9 — Local build and qualification

Status: **accepted in local DEV, 2026-09-15**, within the purchasing-pilot boundaries already recorded for P6/P7. [Acceptance evidence](internal-supplier-onboarding-p9-evidence.json) records fresh build, database, browser and Mailpit results. Follow-ups B and C remain separate scopes.

P9 fixes three issues exposed by qualification:

- The canonical empty-NEON manifest now includes supplier communication templates and routing rules.
- Initial case-contract provisioning can publish release 1 when no contract exists. Existing entities retain their identity and exact contract on replay. Tenant-owned cycle reference seeds run after tenant creation; their audit context now uses each tenant's principal and restores the caller context afterward.
- Saving an existing incomplete NEON draft preserves absent fields instead of serializing them as `null`. Explicit clears of previously saved fields remain explicit, and API requirement validation remains strict. The fix is deployed to DEV NEON and qualified through the Save draft button.

P9 also updates governance HTTP tests for the completion endpoint, supplies the completion-owner response in the legacy cycle fixture, and makes the P3 database suite accept fresh validated drafts. Those drafts are submitted inside rolled-back transactions, so old attempt state cannot invalidate a later qualification run.

## Reproduce

Run from the repository root with the workspace dependencies installed and the existing DEV PostgreSQL, API, worker, scheduler, NEON and Mailpit services available. The live stages use the existing DEV `catl.admin` and `catl.owner` NEON storage states under `tests/e2e/.auth/dev/neon/`. Authentication failures remain failures; the runner does not bypass MFA or grant live permissions.

```bash
pnpm exec tsx tooling/scripts/verification/qualify-supplier-onboarding-p9.mts build
pnpm exec tsx tooling/scripts/verification/qualify-supplier-onboarding-p9.mts clean
pnpm exec tsx tooling/scripts/verification/qualify-supplier-onboarding-p9.mts tests
pnpm exec tsx tooling/scripts/verification/qualify-supplier-onboarding-p9.mts fixtures
pnpm exec tsx tooling/scripts/verification/qualify-supplier-onboarding-p9.mts database
pnpm exec tsx tooling/scripts/verification/qualify-supplier-onboarding-p9.mts browser
pnpm exec tsx tooling/scripts/verification/qualify-supplier-onboarding-p9.mts communications
node tooling/scripts/verification/record-supplier-onboarding-p9-evidence.mjs
```

Run the live stages sequentially to respect DEV rate limits. Each stage writes a timestamped directory beneath `governance/policy/reports/p9/` containing command outcomes, logs and fresh receipt copies with hashes. A failed stage exits nonzero. The final recorder requires the latest run of every qualification stage to pass, verifies receipt hashes, checks committed business state and confirms grant/container cleanup. Legacy P1–P8 receipts are restored after capture. The fixtures stage retains its new draft IDs for the database stage.

The clean stage creates a uniquely named PostgreSQL container using DEV's exact local image. It has no network and no published port; host tools connect through a temporary Unix socket. It applies the complete Studio and NEON canonical DDL manifests, canonical tenant/authorization seeds and tenant-dependent references. It saves, validates and compiles native forms from the repository's canonical graph and form pipeline, publishes the initial NEON case contracts, and authors all three profile/workflow/document catalogs and the first-match selection policy. Runtime and catalog publication replay are checked. A scoped reviewer-role fixture is created only in this disposable database. The container, data and socket are removed after qualification. No migrations or live database resets are used.

The native graph's compiled artifact is retained with the clean-stage receipts. This proves native definition reconstruction and persistence; authenticated publication and actual form rendering are covered by the existing DEV publication and fresh owning-API/browser checks. The clean stage does not start a second NEON application deployment or Keycloak realm.

## Acceptance coverage

| Increment A acceptance area | Evidence |
| --- | --- |
| Incomplete draft save/reopen; no premature work | Fresh Chromium Save draft/reload assertions; final PostgreSQL inventory confirms zero attempts and document jobs for the draft fixtures. |
| Three requirement/profile mappings; both form views; safe field authority | Fresh Basic/Standard/Enhanced API previews and validation, native-form reconstruction, P1/P8 publication/form evidence, component and service tests, invalid enum and trusted-profile injection rejection. |
| Enhanced preview reduced to Basic before first submission | Fresh browser edits and saved-fact API previews; no accepted run or strongest-ever lock. |
| Internal/Intercompany + Enhanced; invalid ownership combinations | Fresh owning API validation accepts the independent Enhanced assertion; Internal/General and External/Intercompany fail the ownership/subtype rule. No new supplier-type split. |
| Scope, first-match semantics, missing/unsafe results and exact revision | Real PostgreSQL policy/publication/evidence suite and compiler tests cover scope isolation, overlap, immutable revision/hash, missing-result rejection and durable replay. |
| Trusted Standard/Enhanced floors; changed assertion with same effective profile | Fresh minimum-authority records in rolled-back PostgreSQL transactions. Actual submission, task return, draft patch, validation and resubmission owners retain one run while creating another attempt and review pack. |
| Atomic acceptance, gates, multilevel review, quorum and maker-checker | Fresh transaction-local P3 submissions execute all three catalogs. Database guards and actual workflow/work-item commands qualify intermediate/final authority, revoked eligibility, replay and document readiness. P2/P8 concurrent owning-API acceptance evidence is retained. |
| Correction, profile-change refusal, rejection/cancellation and history | P5/P8 actual command journeys plus fresh P5/NEON database checks and historical-document browser access. |
| All three document purposes; scan/storage/provenance; gate-local failures | Fresh document-job/outcome database suites and six fresh NEON user/profile journeys, including nine PDF downloads with hash verification against real retained rendered/scanned/stored artifacts. |
| Materialization, company/bank work, qualification, activation and closure | Fresh completion/payment/bank-link/receipt/materializer database suites. Read-only verification confirms all three committed P7 cases remain materialized, their suppliers active, their runs completed, and all nine documents ready. |
| Eligible communications, stale reminders and delivery-failure isolation | Fresh notification database suite; fresh owning inbox, browser and Mailpit checks for all three committed activation notices. The notice stage is read-only and does not run a notification sweep. |
| Reproducible canonical local build | Complete Studio/NEON manifests and receipts; native form validation/compilation; initial runtime publication/replay; three profile catalogs and policy publication/replay; 16 supplier templates, 13 routes and a scoped reviewer fixture. |

## Results and boundaries

- **2,024 tests pass; 206 existing tests are skipped.** Skipped tests are not counted as qualified evidence.
- **13 database suites pass**, including fresh requirement/minimum fixtures and actual owner commands.
- **Six browser journeys, nine PDF downloads and three activation-notice checks pass.** An initial browser run encountered DEV rate limits; the slower fresh run passes and the failed run remains recorded.
- Server dependencies and host build, NEON production build and product typecheck pass.
- No new live grants were issued. Prior temporary grants remain revoked; no P9 disposable containers remain.

The final live checks reuse the committed P7 activation/closure cases and P8 decision/correction history. They do not claim newly executed privileged activation commands. Task/minimum-control fault fixtures use controlled authorization and document-ready ports with real database owners and rollback; final document qualification uses real rendering, scanning, storage and downloads. Payment/bank evidence retains P6's governed database-fixture boundary rather than claiming external Mesh bank intake. Email evidence uses local Mailpit capture, not external provider delivery.


## 360 entry-screen correction

A subsequent user check exposed a gap in the original P9 browser coverage: the partner record entry screen was falling back to the legacy layout because DEV had a 0% global 360 rollout and no CirrusAtlantic tenant override. The 360 implementation was still present. A user-authorized, tenant-only local-development override restored it without changing global rollout or permissions. The canonical development provisioner already creates this override on a full bootstrap; the missing override was in the existing DEV instance. Its removal history was not established.

`qualify-business-partner-360-restoration.mts` now checks the exact reported record, visible 360 navigation and successful owning summary/section APIs. It is included in the P9 browser stage and exits nonzero for a legacy fallback. The repair is evidenced in `governance/policy/reports/business-partner-360-restoration.dev.json` and `business-partner-360-restored.dev.png`. The original six onboarding browser checks do not substitute for this additional record-entry check.
