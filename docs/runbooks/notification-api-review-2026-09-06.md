# Notification API review — 2026-09-06

Reviewed the four Notifications operations against route handlers, HTTP contracts, host composition, the Redis event adapter, repository SQL, inbox DDL, exact-plane transaction routing, and notification client response parsers. Fixes are in the workspace; they have not been deployed.

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

Limits: authenticated development mutations and actual browser push delivery were not exercised. A failed fan-out can leave other connected clients stale until they refetch; committed inbox data remains authoritative. Publication is still awaited, so this fix handles rejected publication rather than introducing a new timeout policy. Redeployment is required before the development API and its documentation reflect these changes.
