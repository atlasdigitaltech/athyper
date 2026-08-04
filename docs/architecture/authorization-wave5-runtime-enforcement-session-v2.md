# Wave 5 — canonical runtime, enforcement, and session v2

Status: foundation implemented; production publication remains deliberately
blocked in `shadow` until every consumer ledger row is verified.

## Runtime boundary

`ProductionAuthorizationDecisionService` is the one production evaluator
entry point. Single evaluation is a one-item batch call, and collection
materialization calls that same decision path. Every completed decision must
append durable proof-oriented evidence; an audit failure fails the request
closed.

The Neon/Admin runtime reads only `control` and `master`. The Mesh factory
accepts only a mandatory Mesh-local database client and has no Neon parameter
or fallback. Both factories require an expected database name, an exact
evaluator revision, an active plane contract, and an active Wave 5 release.

## Enforcement boundary

`CanonicalConsumerAuthorization` accepts exact permission IDs or exact entity
operation IDs. It is the shared boundary for list, detail, count, export,
batch, session, workflow, document/resource, Admin, Mesh, and AI consumers.
It contains no suffix, token, alias, Persona, or generic-verb inference.

Collection access returns organizational clauses, deny subtraction, and
record ACL rows separately. Record ACL authority is evaluated only for the
exact entity and record. ACL-only access is not advertised as a global UI
capability. Delegation is usable only when the evaluator proves an active
ordinary group-role source and delegated scopes are subsets of the
delegator's ordinary scopes.

## Session v2

Session v2 resolves the external identity in the selected plane's local
identity binding and active plane membership. It batches the published exact
catalog entries through the production decision service. The session is
rejected if any evaluator permission/code/catalog version differs from the
catalog snapshot. Its authorization fingerprint covers the plane, boundary,
principal, catalog, policy versions, and every decision fingerprint. TTL is
capped by the earliest authority change.

Context v2 is built only from a non-expired session and the server's expected
catalog version. It carries the local principal/binding, assurance, selected
navigation dimensions, and session fingerprint. Empty scope dimensions and
catalog drift are rejected; selected dimensions never become grants.

## Evidence and invalidation

The SQL audit sink writes the evaluator contract/revision, exact permission
and operation, decision reason, matched proof IDs, entitlement evidence,
catalog/policy hashes, authority epochs, resource-key hash, and authorization
fingerprint.

The invalidation worker leases the plane-local durable outbox, applies
monotonic global/boundary/plane epochs to the cache, and completes the row
only after invalidation succeeds. Failures enter the existing retry and
dead-letter state machine.

## Publication and remaining consumer work

`authorization_runtime_release_v2` starts in `shadow` with a sentinel catalog
hash, so production repositories fail closed. It may become `active` only
after the compiled catalog hash/revision are recorded and every applicable
`authorization_consumer_migration_v2` row is `verified`.

The runtime foundation and cross-path tests are present. Existing metadata,
records, workflow, document, Admin, Mesh, and AI handlers still require
route-by-route injection of `CanonicalConsumerAuthorization`; until that work
and its negative tests are complete, Wave 5 is not approved for cutover.
