# Country framework follow-up: implementation and verification

Date: 2026-09-30. Changes are committed locally on `stack-v2-foundation`. No remote push, deployment, metadata publication or live-database verification was performed.

## Completed changes

| Commit | Findings | Result |
| --- | --- | --- |
| `adb15e4b5` | D1-1, D1-2, D1-3 | Exact decimals retain negative signs and locale controls. Transient collaboration failures preserve the mounted workspace and retry the failed cursor. Group identity/counts use raw values and preserve server ordering. |
| `0b3b90230` | D2-1, D2-2, D1-4, D1-5 | Shared record links, keyboard navigation, menus and data-operation navigation use the application navigation contract. Existing rows remain during same-authority refreshes. Unknown cursor history offers First page. Scope controls notify their owner and honor later parent changes. |
| `ea1d85104` | D2-3 | Detail now uses one authorized response containing its descriptor and projected record. The server reuses the admitted metadata and readable-field projection from the query service. Country fixture reads perform one repository read and 22 field-permission checks on each plane. |

The reference integration remains Country metadata → admitted runtime metadata → existing records query/authorization services → `EntityReadSurface` → shared list/detail runtime. No entity-specific route or provider was added. The new endpoint extends the existing shared records service and is allowlisted in the shared BFF contract for Neon, Mesh and Studio.

## Behavior and compatibility

- Same-origin unmodified link clicks use application navigation; external links, modified clicks, downloads and explicit new-tab targets keep native browser behavior. The shared read surface supplies the existing application router.
- Retained rows keep the query state that produced them for grouping, sorting and pagination summaries. Old cursors, selection-driven mutations, bookmarks and exports cannot operate as fresh results for a different query. Late responses are ignored after cancellation.
- Transient list failures retain rows with an error/retry state. Explicit permission/context failures and unverifiable responses clear retained data. Scope and HTTP-client changes cannot render a previous authority's rows.
- First page resets the cursor and page index while preserving the current search/filter/sort. Normal Previous behavior still uses known cursor history. The new label is in the en/ms/ar catalog; pagination numbers use the governed formatting locale.
- `GET /api/entity-runtime/:entityCode/records/:recordId/detail` returns `{descriptor, record}` through the existing authenticated, private/no-store read-route wrapper. Both halves are contract-parsed; record fields outside the descriptor projection are rejected.
- `getWithProjection` carries internal request-local evidence. Existing `get` still returns only `{data}`. Existing descriptor and record endpoints remain available. There is no cross-request authorization-decision cache and no caller-supplied authorized projection.
- Existing diagnostics, thumbnail and owner-access changes were preserved in the working tree and excluded from these focused commits. The route manifest was generated for the working tree; the committed manifest records the committed route locations, leaving unrelated line-location changes unstaged.

## Verification

| Check | Result |
| --- | --- |
| Full records service Vitest suite | 394 passed, 4 skipped across 56 files |
| Country compiled detail integration + BFF security/common-plane contracts | 45 passed |
| Exact localization, grouping and request lifecycle suites | 24 passed |
| List navigation/refresh/scope/pagination + three-plane route adapter Chromium checks | 8 passed |
| Collaboration pagination failure/draft/retry/denial Chromium regression | 1 passed |
| Affected service, list/detail runtime, descriptor client, gateway and entity-runtime contract typechecks | Passed |
| TypeScript check using staged file contents for the records tests and detail runtime | Passed; verifies commit independence from unrelated working-tree edits |
| Route manifest check and `git diff --check` | Passed |

The browser checks use real shared components with deterministic API fixtures and a supplied navigation callback; they are not a live Next.js deployment or signed-publication acceptance test. Country integration uses actual compilation and in-memory record persistence. The 22-check result is a measured fixture count, not a live latency claim.

The earlier broad list-foundation JSX-loader failures and collaboration layout failures were not treated as resolved by this follow-up. The full repository suite was not run.

## Remaining audit work

Single-tab suppression, broader localization and primitive consolidation, filter-choice endpoint efficiency, diagnostics gating, comprehensive response schemas, capability profiles, detail-stack convergence and Business Partner scope adapters remain separate work. The changes above address the approved correctness, navigation, retained-row, pagination and detail-read stages.

For rollout, deploy the combined server/BFF endpoint before or together with the browser client. The old endpoints remain compatible with older clients. Then verify Country list → detail, browser Back, scope changes and retry behavior against an admitted release on each plane.
