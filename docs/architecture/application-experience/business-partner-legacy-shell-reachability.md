# BP cleanup C02 — legacy-shell reachability

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

Inspected: 2026-09-25, current working tree. The initial analysis below is historical evidence; C02a/C02b receipts supersede its consumer counts and test status. C02b removed the unused shell only; metadata, permissions and releases remain unchanged.

## C02b — remaining coverage migrated; shell removed

Removed `packages/planes/neon/business-partner/src/360/business-partner-360.tsx` after migrating its final two executable test consumers. Repeated searches across apps/packages/server/tests/tooling/metadata find only the security test's negative assertion against the old shell symbol, not executable imports or source reads. Existing routes, public exports and metadata did not reference the module. Because it contained earlier uncommitted edits, its exact current contents were copied before deletion to `/tmp/athyper-bp-shell-cleanup.VwzdrK/business-partner-360.tsx` (temporary local recovery copy, not a deployment artifact).

| Previous coverage | Current owner and disposition |
| --- | --- |
| Legacy `business-partner-360-panel.spec.ts` shell fixture | Replaced by `tests/foundation-browser/business-partner-shared-record.spec.ts` and `fixtures/bp-shared-record.tsx`; real shared EntityRecordPage, metadata tabs, explicit Section view, history, context URL changes and narrow-screen deep links |
| Legacy certificate download | Separate retained AuthorizedAttachment test; no shell import |
| Legacy comments/send and attachment navigation | Shared `comment-actions.spec.ts` now explicitly tests comment sending; existing PDF/category/folder cases and `collaboration-panel.spec.ts` cover file actions, tab switching, drafts and responsive modes |
| `360/business-partner-360.test.ts` URL-clearing helper | Replaced by `entity-record-url-context.test.ts`, exercising shared URL writer/reader, preservation of router state, dates, repeated query parameters and hash; the unused BP-specific helper was deleted with the shell, not promoted to platform API |
| Continuous navigation and late layout | Existing `entity-runtime-tab-return.spec.ts` remains the shared runtime authority |

Post-removal local verification: **28 unit tests across nine files, 13 source/security checks, 15 focused browser tests, and both BP/entity-extension package typechecks passed**. The browser total comprises shared-record (4), runtime tab-return (4), collaboration-panel (4), and selected comment/file actions (3). A wider comment-actions run was interrupted after two unrelated failures: report/history flow waits for `View your report`; empty-state/composer alignment also times out. These are open wider-suite findings, not passing coverage or signed-in DEV verification. The comment fixture's missing `readBrowserCsrfToken` export was repaired to permit that suite to build.

Retain all other legacy section components, fallback vocabulary/panel, domain clients, styles and server handlers pending separate reachability checks. Only the fallback vocabulary's obsolete explanatory comment was updated. Next: provider ownership cleanup (C03), not wholesale `src/360/` deletion.

## C02a — applied test migration and banking separation

- Extracted live `Banking`/`BankCard` to `src/banking/bank-accounts.tsx`. `banking-workspace.tsx` now imports that module directly; legacy `commercial-controls.tsx` imports the same component, not a duplicate. Banking no longer imports the legacy summary context or commercial section loader. Formatting remains in the live BP `360/display-values.ts` helper; its separate move is not required for shell deletion.
- Moved audited reveal implementation and tests to `src/protected-values/`; left a compatibility re-export at `src/360/use-audited-reveal.ts` for remaining sections. Scope cancellation, expiry, masking and purpose confirmation are unchanged.
- Extracted existing presentation helpers to `src/banking/presentation.tsx`, reused by both banking and compatibility controls. No formatting logic was duplicated.
- Moved banking regression tests to `src/banking/bank-accounts.test.tsx` and opening coverage to `src/entity-record-opening.test.tsx`. Opening now exercises shared `EntityRecordPage`: no-context opening, resolved workspace defaults, and explicit URL scope without mixing default coordinates; all leave the URL unchanged.
- Retargeted three security/source suites to current shared runtime, route wiring, BP adapter and live banking/reveal owners. Retained masking, tenant, relay, client, workforce and compatibility-section persistence checks; corrected the whitespace-sensitive export assertion.

Verification: **42 tests passed across 13 focused Vitest files; 13 source/security tests passed; BP package typecheck passed; affected diff whitespace check passed.** These are local test results, not signed-in DEV or deployed-release proof. The legacy foundation-browser fixture was not rerun in C02a; its earlier failures remain unresolved.

Remaining shell consumers: `src/360/business-partner-360.test.ts` (URL-clearing helper) and `tests/foundation-browser/business-partner-360-panel.spec.ts` (embedded shell import). Migrate the browser navigation/history/context/narrow-screen/document/collaboration cases and decide the helper's current equivalent before shell deletion. No shell, handler, metadata key, release or authorization was removed or changed.

## Finding

`BusinessPartner360Shell` has no production caller found in the inspected app/package routes or public exports. It is still executed by unit and foundation-browser tests and read by security source checks. The surrounding `src/360/` tree contains live banking and formatting dependencies. Classify the shell as a **removal candidate pending test migration**, with the directory retained.

This refines the first ledger's import scan: the foundation-browser test embeds an import in an esbuild stdin string, and security tests use filesystem reads. Static import-only counts omitted these consumers.

## Production route evidence

| Source | Resolution |
| --- | --- |
| `apps/neon/app/(shell)/mdg/business-partner/[recordId]/page.tsx` | Calls `redirectEntityRecord("business_partner", props)` |
| `apps/neon/app/(shell)/mdg/business-partner/business-partners/[recordId]/page.tsx` | Same redirect helper |
| `apps/neon/lib/redirect-entity-record.ts` | Validates record ID, preserves scalar and repeated query values, redirects through `entityRecordHref` |
| `apps/neon/app/(shell)/app/entity/[entityCode]/[[...segments]]/page.tsx` | Resolves entity record context and renders `EntityRecordRoute` within existing entitlement/layout checks |
| `apps/neon/lib/entity-record-adapters.tsx` | Resolves the extension adapter and renders shared `EntityRecordPage`, passing shell-derived default resource context |
| `packages/planes/neon/entity-extensions/src/registry.ts` | Resolves `businessPartnerRecordAdapter` |
| `packages/planes/neon/business-partner/package.json` and `src/index.tsx` | Package exports root and stylesheet; root does not export or import `BusinessPartner360Shell` |

Repository search covered imports/exports, literal dynamic imports, generated browser source, symbol references and metadata. No dynamic loader or metadata binding to the React shell was found. Published server section handler keys resolve through the host provider registry; they do not name this UI module. This inspection does not certify every deployed historical consumer outside the repository.

## Consumers that prevent immediate deletion

Paths below are repository-relative.

| Consumer | Dependency | Required disposition before removal |
| --- | --- | --- |
| `packages/planes/neon/business-partner/src/360/record-opening.test.tsx` | Renders `BusinessPartner360Shell` | Replace with shared record route/opening coverage. Its assertion that shell company context must never be inherited is specific to the old shell; current route passes default working context, so migrate the intended authorization/context behavior rather than copying that assertion. |
| `packages/planes/neon/business-partner/src/360/business-partner-360.test.ts` | Imports `clearBusinessPartnerTransactionContext` from shell | Preserve URL-copy semantics, removal of the four explicit scope keys, and unrelated date/section state in the appropriate shared context tests before retiring the helper. |
| `tests/foundation-browser/business-partner-360-panel.spec.ts` | esbuild stdin imports and renders shell | Migrate navigation, history, context change and narrow-screen cases to shared record fixture/API contracts; do not count this as signed-in DEV proof. |
| `server/db/scripts/__tests__/business-partner-360/business-partner-360-secure-core.test.ts` | Reads shell source and expects old entry feature branch | Replace stale feature-branch expectation with current route/entitlement proof; retain masking, tenant and cancellation expectations on their current owners. |
| `server/db/scripts/__tests__/business-partner-360/business-partner-360-security-evidence.test.ts` | Reads shell and controls for restricted-value persistence checks | Retarget to shared record/protected-value code while retaining live banking checks. |
| `server/db/scripts/__tests__/business-partner-360/business-partner-360-workforce-privacy.test.ts` | Reads shell to exclude workforce UI | Preserve privacy coverage on current shared record metadata/providers. Separate whitespace-sensitive export assertion also fails today. |

## Live dependencies to retain or extract first

| File/group | Live consumer/evidence | Disposition |
| --- | --- | --- |
| `src/360/components/commercial-controls.tsx` | `src/banking-workspace.tsx` imports `Banking`; package root exports `BankingWorkspace`; app banking and bank-verification routes render it | BP domain extension with mixed legacy exports. Extract live Banking before removing legacy section wrappers. |
| `src/360/use-audited-reveal.ts`, `components/crosswalk-evidence.tsx`, `display-values.ts`, `business-partner-360-context.tsx` | Commercial-controls imports these modules | Retain module dependencies. Context-based section wrappers and independently rendered Banking must be separated before deciding symbol-level removal. |
| `src/360/display-values.ts` | Used by package entry, command feedback, case/request workspaces, results, role extension, correction and validation views | BP formatting helper remains live; move only with caller updates. |
| `src/360/business-partner-360-role-client.ts` | Re-exported from package root | Public compatibility surface; retain until consumers are audited. |
| `entity-extensions/src/business-partner/clients/panel-definition.ts` | Active adapter uses `BUSINESS_PARTNER_360_PANEL` for `sectionForTab` fallback | Retain fallback constant. `realignPartnerPanel` is separately used by legacy shell/tests and can be assessed after migration. |
| `entity-extensions/src/business-partner/clients/section-providers.ts` | Panel module invokes its assertion at module load | Retain until fallback validation is replaced; no relationship to whether server handlers are reachable. |
| `entity-extensions/src/business-partner/clients/*client.ts` | Active adapter reveal handlers and root client re-exports | Retain domain clients and query/authentication contracts. |
| BP `src/styles.css` and shared record styles | Public stylesheet imports and active banking/intake surfaces | No whole-file deletion. Audit selectors after component removal. |

## Regression receipt

Executed the five focused Vitest files: `entity-record-routing.test.ts`, `entity-record-page.test.tsx`, `360/record-opening.test.tsx`, `360/business-partner-360.test.ts`, `banking-workspace.test.tsx`: **13 passed**.

Executed the three source-check files listed above using `tsx --test`: **11 passed, 2 failed**. One expects the removed `useFeature("neon.business_partner.view_360")` entry branch; the other expects compact text `entityCode!=="business_partner"`, whereas the current export-privacy guard is formatted with spaces. These are existing test assumptions exposed by the inventory, not a demonstrated authorization bypass. Tests are retained for migration; no expectations were weakened in this analysis.

Foundation-browser legacy panel run: **1 passed, 2 failed**. Transaction-context replacement passed. The tab-list expectation omits the actual Qualifications tab; the narrow-screen test times out looking for a `360 sections` combobox. These results concern the isolated legacy fixture and do not establish a defect in the active shared record page.

## Next concrete batch

1. Migrate the six test consumers above to current shared route, navigation/context and privacy authorities, preserving their meaningful assertions.
2. Split live Banking and its imports from legacy section wrappers; verify both banking app routes and reveal lifecycle behavior.
3. Remove the shell and shell-only dependency group only after repeated reference searches and replacement regressions pass. Keep adapter fallback, public clients, labels, styles and host compatibility handlers until their separate caller/admission checks pass.

C02 source analysis is complete. Removal readiness remains open. Business-design signatures and entity-by-entity compiled publication are unaffected.
