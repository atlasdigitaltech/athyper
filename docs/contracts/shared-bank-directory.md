# Shared bank directory and banking ownership

The canonical bank directory is global reference data published identically into each plane. NEON and MESH no longer own editable bank-party tables. This is a desired-state development replacement, not a compatibility migration. Existing development databases must be rebuilt with matching application code before deployment.

## Ownership boundary

| Information | Authority | Consumer behavior |
| --- | --- | --- |
| Institution, branch and routing identifiers | Governed shared directory | Read a published release; never match by display name |
| MESH-originated account facts | Account owner through MESH | NEON preserves the received disclosure version |
| Locally registered account facts | NEON tenant | Remain locally maintained |
| Disclosure eligibility, expiry and revocation | MESH | NEON reflects the disclosure lifecycle |
| Receiving verification and acceptance | NEON tenant | Separate from source verification |
| Company usage and preferred account | NEON company | Not overwritten by source disclosure |
| House-bank GL/payment settings | NEON company | Remain operational company data |

The directory contains no account identifiers, balances, tenant account ownership or payment approval. Partner visibility without a company filter is a subsequent banking-read change; this directory replacement does not relax existing account permissions or company usage rules.

## Data model

- `shared.bank_institution`: permanent institution identity.
- `shared.bank_branch`: permanent branch identity and immutable parent institution.
- `shared.bank_institution_version` and `shared.bank_branch_version`: canonical attributes, lifecycle and effective dates in each immutable release.
- `shared.bank_identifier`: release-specific BIC, national bank/branch code or clearing member ID. Scheme namespace and jurisdiction qualify values. Overlapping assignment of the same identifier is rejected.
- `shared.bank_directory_source_record`: source-record mappings; never infer identity from a name. Previously published mappings cannot silently change targets.
- `shared.bank_directory_release`: immutable payload, source manifest, publication timestamp, version and content hash.
- `shared.bank_directory_activation`: atomically selects the active release.

`shared.v_bank_institution`, `shared.v_bank_branch` and `shared.v_bank_directory` expose the active projection. Stable identity rows intentionally do not contain mutable names; read a version table for historical attributes. Full release snapshots retain retired institutions and branches, so historical foreign keys continue to resolve.

The masked account resolver uses the exact institution and optional branch. It returns a singular routing identifier only when unambiguous. Capability booleans are unknown rather than inferred from possession of a BIC. Identifier validity intervals use `[effective_from,effective_until)`.

Both account tables reference `bank_institution_id` and optional `bank_branch_id`; a composite foreign key prevents a branch belonging to another institution. NEON correspondent references also use the shared institution identity. Known-bank accounts cannot override a canonical BIC; free-text routing belongs only to provisional references. Verified or linked accounts cannot silently change their directory coordinates.

Unknown banks use tenant-local `master.bank_provisional_reference` / `mesh.bank_provisional_reference`. Existing submitted-name/country inputs create an explicit unresolved reference. These records are not added to the canonical directory. Application roles may submit/read them within tenant boundaries; resolution is an administrative operation. Resolving a provisional record does not silently rewrite a verified account.

## Publication contract

The TypeScript contract is `server/packages/contracts/master-data/src/bank-directory.ts`. A release envelope includes `id`, positive `version`, `publishedAt`, `sources`, `contentHash`, and `payload` with `institutions`, `branches`, `identifiers`, and `sourceRecords` arrays. Every record has a stable explicit ID where applicable. Date ranges and lifecycle status are explicit.

`contentHash` is lowercase SHA-256 over PostgreSQL `jsonb::text` UTF-8 bytes of the payload, not an arbitrary JavaScript serialization. The same envelope must be installed in each database. Source manifest and published timestamp are also compared on replay. A hash establishes payload consistency, not external-source authenticity; the authorized publisher is responsible for source approval and licensing.

`shared.publish_bank_directory` validates and materializes a complete release in one transaction. It rejects hash/identity collisions, version regression, conflicting identifiers, branch-parent changes, missing historical identities and source reassignment. Concurrent publication is serialized. Replaying an already installed release is a no-op and does not roll back a newer activation.

Application roles have SELECT only on the shared directory and cannot execute publication. The administrative CLI executes publication with invoker rights. The Studio workflow below uses signed artifacts and the restricted projection-applier functions; ordinary application roles cannot publish.

Run the publication command with an explicitly selected plane and administrative connection:

```sh
pnpm exec tsx server/db/scripts/operations/banking/publish-bank-directory.ts release.json --plane=neon
pnpm exec tsx server/db/scripts/operations/banking/publish-bank-directory.ts release.json --plane=neon --apply
```

Set `BANK_DIRECTORY_DATABASE_ADMIN_URL` through the environment. The first command rehearses and rolls back; `--apply` commits. Repeat the same envelope for MESH and compare active release ID/version/hash. This CLI is a low-level administrative tool. Use the Studio workflow for governed releases with independent approval, signed delivery and activation monitoring.

## Development verification and rollout

Build the canonical manifests in an isolated PostgreSQL instance, then run `server/db/scripts/tests/integration/bank-directory/ownership.sql` in each plane. The synthetic fixtures roll back and must not be shipped as real directory data. Generated Prisma/Kysely models and authorization inventories must match the new DDL.

The normal development stack is not modified by these checks. A later deployment must rebuild affected databases and ship matching services together. Archived `seed-backup` data is historical evidence and is not a supported seed for this replacement. No active seed should create the removed bank-party tables.

### Verification recorded 2026-09-09

- Clean canonical DDL builds passed in isolated NEON, MESH and Studio databases.
- The directory SQL regression suite passed in all three planes, including real NEON account inserts and provisional-reference tenant isolation.
- Publication CLI rehearsal made no persistent changes; applying the same synthetic release to NEON and MESH produced identical active IDs and hashes. A corrupted hash was rejected.
- Master-data contract/service typechecks, 12 targeted service tests, generated Kysely models and the three-plane DDL model checks passed.
- Full Prisma validation still reports the same baseline duplicate-relation errors (NEON 5, MESH 11, Studio 5); no additional validation errors were introduced by these model changes.
- The existing broader bank-verification integration fixture failed during its case-submission setup (`Unvalidated case was submitted`), before exercising account verification. That suite is not claimed as passed.
- No running development database was reset and no application deployment was performed.


## Studio import and publication workflow

Studio route: `/mdg/bank-directory`, also linked from Business Partner Publication.

1. Load normalized source JSON, or edit it in Studio. Browser imports are limited to 256 KB per batch. Full release snapshots retain prior records, so a licensed feed can be normalized into successive batches. Raw provider formats require adapters producing this contract.
2. Validate and save an immutable `snapshot.bank_directory_revision`. Exact source-record mappings preserve identities. New source IDs sharing existing routing identifiers are held for explicit resolution. Names never select an existing identity.
3. Review additions, before/after changes, explicit retirements, source provenance and validation issues. Rejected/invalid revisions remain evidence. Editing creates a new revision. Omission from an import never retires a record.
4. An independent reviewer with an elevated session approves. `publication.bank_directory_review` is immutable. Approval rechecks validation and the base release under a publication lock, preventing concurrent stale revisions from publishing. Source data and receiving account acceptance are separate.
5. Approval creates a new generic publication release plus `publication.bank_directory_release_link`. Existing workers compile three `bank_directory` artifacts, sign with Ed25519, store immutably and deliver to Studio, NEON and MESH. The directory payload/version/hash is identical; signed artifact hashes differ because their target planes differ.
6. Each receiving plane rehearses validation, verifies the signed artifact and atomically materializes the directory with its activation head. Out-of-order releases wait for their predecessor; failed staging, validation or activation preserves the old directory. Corrections use a forward release, not rollback of directory history.
7. Studio shows installed versions/hashes, missing historical releases, hash conflicts, delivery attempts and activation acknowledgements. **Resume publication** reuses an approved release after interrupted queueing; it does not approve new content. Existing worker retries and publication recovery handle transient delivery failures. Terminal dead letters remain in the existing publication operations workflow.

Automation boundary: import normalization, exact source mapping, validation, compilation, signing, delivery, retry and scheduled reconciliation are automatic. Identity ambiguity, final approval and changes to source authority require an explicit human decision. No scheduled job approves a draft or edits an immutable release.

### Authority and permissions

Nominate one existing active Studio tenant using the administrative script. It refuses to silently replace another owner:

```sh
psql "$ATHYPER_PLATFORM_DATABASE_ADMIN_URL" -v ON_ERROR_STOP=1 -v tenant_id="$BANK_DIRECTORY_AUTHORITY_TENANT_ID" -v apply=false -f server/db/scripts/operations/banking/nominate-directory-authority.sql
# After reviewing the rehearsal, use apply=true to save the nomination.
```

Cataloged permissions are `studio.bank_directory.read`, `.author`, and `.publish`. Assign them through the existing IAM role workflow: readers may inspect; authors may import; reviewers need read/publish. Publishing requires MFA and maker/checker separation. The route authorizer uses the verified permission snapshot and the service independently enforces the nominated tenant and immutable author. The schema does not grant these capabilities to every administrator automatically.

Use existing publication configuration for API, compile, dispatch, apply, signing key, artifact storage and all three target planes. The existing `publication.worker` service principal must be provisioned in each destination tenant. Set `BANK_DIRECTORY_AUTHORITY_TENANT_ID` to the nominated tenant to register scheduled directory reconciliation, with the existing publication recovery interval and scheduler. Its results are retained as Jobs execution output for 90 days; it does not send external notifications or perform automatic corrections.

### Input contract and identity resolution

```json
{
  "schema": "athyper.bank-directory-import/1",
  "sources": [{"source": "official-or-licensed-source", "version": "2026-09", "retrievedAt": "2026-09-09T00:00:00Z"}],
  "payload": {"institutions": [], "branches": [], "identifiers": [], "sourceRecords": []},
  "resolutions": {"[\"source-name\",\"upstream-record-id\"]": "existing-institution-uuid"}
}
```

Input institution/branch IDs are batch-local aliases; source mappings resolve them to stable Athyper UUIDs. A resolution must reference an existing institution in the same country and cannot override an established source mapping. Branch parents and qualified identifier uniqueness are validated again by the database. Identifier schemes are `bic`, `national_bank_code`, `national_branch_code`, and `clearing_member_id`. BIC uses `iso9362`; national schemes supply their clearing-system namespace and jurisdiction. IBAN is an account identifier and is rejected as a directory scheme.

The checked development input is `server/db/seed/reference/bank-directory/development.v1.json`; its adjacent README links the official evidence. Global acquisition and provider-specific adapters remain external inputs, not automatically supplied coverage.

### Exact references and reconciliation

`GET /api/bank-directory/reference?releaseId=…&institutionId=…&branchId=…` resolves only that installed release in the authenticated receiving plane. It returns `pending` when the release is absent, `unresolved` for an absent institution or inconsistent branch, and `resolved` with release-specific attributes and identifiers otherwise. It never falls back to the current directory or matches by name.

Studio's **Check received directory references** compares a supplied list against all three planes using `/api/studio/bank-directory/references`. It distinguishes unavailable planes, pending versions and unresolved identities. Receiving disclosure services can also call `reconcileBankDirectoryReferences` in batches of up to 1,000 coordinates. This is directory-reference reconciliation; registering account disclosures and maintaining local account acceptance remains the subsequent account-sync phase.

### Workflow validation

The committed integration test requires freshly built disposable databases on localhost. It writes test principals, a nominated authority and approved releases; never run it against the normal development stack:

```sh
BANK_DIRECTORY_DISPOSABLE_TEST=1 BANK_DIRECTORY_TEST_PORT=55439 pnpm --filter @athyper/server-service-publication test:integration:bank-directory
```

It exercises the actual publication-service and projection-applier roles, independent approval, stale drafts, idempotency conflicts, immutable evidence, Ed25519 compilation/loading, three-plane activation/acknowledgements, pending and unresolved references, payload tampering and retention of the previous active release after failed verification.

Workflow checks completed locally on 2026-09-09:

- Fresh final manifests: Studio 237 files, NEON 216, MESH 212; all applied successfully.
- Ownership SQL regression passed in all three planes and rolled back its fixtures.
- The committed signed pipeline integration passed using the actual restricted service roles. It additionally checked predecessor-pending delivery, missing historical versions, and bulk reference reconciliation across all three planes.
- Publication tests: 104 passed; Studio Business Partner component tests: 15 passed; directory authorization policy tests: 5 passed.
- Publication contracts/service, platform host, Studio application/components and BFF relay typechecks passed. Studio Kysely generation passed.
- Studio Prisma validation still reports its five pre-existing duplicate fields; no bank-directory model errors were reported.
- These workflow checks originally used disposable databases. The normal DEV deployment is recorded below.

### Normal DEV deployment — 2026-09-09

Applied the directory schema to the existing `athyper_studio`, `athyper_neon` and `athyper_mesh` databases in `athyper-dev-db-1`. Full database backups were restored into a disposable PostgreSQL instance first; the targeted upgrade passed there before applying to DEV. No database reset was used.

Both legacy bank-party tables were empty. Their foreign keys, affected views and functions were replaced. All 72 NEON accounts and the one MESH account retained their original values, checked inside the upgrade transactions. Existing bank descriptions became tenant-local provisional references; no institution was inferred from a name. Shared release/version tables and Studio import/review tables are installed.

The deployed runtime and Studio, NEON and MESH web images use the `bank-directory-20260909` tag. CirrusAtlantic is the nominated DEV authority. Dedicated directory author/reviewer roles extend the existing corresponding definition groups; `catl.admin` has author access and `catl.owner` has reviewer access. Independent review and MFA remain enforced. Publication worker principals are provisioned in all three planes, delivery targets include all three planes, and directory reconciliation is enabled. Scheduler registration was corrected to work without a worker runtime in the scheduler process, and scheduled execution uses the existing system principal UUID required by the Jobs audit tables.

The verified SG/MY/GB development input was imported through the deployed service using its restricted database login. Draft `47a97d89-7a21-4686-8e54-203fb4b50de2` passed validation with three institutions, three BICs and no issues. It awaits independent Studio review; no directory release has been approved or activated in normal DEV. Accordingly, reconciliation should report `not_published` until approval. Existing account provisional references remain unresolved until explicitly mapped.

Private deployment receipts, SQL scripts, rollback image references and pre-change database dumps are retained under `~/.athyper/instances/dev/receipts/bank-directory-20260909/`. These files include secrets and account data and must not be committed. QA was not changed.

Final DEV verification: all six updated services are healthy; Studio directory page returned HTTP 200 and all three directory relays returned HTTP 401 without authentication. The automatic `publication.bank-directory.reconcile` execution succeeded at 2026-09-09 02:44:05 UTC: all three databases were reachable and correctly reported `not_published`, with no missing or mismatched release hashes. Platform-host tests passed (282 passed, one skipped); the final focused runtime/authorization rerun passed all eight tests. Private `verification.json` records immutable deployed image IDs and the successful job result.

### First approved DEV release activation — 2026-09-09

After the independent Catl Owner approval, release `edd86fb2-9945-4aa1-901f-63f499af6b34` compiled successfully but signing failed with `SECRET_STORE_UNAVAILABLE`: the existing DEV Infisical container had stopped and had no restart policy. Restarted that container, verified authenticated signing-secret access returned HTTP 200 without exposing its value, and retried only the three failed signing jobs for this approved release. No approval or signing checks were bypassed.

All three deliveries are now activated and acknowledged. Studio, NEON and MESH each have directory version 1 with three institutions and three BIC identifiers; their canonical directory hash is `36ea76fa45061e4f846fe3d7e274824c00e48e8a15d05953799cae6cbc4a3ffa`. Plane-specific signed artifact hashes differ as expected. Existing account provisional references remain separate from directory publication.

Set `restart: unless-stopped` for the secretstore in the Compose source and on the running DEV container so it restarts after an unexpected exit or Docker restart. An intentional operator stop still takes precedence. QA was not changed.
