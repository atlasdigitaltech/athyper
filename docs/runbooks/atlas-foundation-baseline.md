# Atlas F0 baseline collector

The collector inventories the current repository and a local Docker DEV or QA target. It performs read-only SQL, container/file inspection, provider metadata GETs, and GET requests using existing saved browser sessions. It does not generate an answer, invoke a business tool, log in, change grants, publish metadata, migrate a database, or restart a container.

Run from the repository root:

```sh
pnpm test:atlas-baseline
pnpm atlas:baseline dev /path/to/atlas-f0-dev.json
pnpm atlas:baseline qa /path/to/atlas-f0-qa.json
pnpm --dir server/db run db:verify:ddl-model
```

Output paths are explicit; an existing output file is replaced. Reports use a `0600` creation mode. Review reports before sharing: they intentionally contain internal capability/schema names, deployment hashes and pseudonymized tenant scopes, but exclude business record values, prompts, credentials, raw HTTP responses and raw probe errors. Pseudonymization is not anonymization.

Prerequisites: the repository's Node/pnpm dependencies, Docker access, local `athyper-<target>-db-1` and API containers, and their installed `psql`/Node tools. Browser GET observations use existing `tests/e2e/.auth/neon*.json` states through Playwright; absent or expired sessions are recorded without repairing authentication. QA may have a different feature/build level. Known absent modules/tables are valid inventory observations, not successful feature checks.

Each SQL query runs under `BEGIN READ ONLY`, with `ON_ERROR_STOP` and a statement timeout. Queries use the database operator to inspect schema and aggregate metadata across tenants; this does not establish any user's effective permissions. Source and API image/start coordinates are checked again at the end to detect changes during capture. Independent probes are not a cross-service transactional snapshot.

The report contains:

- A scoped source-tree digest and per-file SHA-256 values, including dirty/untracked source state. The scope is explicit and is not a reproducible-build attestation for the deployed image.
- Container image IDs, start/health states, allowlisted Atlas environment settings, deployed emitted-module and installed adapter entry hashes.
- Checked and mounted model configuration hashes; provider engine/model digest comparisons through metadata-only requests. An unloaded model is recorded as unloaded, not unhealthy; no generation readiness is claimed.
- Manifest-derived table presence plus live columns, constraints, indexes, triggers, selected-role grants and RLS policy fingerprints. SQL object fingerprints use PostgreSQL MD5 as change markers; source/config artifacts use SHA-256. Presence comparison is not full DDL semantic parity.
- Descriptors joined through activation head, active applied release, active descriptor, and published contract. Rows include tenant/platform scope tokens and descriptor kinds; they are not a resolved descriptor for an arbitrary user's tenant context.
- Published experience-profile references, policy/threshold/quota metadata, and knowledge/feedback counts. Empty policy tables do not imply that code defaults or permission checks are absent.
- Last-24-hour run/tool aggregates and durable-run states. `sinceApiStartCount` distinguishes terminal run/tool rows created since the currently observed API start. Earlier successes/failures cannot qualify this image; absence of new errors without traffic proves little.
- Exported deployed tool factory construction with nonexecuting owner placeholders. This captures tool contracts the build can construct, not the in-process registry, owner connectivity, or user-admitted tools.
- Historical evidence hashes and image-ID comparison. Even an image match does not validate all model/policy/descriptor/persona bindings. F0 never promotes an old receipt to current qualification.

Exit code `0` means the inventory probes completed, including explicit observations of absent features and unavailable saved-session GETs. Schema drift and missing runtime features remain in findings. Exit code `1` means a probe failed or the source/API changed during capture; inspect `assessment.missingObservations`. Exit code `2` rejects invalid target/arguments. No exit code certifies an Atlas release: `releaseQualified` is always false.

The reviewed capability matrix must distinguish source support, factory availability, owner connection, published profile references, execution observations and authenticated qualification. Do not turn a completed factory probe or HTTP 200 into an effective permission grant. The current host does not expose an operator in-process registry snapshot; retain that observability gap until a qualified diagnostic path exists.

Use the [reviewed 2026-09-10 baseline](../architecture/atlas-foundation-f0-baseline.md) for current findings and follow-up ownership. The [foundation plan](../architecture/atlas-meta-entity-learning-foundation.md) defines F1 onward. AI DDL maintenance guidance is in [database scripts](../../server/db/scripts/README.md).
