# Phase 3 — EntityMutationService pilot

## Service boundary

`EntityMutationService` is exported by `@athyper/svc-records` and has no
Express dependency. Its create, patch, delete, transition, and aggregate
commands require a `VerifiedRequestContext`, mutation origin, validation mode,
entity identity, concurrency inputs, and idempotency identity.

The typed result union contains `NotFound`, `CapabilityUnavailable`,
`IncompatibleAction`, `Forbidden`, `VersionRequired`, `VersionConflict`,
`FieldsNotWritable`, `ValidationFailed`, `LockRequired`, `InvalidTransition`,
`IdempotencyConflict`, and `Committed`. The HTTP adapter is the only component
that assigns status codes and response payloads.

## Kernel pipeline

For generic create and patch operations the service:

1. resolves the effective `snapshot.entity_compiled.capability_manifest`;
2. rejects disabled or surface-incompatible bindings;
3. authorizes against the immutable effective-permission set in the verified
   context;
4. validates and maps every supplied logical field from the compiled write
   projection;
5. opens one transaction and establishes the database actor;
6. claims idempotency and locks the current row;
7. rechecks row version and any enforced edit lease inside the transaction;
8. writes the record, audit entry, and outbox event;
9. completes idempotency before commit; and
10. performs optional reference-label enrichment after commit.

Delete uses the same transaction and permits only compiled `hard_delete`
entities. Transition and aggregate commands resolve named registered handlers;
they fail closed when no handler is registered.

## Classic pilot

Classic POST and PATCH for `company_code` and `cost_center` use the service on
both canonical and legacy route aliases. All other entities retain the legacy
handlers. Set `ENTITY_MUTATION_SERVICE_PILOTS` to a comma-separated list to
change the cohort; setting it to an empty string disables the pilot.

The classic adapter uses `classic_compatibility` validation so legacy behavior
continues to drop unknown/read-only inputs while preserving status-lock errors.
Strict import/job callers receive explicit `FieldsNotWritable` results.

## Worker usage

Imports and jobs instantiate or receive `EntityMutationService` and call it
with a verified service context directly. They do not construct an Express
request or synthesize headers. The package declaration build exports all
commands, results, service interfaces, the default implementation, and the
HTTP mapper.

## Next extraction cohort

The pilot intentionally leaves document-specific defaults, lifecycle command
registrations, and owned workspace child handlers on their existing paths.
Those handlers plug into the transition/aggregate registries as their routes
move in later cohorts.
