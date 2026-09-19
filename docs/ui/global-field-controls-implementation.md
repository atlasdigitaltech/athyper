# Global field controls: implementation and verification

Deployed and verified in the shared DEV source stack on 2026-09-13. Studio signed preview revision **34** is active; the live runtime reports preview release coordinate **35**. This is DEV preview activation, not a governed native release or a QA/STG/PROD promotion.

## Delivered

- Native dropdowns share chevron geometry, a 2.5rem trailing region, divider, RTL, dark/high-contrast and forced-color behavior. Their native semantics, refs and tab order remain intact. Native date controls retain their calendar and serialized date value with consistent trailing spacing.
- Forms, filter values and sort/filter field selection use the shared presentation policy. Short lists remain native; bounded references and longer lists use search. Country filters support exact and multiple selection; valid enums use options; relative periods keep labelled groups. Existing text operators retain text entry rather than being rewritten.
- Searchable controls preserve the committed display value, offer label/code search, selected checkmarks and independent history clearing. Multiple selection uses the same popup. Catalogue normalization/sorting is shared and memoized. Filter choices load on interaction, deduplicate concurrent requests, distinguish an empty result from an unloaded source and reject stale descriptor responses.
- History loads on first interaction, coalesces equivalent requests and uses a 60-second freshness interval. Optimistic changes synchronize between mounted controls, mutation order is serialized, failures do not block the form, and one shared set of window listeners replaces per-control listeners. Read bindings are capped at 100, retention remains bounded, and stores are disposed on last unsubscribe.
- Rich Browse dialogs load on demand. Compact references defer preference and recent-record reads, retain debounced/cancellable search, and cache scoped descriptor/view metadata briefly. Returned rows are still checked against descriptor/scope and selection eligibility. Row results are not globally cached. No hierarchy is synthesized: this repository has no declared hierarchy contract in these controls.
- The development Business Partner authoring projection now defaults Country to Equals and advances its publication version/release to 11. Existing saved filters are not rewritten. The active DEV graph was separately updated through authenticated Studio as recorded below.

## Verification

- 18 Chromium browser checks passed across the affected suites: country single/multiple selection, recents and cross-device clearing, storage/transport outages, desktop/mobile drawer clipping, keyboard/focus restoration, accessibility scans, RTL, native date values, company filters and applied filters.
- The 20-control production fixture makes zero eager history requests. Opening equivalent controls shares one GET; local typing and repeated focus during freshness add no GETs. A committed selection causes one background write.
- The browser fixture measured p95 search-to-render at **33.6ms**, with **no observed tasks above 50ms** during search (249 choices, 20 mounted controls). This includes two animation frames per interaction.
- The isolated production bundle check confirms the full list chooser is absent from the compact lookup's eager dependency graph. Detailed CPU/bundle/browser measurements are in `global-field-controls-performance.json` and `global-field-controls-browser-performance.json`. These are reproducible local fixtures, not deployed application measurements or a before/after form-render baseline.
- Four affected package typechecks passed (UI, form-detail, list-view and entity-runtime contract). There were also 32 passing list/history/provisioning tests, 22 passing form/chooser tests and 14 passing server country-option/list tests. The concurrent structured-validation addition was retained, with its prior country-option fallback wording restored; both invalid-state prop forms are supported by the shared control.

Reproduce the bundle/CPU check with `pnpm perf:verify:field-controls` (append `--write` to refresh its JSON report). Browser tests use `pnpm exec playwright test --config=tooling/config/playwright.foundation.config.ts`; the new `global-field-controls.spec.ts` includes request and timing budgets. History tests live in `tests/foundation/reference-history-store.test.ts`.

## DEV activation evidence

The deployment receipt is `governance/policy/reports/global-field-controls-deployment.dev.json`. Neon, Studio and Mesh web services were restarted against the existing shared checkout; all six source services were healthy at verification. The receipt records source hashes because this stack uses source mounts, not an immutable image promotion.

The live check exposed a compiler omission: native projection discarded authored filter presentation, country semantics and enum choices. The shared compiler now preserves the declared presentation fields, without copying authorization or write policy. Four projection tests, ten authoring/compiler tests and both affected package typechecks passed. Metadata revision 34 adds the native list configuration and three hidden choice bindings, preserving the existing visible columns and concurrent graph edits. The earlier reviewed restoration descriptor and its contract assertion also use Country Equals.

Authenticated Chromium checks on the current supplier onboarding flow confirmed Country Equals, searchable country options inside the filter drawer, name/code search, viewport-safe popups, Escape/focus restoration and shared native styling. History made zero GETs before opening and one GET across repeated opens. No business request was submitted and no recent choices were changed or cleared. The existing test principal receives an unrelated Workflow Inbox 403; field-control requests succeeded and no page JavaScript errors occurred.

Private before/after graphs and browser evidence are retained under `~/.athyper/deployments/global-field-controls`. Rollback must use a fresh Studio revision guard and preserve later authoring edits. Do not overwrite a newer graph with the whole backup. `activate-global-field-controls.mts` uses authenticated Studio, validates/tests/compiles the prepared graph, checks revision and content hash before saving, and verifies signed activation afterward. `verify-global-field-controls.dev.mjs` provides the repeatable browser smoke check.

## Deployment and rollback

Deploy the frontend/runtime consumers together through the existing release process, initially validating Business Partner create/edit and list drawers. Publish the updated authorized descriptor to change the default operator on existing environments. Existing server-history deployments retain their existing migration/worker requirements; this change adds no history database migration or new source adapter.

Before expanding a deployed rollout, compare its initial form render and initial JS against that environment's baseline and check its authenticated request traces. Firefox/WebKit, real assistive technology, and deployed production measurements were not run here. Keep the prior frontend build and published descriptor available for rollback. No stored selection, saved view or business data migration is required by these UI changes.

## Native control inventory

These production source files contain raw native selects. They receive the global CSS treatment directly, which avoids wrapper migrations and extra JavaScript. Existing multiple/size listboxes intentionally retain native rendering. Custom searchable reference controls use the shared component instead; action menus and disclosure chevrons remain separate UI patterns.

- `apps/mesh/app/(shell)/network-relationships/marketplace/buyer-discovery/page.tsx` — shared native styling.
- `apps/neon/app/(shell)/mdg/operation-review/review.tsx` — shared native styling.
- `apps/studio/app/(shell)/entity/graphs/graph-editor.tsx` — shared native styling.
- `apps/studio/app/(shell)/entity/graphs/intake-surface-preview.tsx` — shared native styling.
- `apps/studio/app/(shell)/mdg/business-partner/ai-experience/experience-editor.tsx` — shared native styling.
- `packages/planes/mesh/business-partner/src/index.tsx` — shared native styling.
- `packages/planes/neon/business-partner/src/360/components/roles-workspace.tsx` — shared native styling.
- `packages/planes/neon/business-partner/src/bank-verification-controls.tsx` — shared native styling.
- `packages/planes/neon/business-partner/src/banking-workspace.tsx` — shared native styling.
- `packages/planes/neon/business-partner/src/mesh-proposal-experience.tsx` — shared native styling.
- `packages/planes/neon/list-view/src/index.tsx` — shared native styling.
- `packages/planes/studio/business-partner/src/bank-directory-manage.tsx` — shared native styling.
- `packages/planes/studio/business-partner/src/supplier-request-form-designer.tsx` — shared native styling.
- `packages/planes/studio/business-partner/src/workflow-designer.tsx` — shared native styling.
- `packages/platform/entity/runtime/form-detail/src/record-360-panel.tsx` — shared native styling.
- `packages/platform/entity/runtime/form-detail/src/record-header.tsx` — shared native styling.
- `packages/platform/entity/runtime/list-view/src/directory-filters.tsx` — shared native styling.
- `packages/platform/entity/runtime/list-view/src/scope-control.tsx` — shared native styling.
- `packages/platform/entity/runtime/list-view/src/transfer-workspace.tsx` — shared native styling.
- `packages/platform/foundation/ui/src/index.tsx` — shared native styling.
- `packages/platform/shell/shell/src/atlas-context-inspector.tsx` — shared native styling.
- `packages/platform/shell/shell/src/atlas-workspace.tsx` — shared native styling.
- `packages/platform/shell/shell/src/client.tsx` — shared native styling.
- `packages/platform/shell/shell/src/home.tsx` — shared native styling.

## Date-control refinement

Relative periods now use a compact native select grouped into Days, Weeks, Months and Years. The fixed catalogue keeps duration order, displays labels only and makes no search or history requests. Relative filters are no longer written to recent-filter storage. Rolling 365-day options are labelled “365 days” rather than “12 months” to match their actual semantics. Saved operator/value codes remain compatible.

The selected preset has accessible boundary help. Existing backend rolling periods include today in addition to the preceding/following N days; that behavior is preserved explicitly. Exact resolved date ranges are not displayed because the current descriptor does not publish the database's effective date/timezone. A browser-derived range could disagree with the query around midnight. Adding an authoritative temporal context to the descriptor is required before displaying that preview.

Single dates retain shared native input/calendar styling and typed entry. Between filters now set both the start maximum and end minimum and retain inline reversed-range validation. Datetime filters retain their device-timezone explanation and existing conversion to an instant. No custom calendar bundle, network fetch, schema migration or metadata republication is introduced.

Validation: seven shared-control Chromium checks passed, including native preset keyboard selection, readable groups, zero requests, date serialization, mobile/desktop drawer accessibility and reversed-date boundaries. The list-view package typecheck passed.

The authenticated DEV smoke attempt was blocked by the expired Neon session; the normal refresh returned HTTP 200 but `/api/auth/session` remained anonymous. No authenticated live verification is claimed for this date refinement. The source implementation and isolated browser checks above are complete.
