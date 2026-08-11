# Authorization management Wave 4 build status

Date: 2026-08-11

## Gate state

The accepted Wave 0 ownership ADR remains authoritative. Production writer-switch approval is pending and the recovery contract still marks the target writer as non-writable. This build therefore does not register a new management HTTP surface, enable an authorization-v2 writer, or change authorization epochs directly.

## Delivered foundation

- Repository-independent mutation contracts cover roles and permissions, groups and scoped roles, deny rules, delegations and grants, emergency overrides, exact-record ACLs, trusted devices, scope targets, and entity operation/scope-binding publication.
- Separate permission codes exist for read, manage, approve, revoke, and break-glass operations.
- The semantic service supports legacy, shadow, and enforce modes without unioning writer results.
- Legacy mode writes only through the legacy writer.
- Shadow mode keeps the legacy receipt authoritative and performs only a v2 preview. Missing or failing plane-local preview repositories are captured as shadow observations and do not fail the legacy mutation.
- Enforce mode fails closed until writer approval, target writability, equal source/applied watermarks, golden-corpus evidence, named approval, and an approval ticket are all present.
- Repository selection uses the exact verified plane and has no Neon/Mesh mirror or fallback behavior.
- The service emits business audit evidence and contains no epoch mutation. Existing DDL change capture remains responsible for invalidation and epoch advancement.
- The proof helper implements the accepted precedence: boundary and identity failures, operation incompatibility, entitlement and hard-policy failures, explicit deny, and incomplete scope all beat role, delegation, record ACL, and emergency-override allow paths.

## Deliberately not activated

The following work remains gated rather than silently bypassed:

- concrete plane-local persistence adapters and transaction/idempotency implementation;
- management read and mutation HTTP contracts, registration, and OpenAPI publication;
- live golden-corpus execution against each plane-local evaluator;
- change-capture catch-up evidence at the approved watermark;
- production writer-switch and recovery approval;
- end-to-end lifecycle, concurrency, audit, expiry/revocation, hierarchy-cycle, and database-trigger tests.

These items must be completed behind the approved writer-switch process. Until then, control-admin routes remain disabled by default and authorization-v2 is not a production mutation authority.

## Qualification

- `@athyper/server-contract-auth` typecheck: passed.
- `@athyper/server-platform-control-admin` typecheck: passed.
- `@athyper/server-platform-control-admin` tests: 24 passed.
- `@athyper/server-platform-control-admin` build: passed.
- `@athyper/server-platform-host` typecheck: passed.
