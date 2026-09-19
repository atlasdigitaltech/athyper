# Atlas API authoring and authorization management

The API needs its own publication signer for native Meta Entity authoring. A
signer configured only in the worker does not register the Studio authoring
routes. Authorization management also needs a service composed during normal
API startup, independently of custom test dependencies.

## Configuration

Use `deploy/compose/instance/compose.publication-authoring.yaml` after the
publication overlay. For local DEV TLS, also use
`compose.publication-local-trust.yaml`. The development publication launcher
includes these for `--phase=api` and validates them for `--phase=check`.
Deploy with the intended current API image; do not roll back newer service
changes by reusing an old publication image tag.

- `PUBLICATION_API_ENABLED=true` and `PUBLICATION_AUTHORING_ENABLED=true` enable
  native API authoring. Missing signing coordinates fail startup explicitly.
- Supply `PUBLICATION_SIGNING_KEY_ID`, `PUBLICATION_PRIVATE_KEY_REFERENCE`, and
  `PUBLICATION_PUBLIC_KEY_REFERENCE`, plus the instance's Infisical connection,
  secure token-file mount, object storage, Studio database and jobs runtime.
  Key bytes stay in the secret store. API authoring does not require enabling
  compile or dispatch workers in the API process.
- `AUTHORIZATION_MANAGEMENT_ROUTES_ENABLED=true` composes the exact-plane
  management service during normal API startup.
- Keep `AUTHORIZATION_MANAGEMENT_MUTATIONS_ENABLED=false` until the existing
  writer qualification and rollout requirements are satisfied. Status remains
  available to principals with `authorization.management.read`.

## Writer evidence

`AUTHORIZATION_MANAGEMENT_POLICY_PATH` accepts an operator-mounted JSON file:

```json
{"schemaVersion": 1, "planes": []}
```

This empty example authorizes no writer. Approved entries must contain `policy`
and `writerSwitch` objects conforming to the existing
`AuthorizationManagementRolloutPolicy` and `AuthorizationWriterSwitchState`
contracts. Each entry applies to exactly one of `studio`, `neon`, or `mesh`.
The existing selector enforces approval, effective dates and principal cohort;
the writer gate enforces matching watermarks, corpus hash, evaluator and DDL
qualification, at least one identified approver and an approval ticket. Host qualification
flags and mutation enablement remain additional requirements.

The loader validates the file at startup and reloads it for decisions. Removal,
corruption or a missing plane yields no approved rollout or writer. It never
constructs a legacy writer or invents approval evidence. Follow
[the authorization writer runbook](authorization-production-writers-2026-09-07.md)
for genuine qualification and approval before enabling mutations.

## Verification and DEV outcome

The 2026-09-10 DEV deployment preserves the running BP service changes with a
four-module API overlay. It enables authoring and management routes, with
authorization mutations disabled. Rollback and resolved compose files are
retained privately under
`~/.athyper/instances/dev/deployments/atlas-api-enablement-20260910`.

Verify API readiness, secret-store TLS and a real sign/verify round trip. Native
unauthenticated requests to `/api/meta-entity-authoring/change-sets` and
`/api/control-admin/authorization` must reach authentication (401), rather than
returning `ROUTE_NOT_FOUND`. Then verify status and intended authoring actions
through a current authenticated Studio session. A 401 alone does not establish
the user's publication or permission-management rights.

This fixes service configuration; it does not publish permissions, approve a
release, upload the synthetic document, or enable retrieval. Those steps still
require the actual user session and approved authority. Keep the attachment's
version coordinate as `attachment.id + ":" + attachment.sha256` when ingestion
is eventually admitted.


## Qualified DEV writer (2026-09-10)

The [qualification receipt](../examples/atlas-f5/cirrus-writer-qualification.json)
records 104 evaluator, management, PostgreSQL writer and epoch checks, plus 13
host checks. Database tests used disposable copies of the deployed schemas and
reference contracts. Five deployed writer modules matched the tested source.
Live Studio and Neon writer probes rolled back all effects.

`AUTHORIZATION_WRITER_CONNECTIONS_PATH` loads a private mounted JSON file with
`schemaVersion: 1` and `connections` keyed by exact plane. Each value is a
PostgreSQL URL for that plane's `athyper_<plane>` database. Keep the file outside
the repository with mode 0600. The dedicated login requires CONNECT only to its
intended databases and the existing application and authorization-writer roles.
It must not have superuser or RLS-bypass privileges. The adapter checks database
plane and role membership on startup. Ordinary API connections are unchanged.

Normal startup now requires dedicated connections before enabling management
mutations. Injected qualification/test dependencies retain their existing seam.
Policy approval still does not grant application permissions. The DEV policy is
limited to `catl.admin` in Studio and Neon and expires at the timestamp retained
in the receipt. Approval provenance is the user's explicit instruction in this
task, not an asserted authenticated reviewer decision. Meta Entity review still
requires an actor different from the author/submitter.

The DEV deployment and rollback are retained privately at
`~/.athyper/instances/dev/deployments/atlas-writer-20260910`. The
[catalogue publication receipt](../examples/atlas-f5/cirrus-permission-publication.applied.json)
records nine Studio and two Neon definitions; assignment tables were unchanged.
