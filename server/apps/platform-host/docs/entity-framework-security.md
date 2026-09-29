# Entity Framework authorization and publication recovery

The host installs `createPublishedTenantRecordAuthorizer` around its existing IAM
authority. It loads current descriptors through the compiled metadata reader and
qualifies a closed set of `entity.record.list.v1` / `entity.record.read.v1`
handlers with the `tenant.record.v1` resolver. There is no public-reference bypass.
Country uses this adapter on Studio, Neon and Mesh.

The adapter refreshes IAM evidence, retains the original tenant/principal/plane,
requires the published operation permission, checks field uses, and resolves
existing records through the repository under tenant context. Profile hashes pin
read authorization to the query's descriptor. Generic response projection masks
masked fields; search/filter/sort/group on those fields are denied. Unsupported
ownership, writes, preflight, relationships or runtime versions require a separate
qualified backend and otherwise fail closed. Existing explicit rollout backends
retain their qualification requirements. Publication activation uses the same
installed-backend qualification boundary.

Recovery discovery uses `publication.fn_recoverable_deployment_coordinates`.
Its NOLOGIN owner has column-level SELECT grants and a SELECT-only RLS policy,
not admin or mutation authority. Only the recovery role can execute the function;
the ordinary publication role cannot discover other tenants. The worker reloads
coordinates under tenant RLS, verifies release status, selects the target service
principal, and enqueues tenant-scoped apply work. Apply rechecks activation
approval. Discovery/enqueue outcomes are audited. Pagination retains PostgreSQL
timestamp precision and continues beyond the bounded per-job page budget.

Apply requires a tenant context. Permanent failure recording happens in a new
tenant-scoped transaction after rollback, preserving the original failure code.
Authority and target databases remain separate transactions: this is a resumable
protocol, not a distributed atomic commit.

Attachment admission loads stored owner coordinates before invoking content ACL
authorization. Atlas downloads require the stored uploader and an owned prompt
link; owner lifecycle operations remain available during upload. General
attachment permissions remain an additional requirement.

## Deployment

Apply the Studio `20260930_publication_recovery_discovery.sql` migration before
enabling recovery. Provision a separate login granted only
`athyper_publication_recovery`, and configure the worker's
`PUBLICATION_RECOVERY_DATABASE_URL`. Do not grant the discovery owner role to a
login. Ensure each target tenant has the configured active publication service
principal. Existing queued apply jobs without tenant coordinates must be
re-enqueued through recovery; they are rejected by the tenant orchestrator.

Code tests and disposable PostgreSQL tests do not establish that a deployed
environment has these grants, current publications, or working browser flows.
Verify those after migration and deployment.

### Local DEV

`node tooling/scripts/local-dev/deploy-publication-recovery.mjs --confirm dev`
backs up Studio and cluster role metadata, rehearses the scoped migration with
rollback, applies it with its migration-ledger entry, and provisions the dedicated
DEV discovery login. Backups and credentials remain owner-only under
`~/.athyper/instances/dev/`. The helper validates DEV container ownership and does
not select QA. `pnpm devfull` installs the private connection setting only in the
worker and starts the current checkout through the normal workspace controller.

The September 30 DEV deployment passed six application health checks and the
discovery privilege checks. The existing 76 activated deployments were retained.
Authenticated Country qualification still requires a fresh normal DEV session:
the saved session failed authentication before any Country journey checks ran.
QA has not been promoted.
