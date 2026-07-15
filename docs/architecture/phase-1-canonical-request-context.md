# Phase 1 canonical request and command context

Status: first production slice implemented 2026-07-14

## Canonical contract

The command-side context is exported by `@athyper/svc-iam`:

```ts
interface VerifiedRequestContext {
  readonly planeKey: PlaneKey;
  readonly realmKey: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly permissions: EffectivePermissionContext;
  readonly requestId: string;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
}
```

It is composed only at the authenticated records boundary from two independently verified snapshots:

1. the shared identity resolver, which verifies bearer claims, realm, tenant and principal binding;
2. the IAM permission-context resolver for the selected product plane.

Composition fails with `AUTH_CONTEXT_MISMATCH` when tenant, principal or plane differ. A pre-existing permission snapshot is reused only when all three values match. Missing permission state is built once through the same resolver registry used by the global permission middleware.

The resulting object is frozen and stored in `res.locals.verifiedRequestContext`. Mutation adapters obtain it with `requireVerifiedRequestContext(res)`. That accessor throws `VerifiedRequestContextRequiredError` instead of falling back to headers or anonymous identity when the boundary middleware was skipped.

## Request identifiers

- `requestId` comes from the runtime-stamped `x-request-id`; a UUID is generated only when the host did not stamp one.
- `idempotencyKey` comes from `Idempotency-Key`.
- `correlationId` prefers `x-correlation-id` and otherwise uses the verified identity resolver's trace/request correlation hint.

These values are command metadata. They are not used to establish tenant, principal, realm, or plane authority.

## Migrated records handlers

The following handlers no longer verify bearer tokens or parse organization, realm, tenant, or principal identity independently:

- generic POST;
- generic PUT;
- generic PATCH;
- generic DELETE;
- document workspace mutation actor resolution;
- acquire/read/renew/release/force-release edit lock;
- entity operation dispatcher.

Their authorization and persistence behavior is otherwise unchanged. In particular, Phase 1 does not address strict write validation, transactional outbox delivery, deletion strategy, or the mutation kernel.

## Compatibility note

`@athyper/svc-shared` currently exports an older identity-only type with the same historical `VerifiedRequestContext` name. It remains in place for attachments and compatibility routes. New command-side code must import `VerifiedRequestContext` from `@athyper/svc-iam`; later migration work should rename the shared legacy type after all attachment consumers move to the canonical context.

## Migration ratchet

`identity-parsing-budget.test.ts` prevents new identity parsing below `records/routes/index.ts`. Current remaining legacy call-site ceilings are:

| Pattern | Ceiling |
|---|---:|
| `verifyBearer()` | 61 |
| direct `X-Org` reads | 30 |
| `resolveTenantId()` | 59 |
| principal resolver calls | 34 |

Each subsequent slice must lower the relevant ceiling. It must never be raised to accommodate a new route.

## Remaining Phase 1 work

- Migrate specialized record subresources, line/distribution handlers, bulk/import routes, lifecycle/action routes, supplier intake and business-partner intake.
- Pass `VerifiedRequestContext` into new mutation-kernel command methods once the kernel is introduced.
- Replace redundant permission database checks with decisions from `context.permissions` where operation semantics permit it.
- Propagate the canonical context into background commands using an explicit trusted job-context constructor; HTTP headers must not be synthesized in workers.
- Retire the identity-only shared context name after attachment consumers migrate.

## Tests

- canonical context composition and storage;
- fail-closed required accessor;
- cross-tenant and cross-principal mismatch rejection;
- cross-plane mismatch rejection;
- one-time effective permission resolution and reuse;
- records boundary ordering;
- migrated-handler source contracts;
- identity-parsing budget ratchet.

