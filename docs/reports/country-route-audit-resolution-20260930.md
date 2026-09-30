# Country audit: disposition, fixes and recommendation

Date: 2026-09-30. Follow-up to [the supplied review](country-route-code-review-20260930.md).

## Disposition

The highest-priority findings are actionable shared-framework defects. This change implements D1-1, D1-2 and D1-3. The remaining items below are recommendations, not completed implementation. Existing unrelated working-tree changes were preserved; there was no publication, deployment or live-environment verification.

| Finding | Assessment and action |
| --- | --- |
| D1-1: negative decimals | Fixed in [entity-value.ts](../../packages/platform/foundation/i18n/src/entity-value.ts). Use numeric negative zero only for a negative zero integer part; retain BigInt for all other integer parts. This preserves exact digits, trailing fraction zeros, localized minus signs and bidi literals. Simply prefixing a minus sign would omit some RTL formatting controls. |
| D1-2: collaboration failures | Fixed in [detail-collaboration.tsx](../../packages/platform/entity/runtime/form-detail/src/detail-collaboration.tsx). Transient refresh/page errors retain the mounted workspace and show inline Retry. Retry reuses the failed cursor. Initial errors still show the unavailable state. Explicit 401/403 and known context-required failures clear retained content; identity/record changes retain their existing reset behavior. |
| D1-3: grouping | Fixed in [grouped-rows.ts](../../packages/platform/entity/runtime/list-view/src/grouped-rows.ts), consumed by table and compact views. Raw value plus field identifies a group; missing, null and empty remain distinct. Counts use that same identity. Server bucket order is preserved, with row encounter order as fallback. Collapse and React keys no longer depend on translated labels. Only buckets represented on the current page render. |
| D1-7: unresolved relationship | Ruled out for parsed presentation input. [record-presentation.ts](../../packages/contracts/platform/entity-runtime/src/record-presentation.ts#L189) rejects unresolved relationship keys. Do not add a fallback that silently hides invalid published metadata. |
| D2-3: repeated detail work | The browser still requests descriptor and record separately in [detail-requests.ts](../../packages/platform/entity/runtime/form-detail/src/detail-requests.ts). Both paths call record reads in the service. The precise decision count remains a static estimate; this follow-up did not measure live Country requests. |
| Other findings | Retain as the backlog below. This follow-up does not independently certify every count, package, or proposed issue in the original review. |

## Integration boundary

Country is defined by [definition.json](../../metadata/products/shared/entities/country/definition.json), with localization and collaboration capabilities beside it. The shared compiler and native runtime projection turn this into runtime metadata. Production [metadata composition](../../server/apps/platform-host/src/composition/shared/entity-runtime/metadata.ts) selects admitted compiled releases or the configured publication format; it does not authorize client-selected metadata.

[Read runtime composition](../../server/apps/platform-host/src/composition/shared/entity-runtime/read-runtime.ts) supplies the metadata reader, authorizer and scope resolver to the existing query/list services. [Entity list service](../../server/packages/services/records/src/entity-list-service.ts) resolves collection scope and readable fields before producing browser descriptors. [The route adapter](../../packages/platform/entity/runtime/form-detail/src/routes/entity-read-route.tsx) dispatches through [EntityReadSurface](../../packages/platform/entity/runtime/form-detail/src/entity-read-surface.tsx) into the shared list/detail runtime. Collaboration uses the existing authorized entity-runtime capability endpoint. The fixes change presentation behavior at those existing seams; they add no provider, API or entity-specific route.

## Recommended fix sequence and acceptance criteria

| Order | Findings | Recommended implementation and verification |
| --- | --- | --- |
| 1 | D1-1…3 | Review and land this correctness patch. Keep the regression tests with it. |
| 2 | D2-1, D2-2, D1-4, D1-5, D2-7, D1-6 | Use the existing app navigation contract for record links, keyboard activation and menu actions, preserving modified-click/new-tab behavior. Retain rows only within the same authority and scope, disable actions that would apply the new query to old rows, and prevent old cursors from paginating a new query. Provide First page when URL restoration has no cursor history. Define controlled versus uncontrolled scope explicitly. Suppress single-tab record navigation and stop lowercasing authored entity titles. Browser acceptance: shell mount count unchanged, rapid query changes ignore late responses, authority changes immediately hide old data, reloaded later pages can recover, organization changes use the new server scope. |
| 3 | D2-3…6 | Build one authorized detail read returning descriptor plus projected record from the same admitted release and scope. Reuse readable-field projection within that request; never globally memoize authorization decisions. Parallelize only independent post-authorization reads. Add a narrow filter-choice operation and a bounded locale/numbering-system formatter cache. Measure query counts, authorization counts and latency alongside the in-flight read-evidence work; test denial and context transitions. |
| 4 | D2-9, D2-10, D3-5 | Gate detailed timing by explicit diagnostics configuration. Validate serialized list/record responses against contracts and preserve typed errors. Verify production defaults omit diagnostic detail and malformed responses fail at the boundary. These changes must preserve the existing uncommitted diagnostics work. |
| 5 | D8-1…8, D6-3, D7-4 | Move shared UI sentences and plurals into platform catalogs, including whole filter descriptions; consistently use governed formatLocale and numberingSystem. Expand label projection to actions, summary cards, relationships and badges. Keep entity keys namespaced and require catalog shape validation. Verify en/ms/ar, RTL, large exact decimals and an intentionally different UI/format locale. The reported literal count was not independently recounted. |
| 6 | D3, D4, D5, D6 | Extract bounded modules while preserving public exports and behavior. Consolidate tabs, clipboard behavior, page actions, scope schema and location keys only after checking their differing contracts. Audit each z-index in its stacking context rather than mechanically replacing all literals with a global layer. Use measured sticky offsets and existing spacing/radius tokens. Keep purely cosmetic reformatting in a separate PR. |
| 7 | D7-1…3, D7-5 | Follow the architecture recommendations below; these are framework projects with publication/compatibility acceptance criteria, not quick Country changes. |

## Architecture recommendations

- **Canonical detail path:** document the production Country path (`EntityReadSurface` → `EntityDetailRuntime` → `MetadataDetailWorkspace`) as the onboarding reference now. Correct the contradictory `EntityRecordPage` comment. Keep compiled bootstrap fixtures until a deliberate convergence change proves routing, authorization, collaboration and plane parity; do not silently retire them in this bug fix.
- **Capability profiles:** implement the designed resolver at authoring/compilation time. Publish resolved, versioned capability settings with provenance, reject unsupported overrides, and prove existing Country output remains equivalent before switching its metadata to profile references.
- **Business Partner coordinates:** use a registered scope adapter whose accepted coordinates are declared in metadata and validated on the server. Preserve organization locking and bookmark/collaboration authorization. Avoid replacing the current enums with an unrestricted object or string.
- **Import templates/routes:** resolve these from the published contract and route catalog, with version checks. Do not introduce entity-specific templates in the shared browser runtime.

## Validation performed

- Affected i18n, entity-list-view and entity-form-detail package typechecks passed.
- Focused localization and grouping suites: **20 passed**. They exercise real Country compilation and authorized descriptor projection with in-memory admission, exact negative decimals across locales, distinct same-label groups, authoritative counts, server ordering and locale-stable keys.
- New Chromium regression: failed comment pagination preserves a draft, retry uses the same cursor, and explicit denial clears the workspace. Passed. The shared lifecycle fix covers files too, but upload-queue failure preservation and post-mutation refresh were not independently browser-tested in this follow-up.
- Full collaboration browser suite: **29 passed, 3 failed**. Failures are the content-edge alignment assertions at 1920, 1024 and 390 px. All three also failed with the original HEAD collaboration component substituted into the same current-tree fixture. This establishes that these three failures do not depend on this component patch; it does not certify the rest of the dirty tree.
- Combined foundation run after correcting the regression's expected governed numbering system: **25 passed, 14 failed**. The wider list tests fail with `React is not defined` in the shared `SurfaceErrorBoundary`; retrying with explicit `TSX_TSCONFIG_PATH` did not resolve it. Do not claim the full list regression suite passed.
- `git diff --check` passed. No test fixtures were published or activated, and no live Country browser flow or database state was verified.
