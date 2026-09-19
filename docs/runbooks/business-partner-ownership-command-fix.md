# Business Partner ownership/subtype command fix

Manual intake previously defaulted omitted ownership to `internal` without
recording a supplier subtype. SQL then defaulted the subtype to `general`, which
the commercial-role invariant correctly rejects. Validation admitted that snapshot.

Intake now records an explicit subtype in new-partner/add-role drafts: internal
supplier/customer roles default to `intercompany`; external roles default to
`general`/`corporate`. Explicit user values are preserved for validation. Existing
target ownership remains authoritative for add-role requests. Database defaults
and triggers are unchanged; the materializer consumes the explicit approved value.

Validation ruleset version 3 rejects incompatible ownership/subtype combinations,
including omitted subtype in legacy internal drafts (matching SQL fallback).
Submission rechecks current validation before opening a workflow, so a previously
passed validation cannot bypass the new invariant. Approved snapshots are not
rewritten or automatically reapplied.

The focused DEV API image is `athyper-runtime-server:bp-ownership-defaults-20260910`.
Only intake, validator and submission guard JavaScript were overlaid on the actual
running image; unrelated local authorization changes were excluded. Image import
checks and API health pass. Deployment artifacts, original files, baseline image
and rollout/rollback Compose overlays are retained at:

```
/home/chandravel_natarajan/.athyper/instances/dev/receipts/bp-ownership-defaults-20260910
```

Rollback would remove this new validation guard and requires explicit assessment;
it is not an automatic response to a business-data conflict. No SQL migration,
grant change or authorization-mode change was deployed.

Case-service tests: 47 pass, including four supplier/customer incompatibility
cases and a legacy passed-validation submission regression. A broad package test
run also exposed an unrelated historical-presentation test failure in
`business-partner-record-header.ts` (missing `summary.scope`); this fix does not
claim that the whole package suite passes.

Authenticated qualification uses a separate report and new isolated records:

```sh
QUALIFICATION_OWNERSHIP_REGRESSION=1 pnpm exec tsx \
  tooling/scripts/verification/qualify-business-partner-commands.mts \
  tests/e2e/.auth/catl.admin-qualification.json \
  tests/e2e/.auth/catl.owner-qualification.json \
  a478f9c0-8226-5d22-9599-b8fb27a45180 \
  governance/policy/reports/business-partner-ownership-command-qualification.dev.json
```

Status: requester `catl.admin` completed fresh MFA. The `catl.owner` approval
session is being refreshed; no new qualification case has been created yet. The old approved case `2a03927d-7076-4e02-8b1b-181830b49ec5` remains reserved for
preservation verification. Successful authenticated application remains required
before claiming this command milestone complete. Existing policy/publication and
activation gates remain separate.

The master-data package typecheck passes. A read-only comparison after deployment
confirms the original approved case row and its snapshot references are unchanged,
as are all 13 authorization-table fingerprints.


## Completed authenticated qualification

[Final evidence](../../governance/policy/reports/business-partner-ownership-qualified.dev.json)
records successful fresh-MFA admin/owner qualification. New case
`f8ec949e-bed6-44d5-a104-f70d6241896d` passed validation, both approval stages and
application (HTTP 201). Database verification finds an internal/intercompany
supplier, one address, one contact and one channel, with decision/result snapshots.
The incompatible-ownership draft was rejected before submission. All 13 grant
fingerprints and the original approved case row/snapshot references are unchanged.

The first new coherent ownership case exposed missing relationship proposals.
Validation now rejects this omission before submission (ruleset 3); the database
trigger was not weakened. A later test used unregistered address/contact purpose
codes; those inputs were corrected to the currently allowed `default` purpose in
a new request. Earlier approved test snapshots remain untouched. Current validation
does not yet consult the dynamic owner-purpose catalog; that broader gap remains
explicitly outside this ownership milestone.

Final DEV image: `athyper-runtime-server:bp-ownership-relationships-20260910`.
Its focused validator overlay and rollback reference are beside the first release
in `receipts/bp-ownership-relationships-20260910`. Package typechecking passes.
No grants, SQL triggers, publication heads or enforcement modes changed. The
previous session-pending notes above are historical; the ownership command milestone
is complete, while platform-wide backend qualification and activation remain gated.
