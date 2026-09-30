# Authoritative Versions and automatic capture

Status: root, owned aggregate/domain, and delete recording adapters implemented and verified, 2026-09-28. DEV schema/catalog installed and Country successor draft prepared. Country release 9 is now published and active on Studio, Neon and Mesh after independent MFA approval. No writable entity is enrolled; application manual acceptance remains pending.

## Provider and metadata

`platform.records.history.v1` owns history for tenant-scoped root records written through the generic Records mutation service. It requires optimistic concurrency and supports create, patch, lifecycle transition and deletion. Explicit registered adapters extend the same transaction to aggregate/domain changes. History is persisted in the new immutable `snapshot.record_version` ledger; a row/version counter, an audit event or a manual snapshot does not constitute history.

The reusable, locked profile `platform.activity.recorded-root`, version 1, enables Audit log, Versions and Saved snapshots. It declares:

```json
{
  "recording": {
    "providerKey": "platform.records.history.v1",
    "projection": "stored_root",
    "operations": ["create", "patch"]
  },
  "snapshots": {
    "manualCapture": true,
    "automaticCapture": "committed",
    "captureOperations": ["create", "patch"],
    "retentionClass": "standard"
  }
}
```

`stored_root` derives coverage from stored fields in the admitted Meta Entity descriptor, excluding the concurrency counter and computed fields. It includes fields the writer may not be allowed to read; recording is an independently reviewed server policy. A profile may instead declare an explicit `recording.fields` projection. It must include every writable root field and the lifecycle status field. The two projection forms are mutually exclusive. Neither accepts browser-selected columns or relations.

The profile supports reviewed overrides for views, default view, manual capture, retention, query limits and the supported operation subsets. Entities inherit the generic defaults when no override is supplied. Recording ownership must cover all of the entity's supported generic write operations. An entity with lifecycle transitions must include `transition` in `recording.operations`; include it in `snapshots.captureOperations` to capture each committed transition.

A reviewed profile can select `automaticCapture: "milestone"` and exact `transition.<code>` capture operations. Qualification requires the named lifecycle transitions to exist. The generic committed profile cannot be overridden into arbitrary milestone rules, provider identities or SQL projections.

Country keeps `platform.activity.standard`, version 1. Its reference descriptor has neither a tenant-owned row nor an owning versioned mutation path, so this provider rejects it. Its Versions view and automatic capture remain disabled; manual tenant-local snapshots continue to work.

## Transaction and history semantics

1. The mutation service admits the business operation and begins its existing idempotent command transaction. Replays return the prior result before invoking recording.
2. The host resolves the immutable Activity policy and verifies that its release, contract and compiled descriptor match the descriptor admitted for the mutation. A publication change cannot silently switch capture policies mid-command.
3. For an existing record, the provider locks and reads the declared root projection in that same transaction, before the mutation. Create reads its resulting row after insertion.
4. A successful changed record produces an immutable version header and its declared root state. The header records the owning source version, operation, actor, time, release and changed logical field keys. Required automatic capture uses `snapshot.fn_capture_entity` within the same transaction and is linked to the ledger entry.
5. Record changes, history, snapshots, audit/outbox writes and the command receipt commit together. Capture or ledger failure propagates and rolls back the transaction. The hook never starts another mutation, so snapshot capture cannot recursively generate history.

Unchanged patches do not add history or snapshots, including when database triggers refresh technical timestamps. Existing concurrency behavior may still advance the row counter; gaps therefore do not imply missing historical state. Failed validation, denied operations, missing records, version conflicts and command replays do not append history. The PostgreSQL adapter now safely recognizes bigint concurrency values returned as strings when reporting conflicts and mutation versions.

Recording starts at enrollment. There is no fabricated baseline or backfill. `stored_root` is root-record coverage, not an aggregate backup. Version ledger payloads are immutable; snapshot retention classes apply to the saved snapshots, not an implicit version-ledger purge policy.

## Read authorization and UI

`GET /api/entity-runtime/:entityCode/records/:recordId/activity/versions` uses `common.audit.event.query` (`audit.event.query`). It returns only authoritative headers, with current-readable changed-field names. Current parent admission, tenant/plane identity, exact storage identity, immutable policy and signed pagination constraints apply. No ledger payload, internal hash or linked snapshot identity is exposed by this endpoint. Historical version-value inspection is not added in this deliverable.

The reusable Activity workspace shows Versions only when admitted. It uses the existing localized side/full layout and preserves selection of the view across resizing and navigation. Unsupported records, including Country, keep the view hidden.

Automatic snapshots use payload schema 3 with `coverage.kind: "declared_fields"`. Manual snapshots remain schema 2 with `authorized_fields`. Both contain the same normalized record envelope and can be compared when the record contract matches. Reads/comparisons intersect current field access; the editor's manual-capture or history-read permission is not a prerequisite for required automatic recording. Legacy schema-1 coverage remains unknown and is not compared across envelope formats.

Permissions and aliases remain unchanged. No profile creates a role grant.

## Qualification and boundaries

Publication requires the actual transactional hook, source ownership/projection qualification, Versions read handler when enabled, ledger persistence/RLS/INSERT privilege, the enabled immutability trigger, and snapshot capture-function privilege when automatic capture is configured. The host also revalidates descriptor ownership at mutation time. Profile presence alone is not qualification.

The provider rejects missing tenant/version columns and unregistered aggregate/domain writers. Aggregate and registered domain actions require a signed `recording.adapterKey` matching an installed `ActivityAdapterRegistration`; publication checks the owning graph qualifier and actual aggregate executor/domain handler registrations. No fallback reads arbitrary tables or substitutes the root for a changed child. Direct database or external domain writes outside the enrolled owning service are not covered. A writable product still needs its normal governed publication and live acceptance; the reference-product publication flow does not become a writer-enrollment shortcut.

Canonical DDL is `server/db/ddl/common/snapshot/12_record_history.sql`, with additive migration `20260928_record_history.sql` registered for Studio, Neon and Mesh. DEV installation is recorded in `docs/reports/activity-dev-install-20260928.json`. Country publication remains gated; see the rollout report linked below.

## Verification

- Isolated PostgreSQL executes the actual generic mutation service, Kysely repository, command store, ledger DDL and snapshot functions. It verifies create, changed/no-op patches, bigint version conflicts, concurrent replay, committed/milestone capture, exact post-state, rollback of record/history/snapshot/audit/outbox/receipt, tenant/plane isolation, forged insert rejection and immutability.
- Publication contracts: 213 passed. Publication service: 381 passed before three additional recording-profile cases; all 16 focused Activity compilation cases pass. Runtime metadata: 95 passed before an additional recording-policy case; all eight focused Activity reader cases pass, including cold/cached projection tampering.
- Records suite: 313 passed; four opt-in database cases skipped in its ordinary run. The extended Activity PostgreSQL case passes with its explicit local image enabled.
- Experience suite: 167 passed. Focused host Activity provider, recording and publication qualification tests: 22 passed.
- Eight Activity browser scenarios pass, including authorized Versions, side/full state preservation, Country-style absence, keyboard navigation and compact Arabic/RTL.
- Records source/test, experience source and form-detail typechecks pass. Host source typecheck reports only the existing attachment fixture missing `failInspection` in `qualify-document-malware.ts`. No live acceptance is claimed.

The repository-wide strict style-token audit remains blocked by existing findings in record, collaboration, foundation UI and shell stylesheets. This provider change adds no CSS; the Activity styles use theme tokens. The new migration inventory digest and all profile source-lock digests are verified; the five offline Country preparation checks pass.

## Owned adapters and deletion — 2026-09-28

- `platform.activity.recorded-root` v1 is unchanged. Version 2 additionally permits reviewed `delete` ownership and automatic-capture overrides.
- The global `platform.activity.recorded-owned` v1 profile adds the installed key `platform.records.owned.v1`. Its default operations are create, patch and aggregate; overrides can select transition, domain and delete when the owning descriptor supports them. The host does not install a writer merely because this profile is selected. Country continues to inherit `platform.activity.standard` v1 without overrides.
- `createOwnedRecordHistoryAdapter` reads declared child projections from a trusted resolver for the root's pinned dependency graph. It checks entity/plane/tenant and parent linkage, requires child identity and all writable fields, excludes soft-deleted children, orders by identity, and rejects oversized collections (default 1,000 rows) rather than silently truncating. All participating child writers must acquire the root lock first.
- The hook captures owned state before and after mutation in the same transaction. Child-only changes produce versions and automatic snapshots even when every root business field is unchanged. Aggregate command fingerprints include changes, plan hash, request hash and transition payload. Stale root versions are rejected before the owning executor runs.
- `createTransactionalRecordActionService` resolves descriptor-registered actions and permissions, requires optimistic version/idempotency inputs, dispatches only an installed transaction-aware handler, validates its returned entity/record/action, and appends audit/outbox effects. Declined domain mutations roll back their writes. Domain action codes participate in fingerprints and are retained in the ledger operation-detail column (`transition_code`). Legacy nontransactional action handlers are not implicitly enrolled.
- Host composition exposes `activityAdapters` and wires registered aggregate executors and domain handlers through the history hook. Each deployment must supply its real owning handlers and graph qualifier. No arbitrary business logic, Business Partner enrollment, or Country write path is fabricated by these adapters.
- Delete records an immutable tombstone with the pre-delete root/owned data. Soft deletion uses the committed counter; hard deletion allocates the next counter as the tombstone version. The automatic snapshot envelope has `state: "deleted"`. Failure of required capture restores the row, children, history, effects and receipt through transaction rollback.

Current Activity snapshot comparison still exposes authorized root fields only. Captured owned collections are retained server-side; collection comparison/restore is not added here. Deleted records remain subject to current parent admission and therefore are not exposed through a bypass or a deleted-record browser. A future deleted-record viewer needs an explicit retained-parent authorization contract.

The isolated PostgreSQL suite now also executes the reusable owned-state reader, child-only aggregate mutations, domain handlers, stale versions, changed-input replay rejection, hard/soft delete tombstones, and required-capture rollback for aggregate/domain/delete. These are actual disposable SQL writes, not live Country changes.

See [DEV rollout and manual test plan](../../reports/entity-activity-rollout-20260928.md).
