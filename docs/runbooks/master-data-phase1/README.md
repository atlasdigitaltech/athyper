# Phase 1 — prerequisites work package

Status: local prerequisite inventory implemented; Phase 1 acceptance remains blocked. The user has accepted a synthetic Neon staging pilot for business-partner owners and email verification. Actual tenant IDs, provider, and accountable owners remain pending. No production grants or database migration is inferred from that pilot decision. The generated report records the current source commit and fingerprints of relevant working-tree inputs; the workspace is dirty, so this is not a frozen release commit.

## Delivered artifacts

- `launch-scope.json`: structured decision record with the accepted pilot scope and explicit remaining tenant/provider/owner inputs.
- `pilot-authorization-design.md`: proposed route-to-authority mapping, fixture/actor layout, trusted scope resolver design, and real-IAM acceptance cases; no permissions are published by this design.
- `assessment.json`: generated six-route permission/resource matrix, three-plane catalog inventory, Neon table-review status, deployment finding, source fingerprints, and explicit blockers.
- `database-compatibility.sql`: read-only, data-free PostgreSQL inventory for each selected target database. Reports application-role privileges, RLS, column types, constraints, indexes, trigger definitions, and relevant function execution privileges.
- `tooling/scripts/verification/master-data-prerequisites.mjs`: repeatable inventory generator with a strict failing check mode.
- `tooling/scripts/verification/master-data-prerequisites.test.mjs`: tests that candidate permissions or filled-in launch decisions cannot falsely qualify released authority or a live database.

The assessment is intentionally not a release-certification engine: it cannot accept manually asserted grants or database receipts and turn them into a green release. `--check` stays nonzero until a subsequent qualification implementation has independently verifiable evidence. Normal inventory generation exits zero when it successfully writes a report; this does not mean readiness passed.

## Run the local checks

From the repository root:

```sh
node tooling/scripts/verification/master-data-prerequisites.mjs --output docs/runbooks/master-data-phase1/assessment.json
node --test tooling/scripts/verification/master-data-prerequisites.test.mjs
node tooling/scripts/verification/master-data-prerequisites.mjs --check
```

The third command is expected to exit 1 for the present baseline. Review `blockers` rather than suppressing the exit code.

## Confirmed source findings

1. The service requests six legacy permission strings; none has an exact match in the checked-in Studio, Neon, or Mesh canonical catalogs at assessment time.
2. Related Neon `address_contact.*.manage` entries are only proposed, broad capabilities. They do not establish the required aggregate operations, sensitive overlays, or production grants and must not be used as compatibility aliases.
3. `master.address`, `master.address_link`, and `master.contact_link` remain `pending_review` in the generated Neon authorization inventory. Review ownership, aggregate classification, and sensitive-data treatment before promotion. Regenerate the inventory afterward so repository references include the newly added PostgreSQL adapter.
4. Current service resources contain owner IDs or contact/address-link IDs. IAM scope comparison expects reviewed coordinates such as `legalEntityId`, `companyCodeId`, `operatingOrganizationId`, `resourceId`, or `resourceCode` plus `recordId`. An owner ID alone does not establish organization containment. This is a missing authorization integration, not evidence of an observed production exploit.
5. The checked Compose parity file does not inject the verifier trust-bundle variable. Selected deployment overrides must be evaluated separately; do not infer the effective deployed configuration from one file.
6. Local DDL and repository tests are available, but no selected staging database or released authority has been inspected as part of this assessment. Migration requirements remain undetermined until target receipts exist.

## Route-to-authority design decisions

The generated route matrix records the exact current permission strings and resource fields. Canonical mappings deliberately remain null; assigning arbitrary canonical names or publishing grants would invent business authority.

| Route family | Intended authority to review | Trusted coordinates required |
| --- | --- | --- |
| Owner profile | Root aggregate read plus contact/address sensitive-read capabilities | Owner identity plus reviewed organization/legal entity/company/resource scope |
| Contact creation | Root aggregate contact-collection mutation plus sensitive-write capability | Tenant-accessible owner resolved through registry and metadata |
| Address attachment | Root aggregate address-collection mutation plus sensitive-write capability | Same owner scope; address remains tenant-owned canonical data |
| Contact deactivation | Owning aggregate contact closure plus sensitive-write capability | Resolve contact to owner and scope in the request tenant |
| Address deactivation | Owning aggregate address closure plus sensitive-write capability | Resolve address link to owner and scope in the request tenant |
| Verification | Exact sensitive verification capability plus whatever owner authority the reviewed model requires | Stored contact target, tenant/plane, and trusted owner scope; separately scoped attestation principal |

For each launch owner type, document its storage registry code, published entity code, aggregate root, scope resolver, sensitivity overlays, and whether tenant-wide access is explicitly allowed. Principal-owned contacts, business partners, legal entities, and company codes must not automatically share an identical scope policy.

## Implementation work required to clear Phase 1

1. **Domain/integration owner:** complete the launch record. Select actual owner types as well as channels. Record provider capability and whether it can sign protocol v1 or needs an attestation bridge. No vendor selection is made here.
2. **IAM/domain owner:** review table classifications and exact root operations/sensitive capabilities using the existing authorization inventory compiler. Produce candidate mappings with required scope kinds, risk/MFA/SoD requirements, and service ownership. Publish through the normal release mechanism only after review and qualification; do not edit generated output alone.
3. **Backend/IAM owner:** implement trusted owner-to-scope resolution. For ID-only mutations, look up minimal tenant-scoped identity metadata, resolve the owning aggregate, and authorize with complete trusted coordinates before mutation or PII response. Prevent an owner/scope change between authorization and mutation through the appropriate transaction/locking design. Never trust scope IDs supplied in a request body or widen unresolved ownership to tenant authority.
4. **QA/IAM owner:** add real-authorizer acceptance for allowed in-scope owner access, denied same-tenant different-owner access, missing scope coordinates, explicit denies, foreign-tenant IDs, and matching versus mismatched published operation bindings. Existing mocks or token-only permission lists are insufficient.
5. **Database owner:** collect compatibility evidence from each explicitly selected database and compare it with the current candidate DDL. Classify differences as compatible, missing additive object/grant, data cleanup required, or incompatible semantic change. Draft ordered forward migrations and qualification tests from those actual differences; no migration is created merely because the local repository is new.
6. **Release owner:** select an immutable candidate artifact after the above work, regenerate fingerprints, retain qualified authority/schema evidence, and confirm the Phase 1 gate. No source commit was made or production authority changed by this work package.

## Database inventory procedure

Use the application's database role and normal target database/pooler path. Supply connection settings through the approved connection mechanism; do not put credentials in a command pasted into release evidence. For example, configure a local `PGSERVICE` entry outside this repository, then run:

```sh
psql -X -q -v ON_ERROR_STOP=1 -At -f docs/runbooks/master-data-phase1/database-compatibility.sql > master-data-database-inventory.json
```

Repeat separately for each approved physical plane database. Retain the output with environment, expected database identity, source fingerprint, and collection timestamp. A superuser or BYPASSRLS role cannot qualify application-role isolation. Unexpected write privileges on authority tables also require review; the report records privileges, not an assertion that all tables should be writable.

The script reads only PostgreSQL catalogs, never owner/contact rows or trust-bundle values. It inventories an important subset of column expectations plus actual constraints/indexes/triggers, not every deployed schema invariant. Inspect absent audit/shared helper functions explicitly: an empty function list is not a passing check. Successful inventory collection does not prove cross-tenant behavior, physical-plane routing, audit/outbox atomicity, or matching table data; those require the staging acceptance suite.

## Acceptance state

| Gate | Current state |
| --- | --- |
| Six-route source inventory and repeatable assessment | Implemented |
| Local database inventory query | Implemented; smoke-tested in isolated PostgreSQL |
| Launch environment, plane, channels, owner type | Confirmed: synthetic staging, Neon, email, business_partner |
| Tenant IDs, provider, accountable owners | Pending decision |
| Reviewed canonical mappings and released scope bindings | Blocked |
| Trusted owner-scope resolver and real-IAM qualification | Blocked |
| Selected database compatibility receipts and migration classification | Pending environment selection |
| Frozen release baseline | Pending candidate selection; current workspace is dirty |
| Phase 1 complete / production qualified | No / No |
