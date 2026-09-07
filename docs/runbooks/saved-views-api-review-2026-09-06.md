# Saved views API review — 2026-09-06

Reviewed saved-view routes across `/api/me`, `/api/platform/preferences`, and `/api/platform/saved-views` (18 registrations after duplicate-route cleanup), including the service, PostgreSQL repository, schema constraints/indexes, host composition, and authentication registration.

## Why multiple route sets exist

They expose one saved-view implementation. Host composition creates one service using the PostgreSQL repository and passes it to one route registrar. The registrar reuses its handlers across the URL patterns.

| Route base | Purpose in the implementation | List response | Operations |
| --- | --- | --- | --- |
| `/api/me/saved-views` | Current-principal action alias | Array | List, pin/star, share/unshare, archive, clone |
| `/api/platform/preferences/saved-views` | Canonical preference-resource API | `{ savedViews: [...] }` | List, create, PUT, DELETE, actions, clone |
| `/api/platform/saved-views` | Entity-based compatibility API | Array at `/{entity}` | Create, entity list/create/PATCH/DELETE, set/clear default |

All sets use the same authenticated plane, tenant, and principal. The `/platform` prefix grants no additional administrative authority. Visible records include the principal's personal views plus tenant-visible shared/system views. Pins, stars, and defaults are per-principal preferences. Actual saved views live in plane-local `master.saved_view`; personal flags/defaults live in `master.principal_ui_preference`. URL namespaces do not define separate storage.

The preference-resource list accepts `entity`, `surface`, and `includeArchived` filters, as does `/me`. The entity API takes its entity from the URL. Default selection currently has routes only in the entity API and is keyed per entity. Direct DELETE archives the view and returns 204; archive/delete actions archive and return `{ ok: true }`. PATCH pin/star toggles, DELETE pin/star disables, PATCH share shares, and DELETE share makes the creator's view personal.

New clients can use the canonical preference-resource routes for CRUD/actions, with the entity API for default selection. The duplicate `/api/user/saved-views` endpoints were removed after a repository search found no application callers. Current-principal clients should use `/api/me/saved-views`. Route documentation and the OpenAPI exception baseline were updated; a registration assertion prevents accidental reintroduction.

## Findings and fixes

| Priority | Confirmed defect | Resolution |
| --- | --- | --- |
| P1 | Any authenticated principal in a tenant could archive a shared view or turn it into their own personal view. Both service authorization and SQL explicitly allowed all shared rows. | Authorize shared mutations against `created_by`, since schema constraints require shared rows to have a NULL owner. Enforce this in both the service and archive/scope UPDATE predicates. System views remain read-only. |
| P2 | DELETE pin/star toggled the flag, so deleting an absent flag or retrying a deletion enabled it. | DELETE explicitly disables; PATCH preserves its existing toggle behavior. |
| P2 | Flag mutations read and replaced the entire preference in separate transactions, losing simultaneous updates to different views. | Production PostgreSQL repository uses one atomic INSERT/ON CONFLICT UPDATE, calculating changes from the locked current preference. Legacy array preferences are supported. |
| P2 | Create/clone responses claimed version 1 although optimistic replacement compares PostgreSQL `xmin`. An immediate edit using the returned token conflicted. Clone responses also lacked a version ETag and omitted persisted clone metadata. | Inserts return their actual database version; the service returns the persisted view and metadata. Clone responses include the version ETag. |
| P2 | Cloning a valid long code or name could violate the 127-character code or 160-character name constraint after adding the clone prefix/suffix. | Bound the generated code and default name, counting Unicode code points for names. Reject explicit empty/oversized names. |
| P2 | Invalid UUID path values reached PostgreSQL and became server errors. Clone accepted arrays and silently ignored invalid name types. Uniqueness/check violations also escaped as server errors. | Validate UUID paths and clone object/name input. Return sanitized 409 responses for uniqueness conflicts and 400 for check violations. |
| P2 | Service allowed shared-view replacement, but repository required personal scope and used a NULL owner as the actor, preventing legitimate edits after sharing. | Use the recorded creator as actor for shared views and permit creator-authorized replacement, retaining the version predicate. |

Primary implementation: `server/packages/platform/preferences/src/saved-view-routes.ts`, `src/index.ts`, and `src/kysely-saved-view-repository.ts`.

## Additional findings from the expanded platform review

| Priority | Confirmed defect | Resolution |
| --- | --- | --- |
| P2 | Generic DELETE `/:entity/:viewId` matched `/:entity/default` first, making clear-default unreachable. | Register the literal default route before the generic route; test through Express. |
| P2 | Entity PATCH and DELETE loaded by view ID alone and ignored the entity path parameter. | Validate the loaded view's entity in the service before any write; mismatches return 409. |
| P2 | Entity PATCH reused full-replacement parsing. Rename-only requests reset state to `{}`, and state-only requests failed because name was required. | PATCH accepts partial editable fields and preserves omitted fields; empty patches fail validation. PUT requires name and object state/config. |
| P2 | Arrays, strings, and other invalid state/config/metadata values were silently replaced by `{}`, allowing data loss. | Reject non-object JSON values. Also reject malformed list filters instead of silently dropping them. |
| P2 | Description could never be cleared, including through PUT replacement. | PATCH preserves an omitted description; explicit null/blank clears it. PUT clears an omitted description. |
| P2 | Generated codes could begin with a digit, violating the schema. Equal slugs created in the same millisecond collided even for distinct names. | Generate codes with an alphabetic prefix and UUID suffix, within the schema length limit. |
| P2 | If-Match accepted weak/unbalanced ETags and numbers outside the PostgreSQL transaction-ID range. | Accept well-formed strong numeric tokens and legacy bare numbers within the valid positive 32-bit range; reject invalid tokens before writing. |
| P2 | Archive cleanup read an old default then unconditionally deleted the preference, potentially deleting a newly selected default. | PostgreSQL cleanup conditionally deletes only if the current default still names the archived view. |
| P2 | Uppercase UUID path strings were stored verbatim in preferences, while PostgreSQL returned lowercase IDs, so flags/default presentation could disagree across requests. | Normalize validated UUID paths to lowercase. |

## Verification

- Expanded-review regression suite before duplicate-route cleanup: **95 tests passed** across four files. Those HTTP tests exercised both user aliases and platform handlers, list envelopes, create, partial PATCH/full PUT, default route dispatch, entity mismatch rejection, version checks, UUID normalization, repeated DELETE, shared/system write authorization, cloning, malformed input, and sanitized constraint errors. Repository tests cover returned versions/metadata and creator mapping.
- Preferences production and test TypeScript checks passed.
- Scoped `git diff --check` passed.
- Ran actual repository/service calls against an isolated PostgreSQL 16.13 container using saved-view and UI-preference table definitions from the repository, including their CHECK constraints and preference uniqueness constraint. Confirmed actual version tokens can be used for immediate replacement, maximum-length Unicode names/codes clone successfully, creator-authorized shared replacement works, unauthorized archive/unshare is rejected by SQL as well as service, and tenant/personal reads remain isolated.
- PostgreSQL concurrency checks: 30 concurrent flag additions retained all 30 IDs; 10 concurrent deletions of one ID left the other 29; 10 concurrent toggles of an enabled ID retained its initial state. Legacy array preference conversion also passed.
- Expanded review also exercised actual Express handlers backed by PostgreSQL with both active saved-view name/code uniqueness indexes. Verified identical visible records across all four URL patterns, creation of digit-leading names and distinct equal-slug names, persisted PATCH/PUT behavior, stale-token rejection, entity mismatch rejection, clear-default routing, preservation of a newer default during conditional cleanup, and cross-alias uppercase UUID pin behavior.
- Removed both temporary database containers after verification.

## Duplicate-route cleanup verification

Repository search found no application callers of the removed user namespace, including dynamically constructed saved-view paths. Removed its four registrations, redundant alias test cases, and OpenAPI exceptions; regenerated the server manifest and development URL catalogue. The only remaining literal references identify the removal in this report and assert the namespace is absent in the registration test.

After cleanup, **70 preferences tests** and **19 route/catalogue tests** passed. Preferences TypeScript checks, route-manifest/catalogue freshness checks, and scoped whitespace checks passed. Saved-view OpenAPI validation confirms exactly **18** current raw routes with no stale or missing exceptions. The repository-wide OpenAPI check still fails on other modules, including a stale audit exception and undocumented business-partner/workforce routes; it reports no saved-view failures.

## Limits and behavior decisions

Shared views are tenant-readable and creator-writable through these routes. No administrator override is introduced. Existing rows already retain their creator, so no schema migration is required.

The PostgreSQL concurrency guarantee applies to its new atomic flag method. Custom repositories that only implement the older preference methods retain compatibility fallbacks and must provide `updateFlag` and `clearDefaultIfMatches` for equivalent concurrency guarantees.

The isolated database checks did not exercise the full plane RLS/identity stack. Authenticated development endpoints and deployed browser flows were not exercised, and these workspace changes have not been deployed. GET still performs per-entity default-preference reads; no unmeasured performance claim is made.
