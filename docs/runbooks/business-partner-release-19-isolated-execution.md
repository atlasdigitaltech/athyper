# Business Partner release-19 isolated execution

**Phase status: Closed for the agreed isolated qualification scope (2026-09-10).** See the [closure record](../reviews/business-partner-runtime-completion-status.md#2026-09-10--isolated-qualification-phase-closed). Full Atlas conversations, cross-instance revocation synchronization and shared activation remain separate. Existing receipts retain their recorded execution images.

The isolated API and worker use the signed release `ba383d04-9a18-4e59-ab4e-3d9726e934c6`, artifact SHA-256 `a1b5c585802eab7c5a0c3c83b85033a066607476070bfb4e7efb3201618620fa`. The native artifact loader verifies both signatures, payload integrity and the concrete registered BP runtime bindings in each process before admitting work.

The deployment evidence is [business-partner-release-19-isolated-deployment.dev.json](../../governance/policy/reports/business-partner-release-19-isolated-deployment.dev.json). It identifies the exact execution image, containers, descriptor hash, request results and completed worker receipt. Active shared DEV remains release 18; its release-19 activation hold remains enabled.

## Isolation and execution checks

- API: `athyper-bp-r19-api`; worker: `athyper-bp-r19-worker`.
- PostgreSQL: `athyper-bp-r19-db`; Redis: `athyper-bp-r19-redis`; object storage: `athyper-bp-r19-objectstore`.
- All run on internal network `athyper-bp-r19-isolated`, with no published ports. No shared scheduler is attached. Redis and the object bucket begin empty; all three plane databases are independent snapshots.
- Application pools use the cloned `athyper_runtime` account. Worker pools use cloned `athyper_worker`, with `athyperapp` membership added only in the clone to satisfy the deployed runtime database contract. Neither account is superuser or bypasses RLS. These database service-role adjustments are separate from business-user permission grants.
- Publication authoring, compilation, dispatch, recovery and application writers are disabled. Clone projection installation temporarily disables the cloned activation hold within the installation transaction and reenables it before commit. Shared DEV's hold is never modified.
- The dedicated host supplies a trusted isolated-execution gate to the backend authorizer. Normal deployment composition does not supply this gate and still requires production qualification. The isolated gate checks dedicated endpoints and the exact active artifact on each boundary. Current IAM context is refreshed; existing domain denial and target denial both remain effective.
- Requests expose `x-execution-artifact` and `x-execution-release`. Queued payloads carry a producer artifact marker; consumers reject missing/wrong markers and recheck the active artifact before and after handling. Successful execution receipts record the artifact, release, queue and hashed job identifier.

The private instance configuration, public verification key and artifact are under `~/.athyper/instances/dev/deployments/bp-release-19-isolated-20260910/`. No signing private key is supplied. The operator diagnostic token is private and cannot substitute for a business user's session or MFA.

## Verify the running instance

From the repository root:

```bash
node tooling/scripts/verification/isolated-execution/verify-deployment.mjs
node --test tooling/scripts/verification/isolated-execution/release-boundary.test.mjs
```

Verification performs an operator-authenticated read of the active native descriptor and enqueues a descriptor-read job through the API, then requires the matching completed worker receipt. It also checks missing authentication (401), wrong requested artifact (409), container/network isolation and unchanged shared DEV activation head. This is deployment execution evidence, not authenticated BP command/import/export/AI qualification.

## Authoring and installation sequence

The scripts are specific to this isolated instance. Provisioning and configuration creation deliberately refuse to overwrite existing state. Do not rerun provisioning against the running instance.

1. `provision-business-partner-r19.mjs`: create the isolated stores and clone plane databases.
2. Export the actual signed object and its public verification key using the verified publication store; preserve the pinned artifact hash. Never create replacement signatures or substitute a JSON proposal for the signed artifact.
3. `prepare-runtime.mjs`: prepare allowlisted configuration with independent credentials.
4. `build-image.mjs`: layer the isolated host and backend adapters onto the recorded deployed worker image. API and worker use this same image.
5. `initialize-stores.mjs`: initialize the empty bucket and clone-only database service-role/plane settings.
6. `start-runtime.mjs --stage`: native verification, staging, verification persistence and activation in the clone only.
7. `start-runtime.mjs`, followed by `verify-deployment.mjs`.

## Authenticated commands and governed import qualified

The [commands/import gate report](../../governance/policy/reports/business-partner-release-19-isolated-commands-import-gate.dev.json) passes against execution image `sha256:ef2b3fc2cf9f10fe951bebfab8f44c0a8c8479f41935a37182369f57e36d26ee` and the signed artifact above. It binds the API results to running containers, immutable command evidence, persisted materialization and 105 passing regression tests.

- catl.admin created, validated and submitted case `4e9c4bc0-0568-44e0-b11b-0e0588dd561c`; catl.owner independently approved through normal MFA. catl.admin then applied it through normal MFA. A separate API read confirms applied status; SQL records successful materialization to BP `01a08a39-b146-7553-803b-87e5a47e2e8a`.
- Governed JSON import created draft request `543cc7f2-7a68-4be9-9bd8-8416457399e9` with source `import`, without materializing a partner. Identical retries return the same request; changed-payload retries conflict.
- Self-approval, premature application, incompatible internal/general supplier input, wrong-release import, direct create/update and legacy direct import were rejected. All nine deferred operations are absent from the signed operation/binding catalog; this does not claim a separate live journey for every deferred operation.

The isolated deployment now includes `athyper-bp-r19-jwks`, serving public issuer keys only. Trust expires at `2026-09-10T08:09:14.781Z`; runtime authentication closes after that deadline. `athyper-bp-r19-auth-client` is an operator-invoked CLI with no listening server. It alone joins the isolated and existing DEV application networks to resolve normal BFF sessions and revalidate current admission through the read-only IAM endpoint. Business requests go to the isolated API with genuine issuer tokens; the API derives MFA assurance. Neither the operator diagnostic token nor the CLI fabricates assurance.

The harness compares source and clone roles, permissions, memberships, delegations, denials, ACLs, overrides and scope records before and after requests. A mismatch aborts qualification; no grants are copied to repair drift. Temporary test grants retain their original `2026-09-10T10:35:00Z` expiry.

To check the captured journeys and their persisted witnesses:

```bash
node tooling/scripts/verification/isolated-execution/check-commands-import.mjs
```

`qualify-commands.mjs` and `qualify-import.mjs` execute real isolated mutations and require live sessions, valid trust and unexpired approved test grants. Do not rerun them just to inspect evidence. Initial failed attempts remain in separate reports; their snapshots were not rewritten.

## Export, AI retrieval and local live revocation qualified

The [export/AI/revocation gate](../../governance/policy/reports/business-partner-release-19-export-ai-revocation-gate.dev.json) passes on image `sha256:61686a2a5cdd813eb51466c84636835e106b17241a5e94a12dc4d56be0a89617`, using the same signed release-19 artifact. Its 101 focused regression tests are additional evidence for this milestone, not a rerun of every earlier command journey.

- Authenticated export queued and completed through the real worker. The downloaded JSON contains 125 rows and exactly `id` and `legal_name`; the report hashes the downloaded bytes and records the worker artifact receipt. Sensitive fields are rejected.
- The actual `entity_read_record` handler and Records gateway return only published summary fields and a matching saved-record citation. The isolated `/api/isolated/ai-record-retrieval` harness uses normal IAM authentication, fresh local authority, AI admission and real Records authorization. Wrong descriptors, arbitrary fields, missing records and a principal lacking target read authority are denied. This is retrieval qualification, not an Atlas thread/model/tool-coordinator journey.
- The worker was paused after an authenticated export was queued. Only the three approved temporary test memberships and assignments in the clone were then revoked. New exports, download-link issuance, record reads and AI retrieval were denied. The worker resumed with its original queued context, rejected revoked authority and created no artifact.

The clone assignments remain revoked. Source and clone authority hashes now intentionally differ; shared DEV authority retains its original hash. The ordinary command/import/export qualification harnesses must stop on that difference. Do not copy source grants back into the clone, rerun provisioning, or restore revoked memberships to obtain a passing result. A new positive journey needs a separately authorized qualification plan.

Read-only evidence checks:

```bash
node tooling/scripts/verification/isolated-execution/check-export-ai-revocation.mjs
```

`qualify-revocation.mjs` performs a real clone-only revocation and is not a repeatable read-only check. Its initial assertion expected a `FORBIDDEN` job code; the owning worker persists `ERROR` with the explicit revocation reason. The initial failure is preserved, and the final witness requires that exact reason and a null artifact.

Engineering fixes bind IAM operations to the active tenant publication, authorize collection projections through the directory before checking individual records, and align export authorization fields with worker fields. A database rollback test proves a missing tenant read binding cannot fall back to the global catalog. The rollback test does not commit binding retirement or restore a committed revocation.

## Remaining qualification boundary

This evidence covers governed JSON import, commands on the earlier recorded image, export, AI record retrieval and local live revocation. It does not establish full Atlas conversations, continuous cross-instance revocation delivery, or every provider/field journey. The command/import report remains historical evidence for its recorded image; this successor image does not silently replace that receipt.

Previously issued object-store presigned URLs remain valid for their bounded TTL. Revocation prevents issuing another download URL; immediate invalidation of an already issued URL is not claimed. API/worker retain their internal network and time-limited IAM trust.

Shared activation, any further grant migration and compatibility retirement remain separate. Do not restore isolated snapshots or old grants into shared DEV.

## Stop and rollback

Stop only the isolated execution processes:

```bash
docker stop athyper-bp-r19-api athyper-bp-r19-worker
```

Keep private configuration, images and isolated data for diagnosis until retention is decided. Never restore these snapshots into shared DEV. No shared DEV rollback is necessary: its head remains release 18. Restarting must use the recorded compatible image and artifact; any mismatch fails closed. Shared activation and eventual compatibility retirement remain separately approved stages.
