# Consolidated Manage/Record audit disposition

Reviewed the supplied four-stream report against the current source. This pass changes existing DEV source; it does not reset/reseed data, publish metadata, change grants, or claim full-repository verification.

## Numbered findings

| Finding | Disposition |
| --- | --- |
| 1 — legacy comment authorization | The claimed complete bypass was not confirmed: production `collaboration.create` already invokes the capability-policy hook before creating a comment. Hardened the legacy adapter with explicit canonical capability admission and changed its entity coordinate from `master.business_partner` to `business_partner`. Internal audience/participant rules now have an explicit preflight and the existing service gate. The legacy endpoint does not accept reply-parent input. |
| 2 — parallel HTTP stacks | Still present for compatibility with existing clients. This pass shares the authorization boundary; it does **not** retire all legacy endpoints or reconcile all aliases/validators. That consolidation remains outstanding. |
| 3 — removal identity | Fixed the missing surface registry argument. A rendered-dialog regression test proves that a primary nested child's identity appears in the removal confirmation. |
| 4 — directory fallback | Removed permission-only reauthorization. Parent admission returns server-resolved scope candidates; record, section and field fallback checks retain record/tenant attributes and authorize those candidates. Empty evidence never widens access; explicit selected scopes and explicit denials are not relaxed. Host admission reuses the canonical parent resolver rather than reading the record twice. |
| 5 — company authorization plumbing | Confirmed intentional partner-level banking facts, not unfinished company bank ownership. Credit and qualification readers separately constrain their selected company/organization. Removed unused `authorizeCompany`/`authorizedCompanyIds` plumbing. No bank usage/verification model was restored. |
| 6 — unsupported request edit schemas | The generic identity form is now restricted to `new_partner`. Other kinds cannot PATCH identity-only fields through that form and are directed back to the request. This is a safe guard, **not implementation of missing dedicated capture forms**. |
| 7 — lifecycle invalidation | Both generic-operation and direct registration paths use the same principal/tenant/authorization-epoch invalidator. It handles receipts and the materialized/target partner ID, clears all context variants, and does not rely on the obsolete `default` cache scope. |
| 8 — malformed routes | Route resolution now returns unavailable instead of throwing. Tests cover dot segments, malformed escapes and encoded separators. |
| 9 — navigation allocations | Memoized section lists/navigation and stabilized selection/collaboration callbacks. Section/resource changes still update consumers; hooks remain unconditional. |

## Additional confirmed fixes

- First-page and continuation requests now share 401/403/404 availability handling.
- Record query keys use one predicate; browser and entity HTTP UUID checks enforce complete UUID segment lengths.
- Collection validation selections are pruned when rows disappear.
- Partner-reference metadata is fetched per client/identity scope, not on every query change; result searches remain debounced, abortable and server-authorized.
- Investigation of a hanging intake test found a task-header self-registration loop. Registration now uses a separate stable context instead of subscribing to the state it updates. All four intake-runtime tests pass after this fix.

## Remaining consolidation candidates

The broad structural suggestions are not claimed complete: retiring the parallel 360 clients/routes, parameterizing reveal commands, extracting shared control tables/presentation primitives, centralizing all provenance literals and validators, unifying list/overview authority hooks, reducing the service module, and consolidating document-level menu listeners. These require compatibility/behavior work beyond the concrete fixes above; deleting a live compatibility path or relaxing a closed projection is not a safe cosmetic cleanup.

## Verification

- 44 targeted frontend tests, including routing, intake lifecycle, record navigation, section errors, principal-scoped invalidation and nested removal confirmation.
- 68 targeted BP service/policy/reveal/commercial tests.
- 22 capability-policy tests and 42 collaboration-service tests.
- Neon, platform-host and master-data TypeScript checks.
- Signed-in CATL admin organization/person API and browser checks: identity, certificates, masked banking, canonical redirects with repeated query parameters, Back/Forward without bootstrap reload, pagination, automatic loading, reply depth and cross-tenant denial.
- Initial live attempts overlapped source restarts/rate limits (502/429); sequential reruns passed. No rate limits were disabled or permissions broadened.
- Successful live secret reveal, real comment creation and new bank capture were not performed. The full repository test suite was not run.

Read-only checks remain `verify-audit-fixes.live.mjs` and `verify-read-audit.live.mjs` in this directory. Run sequentially to avoid exhausting DEV's request budget.
