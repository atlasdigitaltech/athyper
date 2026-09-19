# Notification API review — 2026-09-06

Reviewed the four Notifications operations against route handlers, HTTP contracts, host composition, the Redis event adapter, repository SQL, inbox DDL, exact-plane transaction routing, and notification client response parsers. The initial fixes are now present in the checked-out branch. A follow-up review found and fixed a remaining stalled-publication bug; that additional fix is local and has not been deployed. See the follow-up evidence below.

| Finding | Impact and evidence | Fix |
| --- | --- | --- |
| P2 — Invalid dismiss IDs return 500 | The shared JSON Schema validator does not enforce UUID formats. Invalid IDs pass the contract and reach a helper that throws `TypeError`, which the HTTP runtime treats as an unexpected server error. Three HTTP regression cases reproduced 500. | Add the existing UUID rule as an enforceable contract pattern and document 400. Invalid IDs cannot reach persistence. |
| P2 — Committed updates reported as failures | Read-all and dismiss commit their database updates before awaiting Redis/SSE publication. Rejected publication then returns 500 despite the committed mutation. Two regression cases reproduced this. | Catch fan-out failures after persistence, emit a warning, and preserve the committed success response. Apply the same helper to single-notification read. Database failures still return 500 and never publish. |
| P2 — Push availability false positive | A public key alone makes availability true, although browser push transport creation also requires a subject and private key. Two route regression cases reproduced the false positive. | Require both a nonempty public key and a registered transport supporting `web`. Host tests cover absent, mobile-only, and browser transports, including a missing public key. |
| P2 — OpenAPI loses path constraints | The document generator replaces every path parameter schema with `{ type: "string" }`, discarding dismiss's UUID constraint. The deployed development OpenAPI document confirms this omission. | Preserve declared path-parameter schemas, retaining the existing string fallback for undeclared schemas. The notification contract test asserts the UUID format, pattern, authentication requirement, and 400 response. |
| Test coverage gap | The existing notification route test lives directly under `src`, but the package runner only includes tests under `__tests__`. Consequently its contract assertions do not run. | Include `src/**/*.test.ts` and expand the route suite to exercise actual HTTP requests through the shared runtime, with response enforcement enabled. |

`GET /api/notifications/counts` required no implementation change. The reviewed SQL counts only unread, undismissed rows for the supplied tenant and principal. The route obtains that scope and the plane from verified request context. The host selects a separate database for each plane and throws if that plane is unavailable.

Database verification used the actual notification repository against a temporary PostgreSQL 16.13 container with independent studio, neon, and mesh databases. The fixture used the repository's inbox-table DDL, with a test UUID default helper. Checks passed for tenant/principal ownership, missing IDs, read and dismissed exclusions, repeated dismissal, repeated read-all, preservation of original timestamps, and unchanged rows in the other plane databases. This was a one-off isolated check, not a full deployment/RLS qualification; external foreign keys and production roles were not installed. The temporary container was removed.

Validation completed:

- Notification package: **90 tests passed**, including 25 route tests. Seven regression cases failed against the original behavior and passed after the fixes.
- Host notification composition and adapter registration: **18 tests passed**.
- Shared HTTP runtime: **13 tests passed**.
- Notification package, host, and shared HTTP runtime typechecks passed.
- `git diff --check` passed.
- Retrieved the development OpenAPI document and confirmed all four unauthenticated operations return **401**. These local checks used curl's per-request certificate bypass for the development self-signed certificate; no credentials were sent.

Limits: authenticated development mutations and actual browser push delivery were not exercised. A failed fan-out can leave other connected clients stale until they refetch; committed inbox data remains authoritative. The initial fix handled rejected publication only. The follow-up below removes publication from the HTTP response wait; connected clients still rely on refetching if a broadcast is lost.


## Follow-up review of the current branch

Reviewed local branch `stack-v2-foundation` at base commit `7dbd0401`, including the earlier fixes. The supplied GitHub source URL returned 404 to the browser tool, so remote source equivalence was not independently verified. The development OpenAPI document was accessible locally and matched all four operation IDs, including the dismiss 400 response. Each of the four endpoints again returned 401 to an unauthenticated request. As before, these credential-free development probes bypassed the self-signed certificate check for that request only.

**Additional P2 bug fixed:** read-all and dismiss still awaited `publishInboxEvent` after committing their database transaction. Catching rejection does not handle a publisher that remains pending. The Redis event adapter awaits subscription readiness and publication, and the in-memory adapter awaits listeners, so neither interface guarantees prompt completion. A stalled publisher could leave a completed mutation without an HTTP response.

The routes now start the optional broadcast without awaiting it. The helper handles both synchronous throws and promise rejections and logs failures. Single-notification read uses the same helper and receives the same correction. Persistence remains awaited; missing/foreign notifications and database failures retain their original error behavior. This does not add durable event delivery or cancel a pending Redis command. A process exit can drop an unfinished broadcast; PostgreSQL remains authoritative.

Four new regression cases failed with request timeouts before the fix: stalled publication for read-all, dismiss, and single-read, plus delayed rejection after the response. They pass after the fix. Two additional tests verify that neither the response nor the broadcast precedes completion of persistence.

| Endpoint | Current review result |
| --- | --- |
| `GET /api/notifications/counts` | Verified tenant/principal/plane propagation, spoofed query scope rejection by construction, zero and positive counts, and persistence error behavior. Rechecked SQL predicates and database routing; no additional confirmed defect. |
| `GET /api/notifications/push-configuration` | Existing transport/public-key fix remains intact. Revalidated absent and mobile-only transports, browser transport, missing/blank key, and authentication. Availability describes configured capability, not a live provider delivery probe. |
| `POST /api/notifications/read-all` | Fixed stalled post-commit publication. Revalidated response count/timestamp, verified scope, empty updates, and persistence errors. |
| `POST /api/notifications/{id}/dismiss` | Fixed stalled post-commit publication. Revalidated UUID validation/OpenAPI schema, missing/foreign result handling, scoped mutation, and empty 204 response. |

Current verification: **96 notification tests, 18 host notification/adapter tests, and 29 shared HTTP runtime tests passed (143 total)**. Notification production and test TypeScript checks passed, as did `git diff --check`. The isolated PostgreSQL verification described above belongs to the initial review and was not rerun in this follow-up; repository SQL was unchanged. Authenticated development mutations and browser push delivery were not exercised. The new broadcast-wait fix requires deployment.
