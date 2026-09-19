# R5 Customer qualification

R5 has six evidence gates. `pnpm qualify:business-partner-r5` validates the
manifest and reports pending gates. Release automation must use
`pnpm qualify:business-partner-r5 --require-qualified`; it exits 2 while any gate
is pending and 1 for invalid evidence. A successful inspection with pending gates
is not qualification.

## Prepare the target

Deploy the Customer reactivation readiness correction and the Customer AR-profile
trigger correction from the current source. Use a resettable local NEON target
with an active sales organization, company assignment, AR payment term and
Customer risk model. The local fixture command does not provision identities,
grant permissions, or publish the onboarding definition/workflow.

Inspect deterministic fixture IDs with:

```sh
pnpm --dir server/db db:provision:neon:business-partner-r5-fixtures --plan
```

Supply `ATHYPER_NEON_DATABASE_ADMIN_URL` through the local secret environment;
only loopback PostgreSQL `athyper_neon` URLs are accepted. Provision with explicit
existing context codes:

```sh
pnpm --dir server/db db:provision:neon:business-partner-r5-fixtures \
  --confirm=LOCAL-NEON-BP-R5-FIXTURES \
  --tenant=athyper --actor=athyper.admin \
  --organization=acceptance.bp.r2 --company=<company-code>
```

The output contains four nonsecret environment coordinates: sales organization,
Customer BP, Customer and company. The seeded Customer is a synthetic prospect
with an empty credit scope, active AR profile and synthetic risk evidence. It is
not evidence of onboarding or a real commercial risk decision. Provisioning
refuses an existing fixture and never deletes immutable evidence to reset it.

Configure three distinct target actor credentials using the
`PLAYWRIGHT_BP_V1_REQUESTER_*`, `APPROVER_*` and `MATERIALIZER_*` variables.
The maker needs Customer case/create/control/read access; the checker needs the
assigned approval task, credit/designation decisions and all five lifecycle
permissions; the materializer needs case/read/materialize access. All three must
resolve to distinct principals in the same tenant. Select the fixture company in
the checker work context. Use `PLAYWRIGHT_NEON_BASE_URL` for the deployed target.
Do not place credentials or browser storage state in retained evidence.

```sh
pnpm preflight:e2e:bp-r5
pnpm test:e2e:bp-r5
```

The first test independently creates, submits, approves and materializes a new
Customer and retains snapshot/lineage coordinates. It no longer accepts
`PLAYWRIGHT_BP_R5_MATERIALIZED_CASE_ID`. The second consumes the disposable
control fixture, exercises credit/designation/readiness and all five lifecycle
buttons, tests suspension replay and stale/conflicting/invalid commands, and ends
at archive. Rebuild the disposable fixture boundary before another control run.
R2's `BP-CUS-002/003` receipts remain required for existing and dual-role identity.

## Retain and qualify evidence

Place sanitized receipts and their artifacts under
`governance/evidence/business-partner/r5-target/`. Set a manifest gate to `passed`
only after retaining its actual receipt. The verifier hashes the artifact bytes,
rejects path/symlink escapes, and requires every receipt to identify the same
production target, deployed Git revision and build digest. Development runs
remain local engineering evidence.

Every receipt uses schema `athyper.business-partner-r5-target-receipt/1` with
`gate`, `result: passed`, `environment: production`, `sanitized: true`,
`completedAt`, `sourceRevision` (40 hex characters), `buildDigest` (SHA-256),
`targetId`, exact `scenarios`, repository-relative `artifact`, `artifactSha256`,
and gate-specific `proof`. Receipt fields describe evidence; they cannot create
approval or downstream authority. Inspect the verifier's explicit proof checks
before recording a receipt.

| Gate | Required evidence |
| --- | --- |
| `onboarding` | BP-CUS-001 mutation journey, materialization and distinct source/result snapshots, lineage, exactly one prospect Customer |
| `role_extensions` | BP-CUS-002/003 identity reuse and unchanged opposite-role authority |
| `controls` | BP-CUS-004 through 008; negative credit, blocked activation, scoped designation, reconciliation, five distinct lifecycle event IDs in successive version order |
| `lifecycle_negative` | Exact replay plus conflicting-key, stale-version, wrong-tenant, permission and invalid-transition denials |
| `downstream` | All five exact lifecycle event IDs linked to consumed projection receipts and delivered notification receipts, with matching desired states |
| `product_approval` | BP-Q002 approved by a named NEON Master Data reviewer/principal, timestamp, current review-packet hash, retained approval artifact hash, explicit archive-retention and reactivation-block decisions |

The Customer portal consumer is now registered as
`trustiam.customer-portal.deliver` on `iam.customer-portal.delivery` every 15
seconds. Deploy the API, worker and scheduler build and the five Customer
notification templates/routes. Health key `trustiam.customer-portal-delivery`
reports a backlog older than 15 minutes or a dead letter as unhealthy.

For every Customer portal user, an existing NEON `master.contact_person` must be
owned by that Business Partner and linked to `master.person`. Studio must already
hold the approved `trustiam.identity_projection` for the same source tenant,
Person and `business_partner_contact:<contact-id>` reference, with relationship
`contact` and an active organization whose `metadata.organizationPurpose` is
`customer_portal`. The consumer does not create contacts, identities, roles or
application grants. Missing bindings fail visibly. Activation cannot clear an
independent IAM suspension; reactivation can clear the suspension previously
projected by this Customer lifecycle.

The source worker checks the immutable lifecycle event against the current
Customer version, fences completion by claim token and attempt, and marks older
events superseded without reporting them consumed. Studio stages a new desired
identity version/hash, preserving approved applications. Only exact successful
IAM saga attempts permit a consumed receipt. Pending saga observation remains
pending; saga dead letters and changed projection heads become delivery failures.
The five lifecycle notifications use the existing durable in-app pipeline and
notify the command operator. This is not proof of external applicant email.

Wait for each action's actual downstream completion before advancing the next
action when collecting five-action delivery evidence. Otherwise an intermediate
state may correctly be superseded before the provider observes it. The current
control browser test runs the actions without this downstream wait; run the
operator delivery rehearsal separately before claiming the downstream gate.

With read-only access to both database planes, collect sanitized evidence:

```sh
pnpm --dir server/db db:evidence:business-partner-r5-downstream \
  --tenant-id=<tenant-uuid> --customer-id=<customer-uuid>
```

Supply `ATHYPER_NEON_DATABASE_ADMIN_URL` and
`ATHYPER_PLATFORM_DATABASE_ADMIN_URL` through the secret environment. The
collector starts read-only transactions and cross-checks lifecycle IDs, Studio
command receipts, exact successful saga version/hash/status coordinates and
actual in-app notification deliveries to the operator. It exits 2 if any evidence
is missing; it never updates qualification or approval status. Retain its output
as a gate artifact only after `complete` is true and deployment coordinates have
been independently recorded.

The authenticated development run on 2026-09-05 resolved three distinct actors
in one tenant but Customer creation returned HTTP 503,
`BUSINESS_PARTNER_REQUEST_SCHEMA_UNAVAILABLE`, with prerequisite
`BUSINESS_PARTNER_DEFINITION_LOCAL_ACTIVE_REQUIRED`. Publish and activate the
Customer definition through the existing Studio author/checker flow before
rerunning. The local definition candidate is already compiled; credentials alone
do not authorize bypassing publication approval or its MFA requirement.

The accountable reviewer must decide the
[state review](../../governance/policy/reports/business-partner-customer-state-review.md).
The task request and synthetic fixtures do not constitute BP-Q002 approval.

## Isolated SQL verification

For a fresh, labelled `athyper-bs360-*` disposable PostgreSQL container, apply
`db:foundation:bs360-disposable` using its documented confirmation. The build used
PostgreSQL 16.13 and a loopback-only port. The baseline installs 207 DDL entries.
Then run these steps in order:

1. Apply `server/db/scripts/tests/integration/business-partner-r5-fixture-foundation.sql`
   inside that isolated database. It creates only synthetic system-tenant sales,
   company and payment-term context.
2. Run the R5 provisioner using `--tenant=system --actor=systemadmin
   --organization=r5.sales --company=r5.company` and the isolated loopback URL.
3. Execute `server/db/scripts/tests/integration/business-partner-r5-customer-controls.sql`
   with `psql -v ON_ERROR_STOP=1`. Its profile regression, five-action/replay and
   negative checks roll back, preserving the prospect fixture.
4. Verify a second provisioning attempt refuses the existing fixture.

These SQL checks use synthetic readiness to exercise the database authority;
they do not test browser authorization, real readiness inputs or downstream
worker consumption. Keep that distinction in any retained report.

The additional rollback-only SQL probes are
`customer-portal-consumer-probe.ts` (Studio) and
`customer-portal-source-probe.ts` (NEON) under
`server/db/scripts/tests/integration/`. They exercise real SQL staging, replay,
claim fencing and receipt linkage with synthetic data. The consumer probe also
verifies the corrected shared canonical-party graph trigger still rejects
hierarchy cycles. No identity provider is contacted and all synthetic receipts
are rolled back; these probes cannot serve as delivery evidence.


### Development deployment follow-up (2026-09-05)

The R5 runtime deployment uncovered a scheduler composition defect: worker-only
database adapters were gating the recurring Customer delivery schedule. Register
the schedule and job definition before that guard. The scheduler regression test
runs without worker database adapters. The notification-age readiness query also
requires the SQL `FILTER` clause on `min`, not on `extract`.

The development target now has the R5 synthetic control Customer
`c976420c-3a6c-5095-bbbf-dadd5960b07e` and its scoped AR/risk fixtures, plus the
synthetic `R5.NET30` payment term. This is fixture setup, not onboarding evidence.
The five Customer notification templates/routes and both shared-record trigger
fixes were applied transactionally.

Publication needs more than the available account passwords. The Studio author
and checker both reach MFA enrollment. The worker configuration also has
`PUBLICATION_COMPILE_ENABLED`, `PUBLICATION_DISPATCH_ENABLED` and
`PUBLICATION_APPLY_ENABLED` set to false, with no signing-key or Infisical
references configured. Complete the normal signing configuration and authenticated
independent author/checker publication flow; retain the signed release and local
activation acknowledgement before rerunning BP-CUS-001. No direct active-definition
insert is a substitute for publication evidence.

Direct Playwright control requests must carry the authenticated session's CSRF
cookie in `X-CSRF-Token` and the current page origin in `Origin`, including exact
replay and conflicting replay requests. Do not disable relay CSRF validation.

There are currently no approved NEON Customer-contact Studio identity projections.
An authorized contact binding with existing approved applications is required
before real portal receipts can be obtained. BP-Q002 remains pending the named
NEON Master Data review of the Customer state packet.


The first scheduled target attempts exposed a second execution-context issue:
use the existing system principal UUID for this plane job, not a display label.
After correcting the scheduler template, the worker fails with
`permission denied for schema event`. The development Customer queue is paused
pending a reviewed service-grant and tenant-access implementation. The worker is
not a PostgreSQL superuser or RLS-bypass role; adding schema usage alone is
insufficient. Validate the source claim, receipt and Studio projection paths under
`athyper_worker`, not only under an administrator, before resuming
`iam.customer-portal.delivery`. Retain the failed attempts as operational evidence.
A paused queue or successful empty poll does not satisfy downstream qualification.


Latest authenticated control observation: credit-review creation succeeds after
installing the normalized decision command, its scope columns/foreign keys and
version 7 of the Business Partner audit contract. The checker (`athyper.owner`)
is denied `neon.customer.credit.decide` with HTTP 403. Configure an authorized
checker before continuing. The existing pending review must be retained; the
full fresh-fixture test deliberately refuses to reset or erase that evidence.
The Customer state is still prospect and no lifecycle event was created.
