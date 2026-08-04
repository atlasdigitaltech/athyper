# Non-Entity DDL freeze

Status: frozen for Entity-wave work on 2026-08-01.

This baseline covers desired-state schema objects only. Seeds, generated clients,
live-data migration, and application runtime SQL are outside this freeze.

## Authoritative manifests

- `planes/athyper/_manifest.txt`
- `planes/neon/_manifest.txt`
- `planes/mesh/_manifest.txt`

The manifests and their referenced SQL are the authority. Legacy schema folders
are comparison inputs only and must not be reintroduced without an ownership
decision.

## Fresh-build baseline

Counts exclude physical child partitions and `public.schema_provisions`. They are
whole-manifest regression counts (including the current Entity baseline); the
freeze itself applies only to non-Entity ownership and contracts.

| Plane | Base/partitioned tables | Document tables | Tenant tables with forced RLS and policy |
|---|---:|---:|---:|
| Athyper | 161 | 14 | 129/129 |
| Neon | 421 | 110 | 385/385 |
| Mesh | 190 | 14 | 149/149 |

Every frozen table has a primary key. All constraints are validated, all direct
triggers are enabled, and all tenant tables have enabled and forced RLS with at
least one policy. Partition-parent indexes must be valid.

The three manifests were rebuilt independently on PostgreSQL 16.13 at freeze
time. Catalog verification returned zero invalid indexes, zero unvalidated
constraints, zero disabled user triggers, zero tenant-RLS gaps, and zero
invoker functions without an explicit `search_path`.

## Locked ownership decisions

- `audit.audit_log` is the canonical business/security evidence ledger in every plane.
- `ops.job_execution` replaces legacy job logs in every plane.
- `event.command_execution` replaces legacy `document.command_log`.
- `event.descriptor_invalidation_outbox` owns descriptor-cache delivery state.
- `document.render_output` owns render execution, retry, failure, and replay state.
- `ledger.cross_book_posting_execution` owns cross-book posting derivation/idempotency.
- `document.import_request_chunk` and `document.policy_acknowledgment` remain Neon-owned.
- Mesh alone owns `control.routing_rule`, `control.retention_policy`,
  `control.quota_policy`, and `ops.reference_sync_checkpoint`.
- Athyper alone owns `runtime_meta.mfa_credential_projection`,
  `control.workflow_sla_policy`, and `control.bank_format_rule`.
- `master.contact_person` and `master.contact_person_role` are a reusable Common
  slice installed only in Neon and Mesh; Athyper has no party-contact requirement.

## Intentional transitional exceptions

- `control.webhook_subscription` is administrative truth while
  `event.webhook_subscription` is the delivery projection. Removal waits for the
  separately scoped runtime cutover.
- `governance.channel_consent` is a derived projection. Actor evidence is held by
  `event.channel_consent_event`, so the projection deliberately stamps only
  `updated_at`.
- `runtime_meta` counters and epochs are mutable system state, not business history;
  their update actor is still paired with the update timestamp.

## Forbidden legacy relations

The Entity wave must not restore these retired names:

- `log.audit_log`, `log.activity_log`, `log.entity_lifecycle_log`,
  `log.attachment_access_log`, `log.workflow_event_log`
- `log.audit_dlq`, `log.render_dlq`, `log.descriptor_cache_invalidation`, `log.job_log`
- `document.command_log`, `document.render_job`, `document.doc_attachment`,
  `document.invoice_tax_snapshot`, `document.book_posting_derivation`
- `control.policy_rule_version`, `control.setup_workspace`, `control.setup_domain`
- `control.transaction_event_catalog`, `control.transaction_flow_template`
- `control.finance_posting_rollout_policy`, `control.posting_role_alias`
- `mesh_control.reference_sync_state`

Any non-Entity modification after this freeze requires updating this document and
rerunning all three fresh manifests plus the catalog invariants above.
