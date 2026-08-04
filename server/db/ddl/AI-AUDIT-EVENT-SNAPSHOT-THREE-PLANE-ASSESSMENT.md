# AI, audit, event, and snapshot three-plane DDL assessment

Date: 2026-08-01

## Executive decision

The new DDL layer correctly treats most `ai`, `audit`, `event`, and `snapshot`
contracts as common desired state for Athyper Admin, Neon, and Mesh. It is not
correct, however, to classify every table in these schemas as common.

The recommended ownership rule is:

- Keep the canonical `ai`, `audit`, and operational `event` contracts in
  `common`.
- Keep `ai.atlas_support_session` in the Athyper Admin plane because it is an
  Admin support-session authority.
- Move the byte-identical `snapshot.template_version` and
  `snapshot.content_item_version` contracts, including their supporting DDL
  phases, from the three plane folders into `common/snapshot`.
- Keep `snapshot.compiled_artifact` in Athyper Admin and
  `snapshot.bom`/`snapshot.bom_component` in Neon unless a separate product
  decision makes those capabilities available in the other planes.
- Do not retire the legacy top-level `event` and `snapshot` DDL based only on
  this folder split. Seventeen legacy event table names and eight legacy
  snapshot table names have no exact-name table in the new layer and need an
  explicit migrate, rename, replace, or retire decision.

Overall status: **conditionally acceptable, not yet ready for legacy
contraction**.

## Scope and method

This is a repository desired-state assessment. It compares:

- `server/db/ddl/common`
- `server/db/ddl/planes/athyper` (Athyper Admin)
- `server/db/ddl/planes/neon`
- `server/db/ddl/planes/mesh`
- the legacy top-level `server/db/ddl/event` and `server/db/ddl/snapshot`
  table files
- the common and three plane manifests

It inventories `CREATE TABLE` statements, checks exact file hashes for the
three snapshot implementations, reviews manifest inclusion, and runs the
available repository verification and foundation dry run. It does not compare
live database catalogs or row data.

## Current ownership matrix

| Schema | Common ownership | Athyper Admin overlay | Neon overlay | Mesh overlay | Assessment |
|---|---|---|---|---|---|
| `ai` | 21 logical tables plus the `ai_call_transcript_default` partition | `atlas_support_session` | None | None | Correct split |
| `audit` | Four evidence tables, three default partitions, plus `master.audit_reason_code` maintained by the audit pack | None | None | None | Common and contract-verified |
| `event` | Six operational governance tables | None | None | None | Common, but legacy disposition is incomplete |
| `snapshot` | `entity_snapshot_identity`, `entity_snapshot` | `template_version`, `content_item_version`, `compiled_artifact` | `template_version`, `content_item_version`, `bom`, `bom_component` | `template_version`, `content_item_version` | Two common contracts are duplicated across planes |

The `.gitkeep` files under each plane's `audit` and `event` directory correctly
indicate that no plane overlay currently exists. Neon and Mesh do not have an
`ai` overlay directory; that is structurally harmless because their manifests
load the common AI pack directly.

## Table inventory

### Common AI pack

The common AI table file defines:

- Policy and configuration: `ai_action_policy`, `ai_confidence_threshold`,
  `ai_drift_baseline`, `atlas_conversation_retention_policy`,
  `atlas_tenant_provider_credential`,
  `atlas_tenant_provider_credential_epoch`
- Governed execution and metering: `ai_tool_invocation`, `atlas_run`,
  `ai_agent_call`, `ai_agent_run`
- Logs: `ai_calibration_log`, `ai_call_transcript` and its default partition,
  `ai_feedback_log`, `ai_inference_log`, `ai_monitoring_log`
- Knowledge and conversations: `atlas_knowledge_chunk`,
  `atlas_knowledge_revision`, `atlas_knowledge_source`, `atlas_message`,
  `atlas_thread`

Athyper Admin adds only `atlas_support_session`. Its contract is explicitly a
server-only Admin support session, so it should remain plane-owned. The common
tables already carry a `plane` field where one shared contract must distinguish
Admin, Neon, and Mesh activity.

### Common audit pack

The common audit pack owns these logical evidence relations:

- `audit.audit_log`
- `audit.authorization_decision_evidence`
- `audit.security_event`
- `audit.hash_anchor`

It also creates the three default partitions and owns the supporting
`master.audit_reason_code` catalog. The latter is a cross-schema object inside
the audit pack; this is internally consistent today, but ownership should be
documented because folder ownership and SQL schema ownership differ.

The audit verifier confirms the four locked evidence relations, append-only
guards, forced RLS, grants, tenant foreign keys, sealed domains, telemetry
fields, report indexes, plane-spoofing protection, and exactly-once manifest
inclusion in all three planes.

The target name `master.audit_reason_code` is recommended over the legacy
`master.change_reason_code`, but the cutover is not complete. Nine active
runtime source files still query the legacy table, and none of its six
runtime-required stable seed codes exists in the new seed function. See
[`AUDIT-REASON-CODE-THREE-PLANE-VERIFICATION.md`](AUDIT-REASON-CODE-THREE-PLANE-VERIFICATION.md)
for the verified compatibility assessment and migration recommendation.

The legacy table is already excluded from `common` and all three new plane
folders/manifests. It must remain available only in the legacy database path
until its data, foreign keys, runtime consumers, and retained audit reads have
been migrated. Retirement means a later explicit legacy migration; it does not
mean adding and then dropping the table in each new plane manifest.

### Common event pack

The new common event pack defines:

- `comment_flag`
- `notification_message`
- `notification_delivery`
- `notification_inbox_state`
- `outbox`
- `channel_consent_event`

These are installed from the same files by all three plane manifests. Related
common concepts have intentionally moved to other schemas:

- `connector_instance` and `webhook_subscription` are now in `common/control`.
- `work_item` is now in `common/document`.
- `ai_tool_invocation` and `atlas_run` are now in `common/ai`.

This routing is reasonable, but it does not account for every legacy event
relation.

### Snapshot pack

The new common snapshot core defines:

- `entity_snapshot_identity`
- `entity_snapshot`

All three plane folders then repeat exactly the same files for:

- schema creation
- `template_version`
- `content_item_version`
- base constraints
- base indexes
- base functions
- base triggers
- base RLS
- base grants

The SHA-256 hashes match across Athyper Admin, Neon, and Mesh for every one of
those nine files. This is conclusive repository evidence that these are common
contracts, not three independently designed plane overlays.

The true plane extensions are:

- Athyper Admin: `compiled_artifact`
- Neon: `bom`, `bom_component`
- Mesh: none

## Manifest assessment

Each plane manifest loads the common AI, audit, event, and snapshot phases and
then its applicable overlay phases. The three-plane foundation dry run resolves
all referenced files successfully.

There is one structural inconsistency: `common/_manifest.txt` describes itself
as the common desired-state manifest embedded explicitly in every plane, but it
omits `common/snapshot` entirely. The plane manifests compensate by creating
the snapshot schema from their plane folder and explicitly adding the common
snapshot phases. Consequently:

- the plane builds are currently resolvable;
- `common/_manifest.txt` is not a complete declaration of common desired state;
- snapshot schema ownership is falsely represented as plane-local even though
  the schema bootstrap is byte-identical in all three planes.

The common manifest should become authoritative for the common snapshot schema
and common snapshot contracts, or its header must be changed to state that it
is only a partial reusable manifest.

## Legacy-to-new coverage

### Legacy event schema

The legacy `event/01_tables.sql` defines 26 distinct table names. Nine of those
names exist somewhere in the new layer; several have intentionally moved to
`ai`, `control`, or `document`. Seventeen have no exact-name table definition in
the new common or plane folders:

- `authorization_global_epoch_v2`
- `authorization_invalidation_outbox_v2`
- `authorization_plane_epoch_v2`
- `authorization_tenant_epoch_v2`
- `digest_staging`
- `document_runtime_document_version`
- `document_runtime_event`
- `document_runtime_idempotency`
- `document_runtime_node_version`
- `endpoint`
- `lifecycle_timer_schedule`
- `notification_delivery_claim`
- `notification_delivery_default`
- `orchestration_node`
- `orchestration_run`
- `push_subscription`
- `whatsapp_consent`

Some may be intentionally replaced, consolidated, or retired. Exact-name
absence is not proof of lost capability, but it is a cutover blocker until each
relation has a recorded disposition and runtime consumers are checked.

### Legacy snapshot schema

The legacy `snapshot/01_tables.sql` defines ten distinct table names. Only
`template_version` and `content_item_version` exist by exact name in the new
layer. These eight do not:

- `document_snapshot`
- `document_snapshot_default`
- `entity_compiled`
- `entity_compiled_overlay`
- `entity_plane_compiled`
- `lifecycle_route`
- `lifecycle_version`
- `status_route`

The new `entity_snapshot_identity`/`entity_snapshot` pair and Admin
`compiled_artifact` may replace part of this model, but the mapping is not
one-to-one and no data migration conclusion can be made from DDL names alone.

There is no equivalent legacy top-level `ai` or `audit` schema folder to use as
a symmetric baseline. Two former event relations (`ai_tool_invocation` and
`atlas_run`) are now correctly owned by the common AI pack.

## Risks

| Severity | Finding | Consequence |
|---|---|---|
| High | Seventeen legacy event and eight legacy snapshot names lack an explicit new-layer table match | Runtime or migration functionality can be silently omitted during legacy contraction |
| High | Runtime still depends on `master.change_reason_code`, while the new layer creates `master.audit_reason_code` and omits all six required legacy seed codes | High-risk mutation and restore paths can fail after cutover |
| Medium | Nine byte-identical snapshot files are copied into every plane | Drift can be introduced by editing only one plane; ownership is misleading |
| Medium | `common/_manifest.txt` omits all common snapshot phases | The common manifest is not the authoritative common contract its header claims |
| Medium | Only audit has a dedicated common-contract verifier | AI, event, and snapshot manifest or ownership drift can pass without a focused check |
| Low | `master.audit_reason_code` is physically owned by the common audit folder | Maintainers may edit or relocate it from the wrong ownership boundary |
| Low | `SCHEMA_MAP.md` documents the older runner and layer naming | Repository guidance can send changes into legacy folders |

## Recommended target layout

```text
server/db/ddl/
  common/
    ai/          # all cross-plane AI contracts
    audit/       # all cross-plane evidence contracts
    event/       # cross-plane operational event contracts
    snapshot/    # schema + entity, template, and content snapshots
  planes/
    athyper/
      ai/        # atlas_support_session only
      snapshot/  # compiled_artifact only
    neon/
      snapshot/  # BOM snapshot pack only
    mesh/
      snapshot/  # empty unless a real Mesh-only contract is added
```

## Action plan

1. Create a disposition matrix for every unmatched legacy event and snapshot
   table: `retain`, `move`, `rename`, `replace`, or `retire`, with runtime owner,
   data migration, and rollback evidence.
2. Complete the reason-code migration described in
   `AUDIT-REASON-CODE-THREE-PLANE-VERIFICATION.md`; retain the six stable
   runtime codes and migrate all legacy table consumers before contraction.
3. Consolidate the nine identical base snapshot files into `common/snapshot`.
   Leave only Admin compiled-artifact and Neon BOM phase files in plane folders.
4. Add `common/snapshot/00_schema.sql` and include every common snapshot phase
   exactly once in `common/_manifest.txt` and each plane manifest.
5. Add focused repository verifiers for common AI, event, and snapshot
   contracts. The snapshot verifier should reject byte-identical base contracts
   in multiple plane folders and verify overlay allowlists.
6. Run clean-database builds for all three planes, then compare live catalogs
   for tables, columns, constraints, indexes, triggers, RLS policies, grants,
   partitions, and function dependencies.
7. Only after catalog parity and runtime-consumer checks pass, contract or
   archive the legacy top-level event and snapshot DDL.
8. Update `SCHEMA_MAP.md` to describe the manifest-driven common/plane layout.

## Verification evidence

The following checks passed during this assessment:

- `pnpm --filter @athyper/db run db:verify:common-audit-contract`
  - 38 common audit contract checks passed.
- `pnpm --filter @athyper/db run db:foundation:plan`
  - Athyper Admin, Neon, and Mesh manifests resolved successfully.
  - Dry run only; no SQL was executed.
- SHA-256 comparison of the nine base snapshot files
  - all hashes matched across the three plane folders.

Passing a manifest dry run proves file resolution and ordering, not executable
database correctness. Clean-build and live-catalog comparison remain required.

## Primary evidence files

- [`common/_manifest.txt`](common/_manifest.txt)
- [`planes/athyper/_manifest.txt`](planes/athyper/_manifest.txt)
- [`planes/neon/_manifest.txt`](planes/neon/_manifest.txt)
- [`planes/mesh/_manifest.txt`](planes/mesh/_manifest.txt)
- [`common/ai/03_tables.sql`](common/ai/03_tables.sql)
- [`planes/athyper/ai/03_tables.sql`](planes/athyper/ai/03_tables.sql)
- [`common/audit/03_tables.sql`](common/audit/03_tables.sql)
- [`common/event/03_operational_governance_tables.sql`](common/event/03_operational_governance_tables.sql)
- [`common/snapshot/03_tables.sql`](common/snapshot/03_tables.sql)
- [`planes/athyper/snapshot`](planes/athyper/snapshot)
- [`planes/neon/snapshot`](planes/neon/snapshot)
- [`planes/mesh/snapshot`](planes/mesh/snapshot)
- [`event/01_tables.sql`](event/01_tables.sql)
- [`snapshot/01_tables.sql`](snapshot/01_tables.sql)
