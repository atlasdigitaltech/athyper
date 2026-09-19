# Neon application URL review — 2026-09-07

Reviewed the supplied 124 browser route entries against the current working tree: Neon page adapters, catalog routing and route precedence, authentication adapters and destination handling, relay registration, protected layouts, notification service worker, readiness/liveness, and the related Business Partner and workforce clients. This is a browser application review; the existing `neon-api-review-2026-09-07.md` covers the earlier backend review. Existing unrelated changes were preserved.

## Confirmed bugs fixed

| Priority | Finding and affected URLs | Fix |
| --- | --- | --- |
| P1 | Workforce list, create, detail, validation, submission, decisions, and application calls were absent from the Neon relay allowlist. The deployed GET `/api/relay/neon/workforce-requests` returned `404 RELAY_OPERATION_NOT_ALLOWED`. | Register seven explicit tenant-bound operations in the Neon relay. Writes retain CSRF enforcement, bounded request bodies, and the idempotency requirements used by the client/server. No wildcard allowance was added. |
| P1 | Notification click validation changed only the pathname of an external URL, preserving its hostile origin. A slash followed by a single backslash also bypassed the push-time string check and became an external host when parsed as a URL. | Resolve and verify the complete URL at both push and click time; replace invalid/external targets with a new same-origin notifications URL. Preserve legitimate local query strings and fragments. |
| P2 | `/mdg/business-partner/business-partners` matched `[recordId]`, which rejected the collection slug as a UUID. `/requests/new` similarly matched `[requestId]`. The generic business-partner create/detail paths could select generic metadata surfaces instead of the governed workflow. | Add explicit collection, create, detail, and request-create aliases to the existing governed pages. Validate the detail ID before redirecting. Tests use Next's actual route sorting and regex helpers, and execute the alias handlers. |
| P2 | `/mdg/business-partner/{recordId}/supplier` lacked the UUID boundary used by the adjacent customer, role, and scope pages. | Reject malformed IDs with `notFound()` before rendering the supplier client. |
| P2 | A valid push payload containing JSON `null` threw while accessing `message.title`, preventing notification delivery. | Normalize non-object payloads before reading notification fields. |

The relay's standard operations now precede the existing opt-in local pilot entries. The conditional registrations and flags are preserved. The generated test reachability inventory was refreshed for the current working tree, including tests already present before this review.

## Validation

- Six new executable regressions pass in `tests/contracts/neon-application-url-review.test.ts`: Next route precedence, alias execution/invalid IDs, all seven workforce relay operations and CSRF rejection, notification URL safety, null push payloads, and supplier page ID validation.
- Final full root contract selection against the current working tree: 252 passed, 12 skipped, zero failures. These totals include pre-existing tests and concurrent working-tree additions, not just tests authored in this review.
- Business Partner UI package: 83 tests passed. Workforce UI package: four tests passed.
- Neon `tsc --noEmit` passed after the implementation changes.
- Test reachability verification passed after refreshing its generated report.
- Whitespace/diff checks passed for the changed application, gateway, and notification files.

## Live evidence and limits

The development host was reachable. Anonymous GET probes covered all 95 concrete non-API URLs in the supplied inventory, including liveness, readiness, public pages, workspace/module pages, and concrete collection/create pages. All returned HTTP 200. This is **not** a claim that protected pages rendered their contents: inspection of `/home` and the Business Partner collection response found streamed `NEXT_REDIRECT` instructions to login with the destination preserved. Next can send these inside an HTTP 200 response.

Additional read-only probes found `/readyz` ready, `/api/auth/session` anonymous, `/api/auth/contexts` returning 401, and the deployed workforce relay returning the allowlist 404 described above. Development TLS certificate verification was disabled for these probes. The non-API response inventory is recorded alongside this report in `neon-application-url-http-2026-09-07.json`.

The fixes are local source changes, not deployed changes. No authenticated browser workflow, identity-provider login/MFA round trip, database write, notification-provider delivery, or end-to-end approval/materialization flow was exercised. Dynamic IDs were validated in local handler tests rather than against tenant data. No production build or deployment was performed. Existing contract tests provide coverage for auth, context/session races, and relay security; their passing results do not establish live integration correctness.

The development URL catalogue generator remains blocked by an existing unresolved computed `defineRouteContract({ method, path, ... })` at `server/packages/platform/control-admin/src/control-service-routes.ts:139`. That unrelated server inventory issue was not changed. The supplied URLs and actual page tree were used directly for this review.

## Follow-up remediation

The URL catalogue blocker was subsequently resolved by removing an unused contract factory and regenerating the catalogue; the catalogue check and 20 catalogue/manifest tests now pass. A dedicated authenticated test and corrected browser login helper are prepared. Real authenticated execution still requires configured test credentials and the updated development deployment. See [authenticated review setup](neon-authenticated-review-setup.md) for exact commands and the additional lifecycle fixtures.

## User-provided manual login verification

The user subsequently reported successful login and supplied a screenshot of `https://neon.dev.athyper.test/home`, showing the Neon home page with the CirrusAtlantic UK context, navigation, notification/inbox counts, and personalized dashboard. This records user-performed verification that login reaches the protected home page in that context. It is not an automated test result and does not establish that the repaired BP aliases, workforce relay, or approval/materialization workflows have been exercised.
