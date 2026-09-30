# Entity route audit: assessment and action plan

Date: 2026-09-30. Follow-up to [the Country/Principal review](entity-route-code-review-country-principal-20260930.md), the [earlier Country review](country-route-code-review-20260930.md), and its [resolution note](country-route-audit-resolution-20260930.md).

This is a recommendation plan, not an implementation or release report. Targeted source checks were made against a dirty, concurrently edited tree whose observed HEAD was `d39f314d2`. No build, tests, browser session, publication, deployment or database verification was performed for this plan. Existing edits were preserved.

## Assessment

The proposed priorities are broadly correct. Treat navigation and retained-query correctness as the first patch, followed by plane/context correctness. Naming changes should not block those fixes.

| Finding | Current assessment |
| --- | --- |
| 1.1 | Source-confirmed: `RelatedRecordList` supplies a record-only `onNavigate`; the navigation provider replaces the inherited handler with it. Non-record destinations are silently dropped. |
| 1.2 | Hard-coded transfer destinations remain. Studio also has a dynamic workspace/module route, so absence of an `operations` directory alone is insufficient proof of a 404. Verify catalog resolution and the actual destination as part of acceptance. Publish only supported destinations. |
| 1.3, 1.5 | The unconditional Neon record gate and missing retry remain. The organization provider clears its state, returns when work is not ready, and derives loading from the missing catalog, supporting the reported stuck-loading path. |
| 1.4 | The stale mutation source is visible: retained `pageState.filters` reaches `ColumnFilter`, which replaces the filter array using that snapshot. A delayed-response browser test is still needed to reproduce the user-visible loss. |
| 2.1 | Duplicate read authorization is present in `compileDetail`; the authorizer has an existing-record `exists` path. Measure database calls for each authorization profile before claiming a universal extra round-trip or quantified saving. |
| 1.6, 1.7 | The stricter server UUID regex and plain owner-scope error remain. These are small, separate server correctness fixes. |
| 8.1, 8.5 | Principal still lacks a localization file. Enum formatting reads the option label directly, so adding translations alone does not establish localized enum rendering. Address metadata and label projection together. |
| 4.1–4.3 | Recheck commit/public-contract status before renaming. `entity-navigation.tsx` is already tracked in HEAD; the audit's “still uncommitted” premise is stale for that file. Renames are optional clarity work, not correctness gates. |
| Access control and clean areas | Preserve the audit's positive findings, but do not treat them as live RLS verification or a fresh exhaustive review of CSS/tests. |

## Framework integration and change boundary

Use Country's existing definition, localization and capability files under `metadata/products/shared/entities/country/` as the onboarding reference. Metadata is compiled and admitted through the existing publication/runtime path; the shared metadata composition and read-runtime composition supply the query/list services and authorizers. The three apps enter the shared `createEntityReadRoute` → `EntityReadSurface` → list/detail runtime path.

Expected changes belong in the shared list navigation and query-state handling, related-section runtime, list/detail contracts and descriptor compiler, record query/list services, and plane context adapters. Principal changes belong in its metadata. No new Country/Principal routes, providers, explorers or entity-specific UI are needed. Existing transfer workspaces may be referenced only where supported; do not build a Studio transfer application as a workaround.

## Implementation sequence and acceptance

| Patch | Findings | Work and completion criteria |
| --- | --- | --- |
| 1. Navigation and pending filters | 1.1, 1.4, 7.2; earlier D2-1/D2-2 | Introduce a distinct record-open callback carrying record identity; general navigation inherits the application router. Preserve actual hrefs, modified clicks, new tabs, keyboard activation and server route templates. Apply column-filter changes to the latest requested state, preferably as a field-level mutation, while keeping retained-row display tied to the completed query. Browser tests: embedded record opening, page actions, supported import/job links, and two filter changes with the first response delayed. The final request must contain both changes; late responses must not overwrite it. Preserve selection/action guards while results are stale and clear retained content on authority/scope changes. |
| 2. Plane routes and context | 1.2, 1.3, 1.5, 7.1, 3.3, 5.4 | Resolve transfer destinations from the existing catalog into shared descriptor capabilities, including result/job links. Hide unsupported destinations while retaining supported operations. Declare required context through metadata/compiler contracts and let a plane adapter provide the gate. Tenant-scoped records must work despite business-context failure; genuinely scoped records must wait and offer a localized retry. Propagate dependency errors rather than indefinite loading. Avoid a descriptor/gate bootstrap cycle: required-context information must be available before the context-dependent record request. Verify Neon/Mesh/Studio, initial context resolution, retry and context switches; ensure shell remounts do not restore duplicate reads. |
| 3. Server correctness and admitted reads | 1.6, 1.7, 2.1, 3.1 | Use the shared record-ID syntax validator without weakening storage/admission checks. Return the typed owner-scope server error. Let a successful authorized projection satisfy detail read admission; retain authorization for descriptor-only and any legacy fallback paths. Preserve separate edit/transition decisions and field projection. Decide whether to require the projection method only after checking all implementations and test doubles. Measure authorization/existence/query counts for Country, Principal self/admin, and scoped entities. Test unauthenticated/denied reads, other-owner reads, missing records, cross-tenant attempts and field restrictions. Fix misleading timing stage names. |
| 4. Related reads and capabilities | 2.2, 6.4 | Use the consolidated detail request for single related records. Publish relationship capabilities using server authorization and parent scope, without treating transport/server failures as permission denial. Use existing abortable request/resource handling and cancel on record or scope changes. Test zero/one/multiple matches, denied creation, retryable failures, and late-response cancellation. Server tests must show that direct requests cannot escape locked parent scope. |
| 5. Principal localization parity | 8.1, 8.5, 7.4 | Add Principal localization following Country's schema and required en/ms/ar locales. Ensure shared projection/rendering resolves field, section and enum labels; preserve JIT/API capitalization in authored fallback text. Consolidate enum definitions only after verifying compiler support, extending the shared compiler if needed. Check list/detail/filter labels and RTL through actual compiled descriptors, then verify published output separately. |
| 6. Shared localization and diagnostics | 8.2–8.4, 8.6–8.7, 2.4; earlier D1-6/D8 backlog | Localize complete messages, pagination and empty states without lowercasing authored titles. Apply governed format locale/numbering system and proper Arabic plural categories. Gate detailed timing with explicit diagnostics configuration and verify default responses omit it. Keep diagnostics independently reviewable from translation edits. |
| 7. Bounded consolidation | 3.2, 3.4–3.8, 4.1–4.4, 5.2–5.3, 6.1–6.3, 6.5, 7.3 | Extract contracts/helpers without changing public behavior. For request sharing, test that one subscriber aborting does not cancel others and that the last subscriber abort cancels work. Scope caches by authority and relevant release/context. Replace cross-package source imports through exports. Consolidate typed error handling at appropriate boundaries rather than mechanically converting every thrown error. Keep format-only changes separate. Token and dialog changes should be driven by their actual stacking/layout contracts; a global hidden rule requires checking existing overrides. |

Patch 5 can proceed independently after the label-projection contract is understood. Do not delay user-visible localization solely for optional enum deduplication or renames.

## Items requiring a narrower decision

- **2.3, owner-scoped presentation:** Prefer a descriptor-driven scope notice initially. A self-scoped list does not automatically justify removing search/export/saved views or redirecting to detail. Preserve supported controls and bookmarks; consider automatic opening only as an explicit shared behavior with navigation and empty-result acceptance criteria.
- **2.5, RLS helper performance:** Measure the repeated JSON parsing before replacing SQL with PL/pgSQL. Preserve function security attributes, transaction-local behavior, missing/invalid setting handling and all three plane policies. Do not change policy semantics to reduce a function-call count.
- **7.5, duplicated DDL:** Keep consolidation separate from functional fixes. Verify installation/migration ordering and equivalent policy installation on all planes before moving identical SQL into common DDL.
- **Earlier backlog:** The original finding IDs remain authoritative. This plan does not close earlier D2 performance work, contract validation, component extraction, capability profiles or scope-adapter projects merely because a related patch is scheduled. Track each against its own acceptance criteria in the earlier resolution note.

## Release evidence

Each patch should record its exact commit and test commands/results. Run affected package typechecks and focused behavioral tests; use colocated server tests for new server units. Browser checks must exercise the shared entity integration, not just isolated controls.

Keep three states separate: **implemented and tested**, **published/adopted on each plane**, and **verified in the running application/database**. Contract or metadata changes need publication/compatibility checks; a new localization file is not proof that existing active releases serve translations. Principal RLS requires live self/admin/cross-tenant checks against installed policies before claiming runtime assurance.

The earlier resolution note reports browser alignment failures and a foundation test-harness failure. Record whether those persist at the chosen baseline; do not silently count the wider suites as passing or attribute new failures to them without comparison.
