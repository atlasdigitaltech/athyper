# Entity route audit implementation — 2026-09-30

This records the six requested fix groups from [the Country/Principal audit](entity-route-code-review-country-principal-20260930.md) and [the action plan](entity-route-audit-action-plan-20260930.md). Implementation is in the working tree over `d39f314d2`; this session did not commit, publish metadata, deploy, or inspect live database state. Other sessions were modifying the same tree, so the aggregate Git diff includes their work too.

## Implemented

| Group | Changes and evidence |
| --- | --- |
| 1. Embedded navigation and pending filters | Added a separate `onOpenRecord(row)` embedding callback. General links retain application navigation through the shared provider. Column-filter mutations merge into current requested state while retained rows display their corresponding filters. Browser tests exercise record opening, transfer navigation, and a second filter while the first request is pending. |
| 2. Transfer destinations and context | List descriptors publish a transfer workspace only for supported planes (Neon/Mesh). Studio hides unsupported workspace/import links; supported exports remain available. Parent coordinates are preserved through guided-import routing, and parent-scoped imports are hidden because that server scope does not support import. Shared record runtime consults descriptor `scope.workContext` and a plane context adapter; tenant records no longer wait for Neon business context. Required-context errors offer a localized retry. Organization-context dependency errors propagate instead of remaining in loading. Canonical Neon entity routes are again simple shared adapters. |
| 3. Server validation, errors and read admission | Record-ID validation uses the shared syntax, including bounded and deduplicated `recordIds` query admission. Invalid owner scope produces a typed `RecordServiceError`. A successfully authorized record projection satisfies read admission; descriptor-only and compatibility fallback paths still authorize. Separate edit and other capability decisions remain. Timing stages distinguish the admitted record path. Tests assert a single read authorization on that path, retained descriptor-only denial, owner restrictions and parent scope. |
| 4. Related records | Related record loading uses abortable resources, a parent-scoped membership query, and the combined detail request. Opening an explicit row still checks locked parent membership. Parent detail descriptors publish per-relationship create capability; the UI no longer probes full form descriptors. Dependency failures propagate rather than becoming false permission denials. Edit availability comes from the actual child detail actions. Browser coverage confirms one child detail request and no separate record/detail-descriptor/form-probe requests. |
| 5. Principal localization | Added en/ms/ar localization for Principal fields, tabs, sections and enums, including JIT/API capitalization. Table-product import/compiler hydrates explicit localization references. Native projection preserves authored enum labels, and published presentation localization carries enum labels to list/filter/detail formatters. Tests compile Principal for all planes and exercise actual server descriptors and both value formatters. |
| 6. Shared localization, diagnostics and consolidation | Localized pagination, saved-view empty states, context labels, Mesh selector labels and activity errors. Removed lowercasing of authored entity titles; counts/dates use governed formatting and exact-decimal formatters use a bounded cache. Detailed `Server-Timing` is opt-in through `diagnostics` or `ENTITY_READ_DIAGNOSTICS=true`. Shared abortable request handling now serves detail and thumbnails; locale changes and plane diagnostics use shared helpers. Form/detail storage uses UI helpers directly. Shell navigation imports use package exports and Studio derivation is memoized. Dialog size variants replace forced widths, and native hidden behavior has one UI-level rule. |

## Verification

Focused results on the working tree:

- **10 browser tests passed:** `entity-audit-regressions.spec.ts`, `neon-context.spec.ts`, `entity-read-route-adapter.spec.ts`, using `playwright.foundation.config.ts`. These mount the real shared UI with fixture transports.
- **68 server tests passed:** records package `entity-detail-read.test.ts`, `record-identity.test.ts`, and existing `entity-list-read-routes`, `entity-list-service`, `parent-collection-scope`, `record-owner-access` suites.
- **7 authoring tests passed:** Principal localization and table-product suites.
- **5 native metadata projection tests passed.**
- **23 foundation tests passed:** `entity-localization.test.ts` and `entity-request-lifecycle.test.ts`, using `tsx --tsconfig tooling/config/tsconfig-react.json --test`.
- Typechecks passed for list-view, form-detail, all three plane shells, records, and Studio meta-entity-authoring. `git diff --check` passed.

The broader run adding `entity-list-phase1a.test.tsx` completed with **39 passed and 3 failed**. Remaining failures are the application-error heading expectation, the old drawer-menu selector, and reopening scope quick filters. These were not suppressed or counted as passing. The shared error/drawer UI is also under concurrent modification; this report does not establish that the failures predate this task. The whole repository test suite and production builds were not run.

## Limits and remaining audit work

- **Publication remains outstanding.** Source/compiler parity does not update active releases. Import, compile, publish and adopt the revised metadata on each plane before checking live Malay/Arabic labels and RTL layout.
- Direct record entry on a context-enabled plane can make an application-descriptor discovery request before the combined detail request when no matching descriptor is inherited. A discovery permission denial falls through to the record's own read authorization, preserving independent read access. This is not a claim of one total HTTP request per page.
- **Database savings remain unmeasured.** Tests prove removal of the duplicate service-level read authorization on the admitted path. They do not establish transaction/query savings or latency for Country, Principal self/admin, or directory-scoped records. Live RLS/self/admin/cross-tenant verification was not performed.
- `getWithProjection` remains optional for compatibility; its fallback is still authorized. Public method/file renames were not used as blockers.
- Broader audit refactors remain separate: owner-scoped presentation (2.3), RLS JSON parsing and DDL consolidation (2.5/7.5), moving the inline detail-read contract (3.2), widespread composition error taxonomy and domain-source registrations (3.8/7.3), enum-definition deduplication (7.4), legacy CSS token/stacking cleanup, and earlier component-consolidation backlog.
- Shared localization is improved, not globally complete: authored transition labels and older transfer/filter-control strings still need their own metadata/catalog work. No claim is made that every historical finding is closed.
