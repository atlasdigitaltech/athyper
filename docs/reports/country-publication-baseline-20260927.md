# Country DEV baseline and draft disposition

Captured at **2026-09-27T03:50:52.822Z**, before publication changes.
Machine-readable evidence: [inventory receipt](country-publication-baseline-20260927.json).
This is editable repository evidence, not immutable audit storage or an approval receipt.

## Method and limits

The reusable read-only inventory command is:

```sh
pnpm exec tsx server/db/scripts/operations/publication/inventory-dev-entity-product.ts --product=metadata/products/shared/entities/country
```

Each database is inspected in a read-only repeatable-read transaction. The three database
transactions are separate snapshots, not a distributed atomic snapshot. Docker inspection
identifies the running DEV database and the live API/worker mounts. No importer,
authoring mutation, approval, policy enrollment, signing or activation is executed.
Credentials are read in memory and excluded from the report.

## Authoring and deployment inventory

There is one global Studio entity: `b7e5b981-2227-4720-ba5d-040a48ab6842`,
code `country`, ownership `system`, tenant NULL, status `draft`.

| Layer | Observed count |
| --- | ---: |
| Studio change sets | 2 |
| Studio Country authoring releases | 0 |
| Studio publication releases for `metadata.reference.country` | 0 |
| Studio publication deployments through artifacts of those releases | 0 |
| Studio `metadata.publication` policy definitions | 0 |

| Target database | Existing `shared.country` rows | Activation heads for exact publication key | Applied releases for exact publication key |
| --- | ---: | ---: | ---: |
| Studio | 247 | 0 | 0 |
| Neon | 247 | 0 | 0 |
| Mesh | 247 | 0 | 0 |

These publication counts are exact-key queries, not a claim that no unrelated releases
exist. Reference data is untouched; no UUIDs or tables are replaced.

## Draft reconciliation: selected source, not lifecycle mutation

Use **`bded3c66-95b6-43b9-b8fd-df8e003e54e9`** as the canonical source for the next
publication preparation. Do not select by newest timestamp at execution time: re-read
this exact draft and verify all pins below before enrollment or publication.

| Pin | Value |
| --- | --- |
| Product hash | `fc8be6632cf1c3c0ef0f741bbe519120a99171fd2a95582e322393edd40af8b7` |
| Contract hash | `a9d1b21360b9ac72a181b52a13e0975e67e6370b25105ad3f7399d50c9257454` |
| Descriptor hash | `5d46ec092a33a02c117fd46c54d13216da91f481aa2ff1c0bd6b9cac75fe40e0` |
| Lock version | `1` |
| Created | `2026-09-26T15:19:41.976Z` |
| Targets in source marker | Studio, Neon, Mesh |

Retain older draft **`28e155d7-9f18-48fd-9f4d-847ff80f7e87`** as historical,
unselected input. Its product hash is
`2e6cc1eeec0dd357c1db0b5ec139ccd58c800532932985bb3a3fbaabdb00ff0f`;
it was created `2026-09-26T12:57:46.512Z`.
Both database rows remain `draft`. Neither is deleted, rejected, approved or published.
This disposition establishes the selected source in the written plan; it does not
pretend the database now contains only one draft or a persisted publication decision.

### Why two drafts exist

The existing importer (`system-reference-authoring.ts`) derives its branch from the
whole product hash and reuses a matching unchanged draft. Different product hashes
therefore produce different branches under the same entity.

Removing **only `definition.runtimeBindings`** from the currently loaded metadata
product reproduces the older product hash exactly. The current product hash matches
the newer persisted source marker. Both loaded graphs exactly match their own first
saved revisions. This supports two product revisions, not an accidental duplicate
of the same input or subsequent edits to either saved graph.

The diagnostic graph comparison finds the source-marker hash change and the new
`authorizationRuntime` list/read bindings:

- `list` → `entity.record.list.v1`, resolver `tenant.record.v1`.
- `read` → `entity.record.read.v1`, resolver `tenant.record.v1`.

That comparison removes UUID values to expose content changes; it is **not** a
relationship-preserving proof of semantic equivalence. Canonical selection rests on
the exact current-product hash, persisted marker and unchanged saved revision, not
on treating the diagnostic diff as authorization evidence.

Both drafts compile with the current compiler and have zero graph-validation issues.
Each has 22 fields, list/read operations and two capability declarations. Each has
**zero embedded contract tests**: `testsPassed: true` is not substantive coverage.
Capability declarations and compilation do not establish runtime qualification.

## Live publication workload configuration

Both `athyper-dev-source-api-1` and `athyper-dev-source-worker-1` are running and
Docker-healthcheck healthy. Both mount `/run/dev-publication/server.json` from the
DEV instance's `secrets/dev-publication/server.json` file. Its modification time
(`2026-09-21T09:29:36.677Z`) precedes both container start times.

The mounted publication configuration still selects:

- Tenant `cirrusatlantic`, UUID `44444444-4444-4444-8444-444444444444`.
- Product `business_partner`, target `neon` only.
- Author principal `2c33ecfb-e1e9-4e61-a9f1-a38ef8cd0d25`.
- Publisher principal `e545079f-4992-4f2e-bc92-8038a8dd9a22`.

Platform-authority workload principal rows already exist and are active in Studio:

- Authority tenant `athyper`: `11111111-1111-4111-8111-111111111111`.
- `dev.metadata.author`: `cc0812fb-0873-456c-8236-9d31fb539ea5`.
- `dev.metadata.publisher`: `c0febdd1-491c-46b8-8113-160be767b88d`.

Principal existence does not prove effective grants, authenticated workload sessions
or policy enrollment. Mount inspection does not directly inspect application memory.
The API and worker remain multi-tenant services: **do not repoint ordinary request
tenant context**. Publication needs its own explicitly scoped workload configuration.

## Source wiring observation

The worker path is `processes/worker/index.ts` → `kernel/bootstrap.ts` →
`loadHostModule(..., "compatibility.services")` → `registerServices`.
Bootstrap currently passes only the conditional `entityAuthorizationReleaseReview`
dependency. `registerServices` accepts `compiledRuntimePublication` and can forward
it to `KyselyPublicationAuthorityWork`, but bootstrap does not supply it.
This is a source-code observation, not inferred from entrypoint size or Compose alone.

## Next implementation boundary

1. Wire scoped platform publication workloads without changing tenant-serving identity.
2. Supply the concrete split-artifact compilation and qualification adapter through
   the actual bootstrap/module injection chain; verify independently.
3. Recheck the canonical draft pins, then enroll the applicable DEV policy through
   authenticated independent actors. Retain original draft-maker identity; do not
   rewrite provenance to satisfy source checks.
4. Publish and verify target-specific receipts, activation and runtime behavior.

No enrollment, release, activation or Country manual-test readiness is claimed here.
No full package typecheck/test suite was rerun for this read-only operational inventory.
