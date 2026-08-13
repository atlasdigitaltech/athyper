# Frontend API client contract

`@athyper/platform-api-client` is a React-free transport factory. It is not an authentication SDK, domain-client registry, or mutable singleton.

## Browser boundary

- Every request resolves beneath `/api/relay`; absolute URLs, traversal, bearer headers, cookies, and tenant headers are rejected before `fetch`.
- The browser uses same-origin credentials. The BFF owns session cookies, upstream authorization, tenant context, and token refresh.
- Unsafe methods require a CSRF provider. Raw CSRF and idempotency headers cannot bypass transport policy.
- Idempotency keys are accepted only by typed mutations declaring `idempotency: "required"`. The client performs no automatic retries.

## Operations and responses

`createOperation` declares method, relay path builder, request class, response mode, boundary parser, and idempotency policy. Dynamic path values pass through `encodePathSegment`.

The client supports JSON, empty/204 responses, `FormData`, binary blobs, upload progress through an injected strategy, and unbuffered streams. Request-class timeouts cover response establishment; lifecycle cancellation continues through the fetch signal.

Bootstrap, session, authorization, and navigation data are accepted through their canonical contract parsers. Later vertical slices should publish small domain clients or subpath exports that receive an `HttpClient`; they must not enlarge the transport into a global service-client singleton.

## Failures and diagnostics

`ApiTransportError` classifies authentication, authorization, validation, conflict, rate-limit, dependency, network, abort, timeout, and parse failures. Platform problems and response request/correlation IDs remain available on the error.

Diagnostics contain method, relay path, failure kind, status, and correlation identifiers. Request headers and response bodies are excluded by default.
