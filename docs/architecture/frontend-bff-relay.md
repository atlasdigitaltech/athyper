# Hardened frontend BFF relay

`@athyper/platform-gateway-bff-relay` is the only active browser-to-platform-host transport. Browser clients call same-origin `/api/relay/...`; only server route handlers can resolve the relay package's Node export.

## Operation registration

The relay has no wildcard upstream mode. Each vertical slice must register a `RelayOperation` containing its exact HTTP method, `/api/...` path template, request class, tenant requirement, idempotency policy, and body limit. Phase 4 initially registers only:

```text
GET /api/iam/me -> iam.me, JSON, tenant optional
```

Adding a route therefore requires an intentional active-package change and tests. A dynamic `:tenantId` segment can declare `tenantParam: "tenantId"`; the relay compares that value with the verified session before forwarding.

## Trust boundary

All browser identity, authorization, cookie, forwarding, and hop-by-hop headers are discarded. The relay decrypts token material through the server-only auth runtime and injects bearer token, plane, realm, principal, auth epoch, and selected tenant from the Redis session.

Unsafe requests require the configured application origin, same-origin fetch metadata when present, and the session-derived CSRF proof. Login and context rotation issue a host-prefixed, `Secure`, `SameSite=Strict` CSRF cookie alongside the host-prefixed `HttpOnly` session cookie. The CSRF proof contains no token or identity data.

`RUNTIME_API_URL` is mandatory and server-only. A public runtime URL is neither accepted nor needed by browser code. Paths are rebuilt from validated route segments and matched against the operation allowlist, preventing arbitrary origins, traversal, encoded delimiter attacks, or cross-service routing.

## Forwarding and failures

- JSON, upload, download, and stream operations have separate timeouts.
- Request header and body limits are applied before or during bounded upload forwarding; compressed browser request bodies are rejected to avoid decompression-size ambiguity.
- Upstream response bodies remain streams. Browser disconnects cancel the upstream body.
- Upstream cookies, identity headers, and hop-by-hop headers are stripped. Safe status and response metadata are retained.
- Relay-generated errors use the canonical `application/problem+json` shape.
- One eligible 401 triggers one coalesced refresh. Retrying requires an idempotent method or a valid idempotency key and a replayable body.
- `AUTH_CONTEXT_MISMATCH` revokes the session and returns `x-athyper-session-action: select_context`; it never enters a refresh loop.
- Diagnostics contain operation identifiers, status, and safe request IDs only—never cookies, tokens, request bodies, or response bodies.
