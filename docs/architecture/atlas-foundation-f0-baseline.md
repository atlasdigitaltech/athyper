# Atlas foundation F0 — reviewed baseline

F0-01 follow-up: the [experience-table reconciliation](../runbooks/atlas-experience-foundation-reconciliation.md)
restores both missing canonical definitions and adds a three-plane forward
migration. The historical observations below remain unchanged.

Reviewed on 2026-09-10, Asia/Kuala_Lumpur. Machine timestamps in receipts are UTC on 2026-09-09. Status: F0 inventory tooling implemented and DEV/QA observations captured. This is an engineering baseline with explicit gaps, not release qualification or approval of a new runtime deployment.

Evidence: [DEV capture](business-partner/evidence/atlas-f0-baseline-dev-20260910.json), [QA capture](business-partner/evidence/atlas-f0-baseline-qa-20260910.json). Both report all probes captured, stable scoped source and API image/start coordinates during collection, and `releaseQualified: false`. Saved-session failures and absent features remain explicit observations.

## Source, deployment and model

The source snapshot includes the current dirty working tree, per-file hashes and its declared scope. Concurrent authorization/DDL work was preserved. Deployed JavaScript hashes are recorded separately; F0 does not claim those images were built from this exact source tree.

| Observation | DEV | QA |
| --- | --- | --- |
| API image ID | `sha256:333a309df25375b268ac664c34877a0a8effbb0b199e4f4d198c4251c50e3df1` | `sha256:6eceee4552c7b4b36096ad303d01b4259a260afe48dccc1764507635dff834a0` |
| API container health | Healthy | Healthy |
| Atlas host switches | Chat, persistence, generation, tools and mutations explicitly `true` | These switches absent from container environment; do not apply current-source defaults as proof of old-build behavior |
| Local-generation module | Present | Absent |
| BP factory exports probed | Three factories construct 13 tool contracts with placeholder owners | Those three exports absent |
| Mounted local model configuration | Matches checked configuration SHA-256 | No mounted local Atlas configuration observed |
| Provider | Ollama 0.33.3; Qwen3 8B manifest matches the pinned digest | No local provider configured by the observed runtime inventory |
| Model residency | Not loaded at observation time; no generation requested | Not applicable |
| Current authenticated browser evidence | All three stored DEV states returned 401 for admission and list-descriptor GETs | GETs reported request unavailable; no authenticated state established |

DEV uses public model `atlas-re-1.0-local`, prompt revision `atlas-local-chat-v3`, context 4,096, maximum output 1,024, thinking disabled and cloud disabled. The source local policy uses `atlas-local-v2:<digest>:tools-<boolean>-mutations-<boolean>`. Recent ledgers retain actual policy revisions. Empty action-policy, threshold and quota-policy tables do not mean these code-level policies, default quota limits, or permission checks are disabled.

Installed DEV adapter packages include Ollama, Redis cache, S3-compatible object storage and Meilisearch. Their entry hashes and supporting container health are recorded. Installation/health alone does not establish that an Atlas request uses each adapter. In particular, local Atlas composition does not establish the full-provider knowledge-service integration merely because its code ships in the image.

## Active definitions and schemas

The inventory uses the activation-head join rather than every descriptor row marked active.

| Plane / target | Observed active definitions |
| --- | --- |
| DEV Neon | BP tenant release 17 and platform release 25; BP request release 3; separate BP case-runtime descriptors |
| DEV Mesh | `network_relationship` release 5 |
| DEV Studio | No descriptors returned by the activation-head join |
| QA Neon | BP release 8 |
| QA Mesh / Studio | No descriptors returned by the activation-head join |

The two DEV BP `entity_runtime` descriptors have ten fields and tenant-directory mode. Both lack published `ai`, `storage.versionField`, and the new `authorization` extension. Their tenant/platform variants are distinct; F0 does not choose one on behalf of a user. Current BP assistance therefore still depends on the explicit legacy BP path. A physical row-version column, content-hash citation and published descriptor version-field binding remain different contracts.

DEV schema inventory covers 96 Studio and 37 Neon/37 Mesh tables in the selected schemas. It finds no missing table declarations from their current foundation manifests, but finds two additional live tables in every plane:

- `ai.atlas_experience_release`
- `runtime_meta.experience_surface_projection`

Neither appears as a create-table declaration in the inspected foundation manifests. The experience-release table is used by current repository code and appears in generated Prisma models. It has no published rows in any DEV plane. This is a concrete fresh-install/live-schema discrepancy, not evidence that a published agent profile is active.

QA lacks `ai.atlas_provider_usage` and `runtime_meta.usage_reservation` in all planes compared with current manifests. Studio additionally lacks the surface-component binding, bank-directory publication/snapshot objects, BP case-contract publication/snapshot objects, case-snapshot lineage and subscription-plan entitlement snapshot listed in the receipt. QA also has neither of the two extra DEV tables. These observations establish an older schema/build level; table presence alone does not determine migration correctness or full object parity.

## BP capability matrix

The deployed factory probe never invokes owners. The following interpretation combines factory contracts, inspected source, and read-only 24-hour ledger aggregates. All user availability remains subject to current context, registry admission, feature/agent policy and owner authorization.

| Capability | Current implementation / owner boundary | Captured execution evidence |
| --- | --- | --- |
| `bp_read_summary` | Records identity projection | 26 completed tool invocations |
| `bp_read_contacts` | Shared section executor with BP360 contacts reader | 8 completed tool invocations |
| `bp_read_addresses` | Shared section executor with BP360 addresses reader | 18 completed tool invocations |
| `bp_read_brief` | BP owner/disclosure projection | 7 completed and 4 failed tool invocations |
| `bp_explain_readiness` | Scoped completeness owner | No invocation in the captured window |
| `bp_check_eligibility` | Scoped transaction eligibility owner | No invocation in the captured window |
| `bp_read_list_insights` | Authorized list population and bounded owner assessments | No invocation in the captured window |
| `bp_explain_case_validation`, `bp_explain_case_diff` | Saved-case owner projection | No invocation in the captured window |
| `bp_submit_case` | Governed proposal/confirmation and owner command | No invocation in the captured window; host mutation flag is not user authorization |
| `bp_read_banking`, `bp_read_certificates`, `bp_read_tax_identifiers` | Current source registers explicit reader-unavailable section responses | No invocation in the captured window; no working data reader claimed |

None of these invocations was created after the observed DEV API start. Therefore the history supports prior execution, not success on the current image. The 13 constructible contracts must not be reported as 13 verified working capabilities. There is no observed published experience-profile allowlist and no direct snapshot of the running process's registry. The default-agent path remains separate from Studio-published agent configuration.

## Errors and evidence reconciliation

The captured DEV Neon durable-run window contains 112 completed, 16 failed with `upstream_error`, two cancelled and two still `started`. The two started rows lack a metering link. F0 does not repair them or infer the underlying provider exception. The terminal ledger also records 14 successful zero-model completions, supporting the earlier direct-read persistence correction. No new terminal run/tool rows were observed since the current API start; this is not a clean-traffic reliability measurement.

The source recovery design checks abandoned runs on later requests. Investigate the two started rows with existing run/recovery tooling before expanding background or distributed execution; do not synthesize completion/usage records. Their presence and age are observations, not a newly proven recovery defect.

Fourteen historical BP/Atlas evidence files were hashed. Eleven do not bind an image by a recognized immutable image-ID field; three bind a different image from current DEV. None was promoted to current qualification. Matching an image alone would still leave descriptor, model, policy, fixture, persona and capability coverage checks outstanding.

## Follow-up register

| ID | Finding / decision | Owner and next step |
| --- | --- | --- |
| F0-01 | Missing canonical definitions for two live experience tables | DB and experience/publication owners: reconcile full live definitions, grants, RLS, indexes and triggers with provenance; restore reviewed foundation definitions and compatible forward migrations before F1 extends this area |
| F0-02 | BP AI semantics not published | Metadata/Studio: migrate through a draft change set and immutable release in F1; preserve absent-v1 hashes and legacy behavior |
| F0-03 | No published experience profiles | Atlas/Studio: explicitly decide the default-agent-to-published-profile transition and validate allowlist behavior; do not auto-publish profiles as an inventory side effect |
| F0-04 | Actual process registry and owner connectivity unobserved | Host/Atlas: add a protected, content-free diagnostic snapshot or qualified composition evidence in F2, distinguishing registered, connected, admitted and unavailable tools |
| F0-05 | Current authenticated qualification unavailable | Existing persona owners/release qualification: obtain a current normal session when executing F6; preserve the current 401/request-unavailable results |
| F0-06 | QA substantially behind DEV/source | Deployment/DB: select and qualify the intended build/migration sequence before using QA as a foundation acceptance target |
| F0-07 | Two started durable runs without metering links | Atlas operations: inspect recovery lifecycle through existing authorized tooling; preserve receipts and idempotency |
| F0-08 | Source and deployment are independently versioned | Build/release: carry exact source, compiled artifacts and deployment provenance into later qualification; a dirty-tree snapshot is not a deployed-source attestation |
| F0-09 | Missing BP descriptor version-field binding | Metadata/Records: decide whether a new published row-version binding is needed; preserve content-hash semantics until explicitly migrated |

The stale `build-common-ai-ddl.mjs` commands were removed from 14 AI DDL headers. They now point to maintained canonical-DDL/additive-migration guidance in the database script README. This change corrects operator guidance only; it does not regenerate SQL or apply migrations.

## Validation and phase handoff

- `pnpm test:atlas-baseline`: seven tests passed, including drift detection, evidence separation, receipt non-promotion and invalid-target rejection.
- DEV and QA capture commands completed with no failed probes; both source and API deployment stability checks passed. Known unavailable GETs/features remain explicit data.
- `pnpm --dir server/db run db:verify:ddl-model`: passed. This validates manifest/static relationships and does not contradict the live table-presence discrepancies.
- `pnpm test:reachability`: passed after refreshing the generated report; 120 root tests, zero excluded legacy tests. The new baseline suite is reachable through `test:operations`.
- Changed-file whitespace checks passed. No runtime deployment, database migration, credential/permission change, business mutation, or provider generation was performed.

F0's repeatable inventory and reviewed handoff are delivered. Full process-registry visibility, authenticated qualification and schema-parity remediation remain explicit follow-up work. Begin F1 with the F0-01 schema reconciliation prerequisite and entity-level semantic contracts; do not treat this baseline as authorization to enable new capabilities.

Use the [collector runbook](../runbooks/atlas-foundation-baseline.md) to reproduce the observations and the [architecture plan](atlas-meta-entity-learning-foundation.md) for F1–F6.
