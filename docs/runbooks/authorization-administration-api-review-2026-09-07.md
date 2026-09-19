# Authorization administration API review — 2026-09-07

Scope: the five `/api/control-admin/authorization` routes, management service, and writer contracts.

## Changes

- Approval requires `resourceId` and reads the requester from the selected writer using verified tenant/plane context. Client `payload.requestedBy` is no longer a security assertion. Missing readers fail closed with 503; missing requests return 404, non-pending requests 409, and self-approval 403.
- Legacy/shadow approvals consult the legacy writer; enforce approvals consult the exact-plane repository after writer qualification.
- Unknown mutation kinds are rejected before permission classification. Route category separation remains enforced.
- Optional request fields reject malformed values instead of silently discarding them; expected versions require positive integer numbers.
- Known authorization failures are translated to the runtime's `HttpError` so they retain their intended HTTP status instead of becoming generic 500 responses.
- Authorized status reads expose writer readiness even when enforce mode is selected but the writer gate is unqualified. Mutations still require the qualified gate.

## Adapter integration requirements

The repository contains injected authorization writer interfaces, but no concrete implementation of these command writers was found. Existing adapters must implement `readOverrideRequest(context, resourceId)` to support approval; other command categories do not require that method. It must read authoritative state within the verified tenant and plane. Requester identity must be immutable, and writers must atomically recheck pending status and approver separation when committing an approval. The service preflight is not a replacement for transactional enforcement.

Example approval envelope (identifiers illustrative):

```json
{
  "kind": "override.approve",
  "commandId": "approve-command-id",
  "idempotencyKey": "approve-idempotency-key",
  "resourceId": "stored-override-id",
  "payload": {}
}
```

This review does not establish database concurrency, writer idempotency, or live deployment availability. No deployment flags were enabled. An approval for an already decided request is rejected by the preflight; adapter replay semantics should be considered when adding concrete persistence.

## Validation

- Control-admin package: 93 tests passed, including HTTP authentication, route-category separation, malformed input, verified context, HTTP error mapping, forged requester rejection in all rollout modes, and writer readiness.
- Control-admin production and test TypeScript checks passed.
