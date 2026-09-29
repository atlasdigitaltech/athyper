# Entity Activity capability — prototype and DDL review

Date: 2026-09-28. Status: source foundation, publication integration, Activity APIs/providers and shared side/full UI implemented and tested locally. The initial authoritative root-history and automatic-capture provider is also implemented locally; see [recording scope and validation](../architecture/application-experience/entity-activity-recording.md). Live publication and acceptance remain pending.

Build sequence, global profile inheritance, permission naming, and the initial shared-reference enrollment are defined in the [updated implementation plan](../architecture/application-experience/entity-activity-implementation-plan.md). That plan accounts for Country's read-only storage and absent record-version field; it supersedes generic assumptions about enabling Versions or automatic capture for the first entity.

Reviewed prototype: `/home/chandravel_natarajan/work/experiments/entity-activity-versions-audit-v2.html`.

Scope: scanned the 502-file canonical DDL tree across common, Studio, Neon, and Mesh for audit, history, versions, revisions, and snapshots; inspected the relevant table definitions, snapshot constraints/functions/triggers/RLS/grants, audit contracts and indexes, and existing services. Also searched the migration directory for related changes. This is a capability-focused source review, not a line-by-line certification of every SQL file or verification of a deployed database. The working tree contains substantial ongoing work; this review describes its current contents.

**Agreed initial scope:** Activity contains Audit log, Versions, and Saved snapshots. Generic Revisions is excluded. The footer's Record information presents current record metadata, with authorized technical details collapsed. Business revision history is a separate, entity-specific extension requiring a clear domain need. Start with Audit log and snapshot browsing/comparison. Evidence and Requests remain parked, including the prototype's request-grouped timeline and request-based restore flow.

## 1. Define the three Activity views

| View | Meaning | Current source | Readiness |
| --- | --- | --- | --- |
| Audit log | What happened, when, by whom, with which outcome | `audit.audit_log`; reason/event contracts | Strong storage foundation; record-scoped UI/API integration and field authorization still required |
| Versions | Committed record state changes, where an authoritative version history exists | Entity `record_version` / `row_version`; domain mutation records; snapshot `source_record_version` | Partial. A concurrency counter alone is not a historical ledger |
| Saved snapshots | Persisted, immutable copies of captured record data | `snapshot.entity_snapshot_identity` + `snapshot.entity_snapshot` | Storage and capture/get/compare APIs exist; listing and product integration needed |

Keep these identifiers distinct:

- **Record version:** the source entity's concurrency value. It may be absent and does not necessarily track changes to related records.
- **Snapshot number:** `entity_snapshot_identity.version_number`, allocated sequentially within that entity's capture chain.
- **Business revision number:** a domain's revision sequence, outside the initial generic Activity scope. Studio authoring checkpoint numbers remain in authoring tools.
- **Contract version/hash:** the schema used to interpret data; not a business record version.

For example, the third captured snapshot can refer to record version 9. Another manual capture may also refer to record version 9. Display “Snapshot 3 · Record version 9,” not “v3.” Never manufacture missing version rows from the current counter.

## 2. Feedback on the v2 prototype

Keep the record header, visible timezone, read-only detail, before/after comparison, actor labels, and clear saved-copy availability. The overall desktop hierarchy is useful. The prototype also includes keyboard navigation for its tabs.

The following changes are required before treating it as an implementation specification:

| Priority | Prototype assumption | Recommended correction |
| --- | --- | --- |
| P1 | Root record versions advance for address/contact changes | Only show a root version transition if its owning write path records one. Related rows have separate identities and may have independent version counters |
| P1 | Every committed change has a discoverable version row | Explicitly model history coverage. Snapshot rows alone do not establish a complete committed-version ledger |
| P1 | An absent saved copy means the change was outside saved sections | Use “No saved snapshot available.” Missing capture, permissions, retention, legacy history, or unavailable payloads cannot be distinguished without supporting data |
| P1 | `root_entity_*`, `entity_version_before/after`, `causation_id`, `visibility`, and `row_hash` exist on audit rows | These are proposed fields in the prototype, not columns in current `audit.audit_log`. Treat them as optional, provenance-backed read-model fields or future schema changes |
| P1 | “Audit chain verified” applies to the whole record | Anchors cover specific relation/tenant/plane/time windows. An anchor's existence is not a completed verification. Show scope, checked time, and coverage only when a result supports the claim |
| P1 | Restoring selected values creates a draft request | Existing restore directly invokes the normal record patch service. It does not implement this draft-request workflow or selected-field request payload. Remove the action while Requests is parked |
| P1 | “Include restricted events” is a client toggle over all events | Authorize on the server before returning rows, values, search matches, or counts. A UI toggle may only filter already-authorized data |
| P2 | “Compare with current” compares against the newest saved copy | Label that action “Compare with latest snapshot.” Live-current comparison needs a fresh authorized record read and an explicit concurrency value |
| P2 | Missing/hidden fields behave like removed fields | Distinguish absent, null, not captured, and withheld. Compare only interpretable, authorized fields; report coverage differences |
| P2 | All audit changes have old/new values or stored fingerprints | Audit capture modes include metadata-only and changed-fields-only. Show values only when recorded and authorized; masking is not proof that a fingerprint was stored |
| P2 | Fixture values match DDL enums | `governed_change` is not a capture kind; use an allowed kind such as `version` or `amendment`. UI “Failed” must map explicitly to `failure`/`error`; DDL also permits `partial` and `unknown`. Reason codes use lowercase identifiers |

The current JavaScript comparison iterates only the older snapshot's keys, missing fields added in the newer snapshot, and uses shallow inequality for values. Production comparison should use the existing service as a starting point and add schema/coverage handling. Keep lifecycle transitions out of generic historical-value restoration.

## 3. Initial interaction design

Use one **Activity** entry on entity detail with these subviews:

1. **Audit log** — default view. Date range, actor, event/operation, and outcome filters; latest first. Columns: Occurred, Event, Actor, Outcome, Changed fields. Open a plain event-detail panel with authorized before/after values and reason. Keep technical identifiers collapsed. No Evidence or Request navigation in this phase.
2. **Versions** — supported entities only. Columns: Record version, Committed at, Changed by, Change summary, Available snapshots. Historical states open read-only. A missing snapshot prevents state comparison but need not prevent viewing an authoritative change summary. Label incomplete history explicitly.
3. **Saved snapshots** — columns: Snapshot number, Source record version, Captured at/by, Capture kind, Coverage. Actions: View, Compare two, and permission-gated Save snapshot. Start with immutable, automatically identified captures; user naming/pinning is a separate extension.

Use “Latest captured” rather than “Current” on snapshots. For Business Partner, initially enable Audit log and Saved snapshots; enable Versions only for verified capture/mutation coverage. Do not show Studio definition revisions as revisions of an individual partner.

Hide unsupported subviews instead of presenting misleading empty history. Within supported views distinguish loading, no recorded history, no filter matches, access unavailable, and historical payload unavailable. Reset data, selection, and in-flight requests on tenant, plane, principal, authorization epoch, or record changes. Keep compare selection across pages only for the same authorized record and clear it when authorization changes.

For the first release, omit the request-centric Timeline, restore proposals, evidence drill-down, integrity verification controls, and export controls. This does not disable underlying audit capture or discard references needed by future views. A later timeline can be another presentation of the same authorized activity projection.

### Footer: Record information

Use the footer's **Record information** tab for the current record's metadata. Activity provides history; the footer provides a concise current reference and must not become another history browser.

| Visible by default | Collapsed Technical details, where authorized |
| --- | --- |
| Record number/code | Internal record ID |
| Created by / created at | Entity definition or release reference |
| Last updated by / updated at | Contract/schema reference |
| Current record version, where supported | Diagnostic identifiers with a defined record context |

Use friendly labels and only fields supplied by an authoritative provider. Omit unsupported metadata; do not substitute snapshot numbers for the current record version. Identify a definition/release reference as the current runtime definition unless provenance explicitly establishes the definition used for a historical operation. Technical details are permission-controlled, and **Copy details** copies only authorized displayed metadata. Apply the same record-switching and authorization reset rules as Activity.

Do not expose Studio revision history, draft-save counters, or hash chains to business users through this footer. Technical authoring history stays in Studio. A business concept such as “Contract revision 3” or “Statement of work amendment 2” may justify a specifically named history view in that entity's workflow, separately scoped from generic Activity.

## 4. DDL and API implications

### Audit log

`audit.audit_log` is plane-local and time-partitioned, with primary key `(occurred_at, id)`. It already has entity identity, actor, operation/outcome, reason, optional old/new values, changed fields, correlation, request ID, and timestamps. Existing indexes support entity/time queries.

Reuse `createAuditGovernanceService().entityTimeline()` / `.query()` for its date-range, pagination, and `audit.event.query` permission foundations. These methods do not themselves establish the underlying record and historical-field read permissions needed by the entity UI. Add that authorization/projection boundary and qualify its storage adapter and host route wiring.

Resolve entity type from the published descriptor; do not trust arbitrary browser-supplied storage names. Scope by plane, tenant, entity type and record ID. Use stable `(occurred_at, id)` pagination, an explicit upper time bound, and tenant/record-bound cursors. Consider appending `id DESC` to the entity/time index after query-plan measurement.

Related-record activity requires declared ownership relations. Correlation IDs are useful grouping hints, not proof of parent identity or causation. Begin with direct-record events; add address/contact/role providers only when ownership and authorization can be established. Do not indiscriminately join all audit/security tables into a business user's feed.

### Versions

The generic snapshot chain is linear and immutable; its counter increments per capture. `source_record_version` is nullable. Business Partner mutation evidence contains `expected_version` and `resulting_version`, but it is domain-specific and does not prove every child edit increments the parent counter.

If complete Versions history is a product requirement, add a durable record-version header through each owning write transaction. Proposed coordinates: tenant, entity type, entity ID, source version; include committed time/actor and an audit locator. Allow zero or multiple snapshot associations. Capture success and history persistence must have defined transactional guarantees. Do not backfill assumed states from counters or incomplete audit deltas.

### Revision sources retained for domain context — outside initial scope

The following DDL sources explain why technical authoring revisions and business revisions must remain separate. Their existence does not require a generic Revisions tab or provider in the initial Activity capability:

- Studio `snapshot.entity_contract_revision`: immutable checkpoints scoped to a metadata change set, with parent hashes and changed paths.
- Studio `snapshot.entity_draft_save`: saved/previous authoring graphs keyed by change set and lock version.
- Studio `snapshot.business_partner_definition_revision`: versioned definition bundles, explicitly excluding partner instance data.
- Neon `document.contingent_work_order_revision` and `document.statement_of_work_revision`: domain terms, approval/effective status, and prior revision references.
- Other specialized revisions, including onboarding, comments, Mesh catalog, and AI knowledge: remain owned by those domains rather than becoming generic business-record revisions.

No generic revision table, Revisions tab, or revision-provider integration is included in the initial scope. Introduce business revision history only for an entity with a clear domain requirement, preserving its approval, effective-date, and revision semantics. An unapproved business revision is not a committed record version. Studio technical checkpoints remain in authoring tools; only useful current definition references belong in the footer's authorized technical details.

### Saved snapshots

Reuse the identity/payload tables, predecessor constraints, hash validation, immutable triggers, tenant RLS, and capture functions. The existing records routes provide capture, get-by-ID, comparison, and restore. They do **not** provide a per-record paginated listing route in the reviewed module. Add that listing and expose it through the entity capability boundary.

The capture service snapshots the caller's authorized record projection. This is not automatically a full aggregate backup. Persist a coverage manifest for future captures: payload schema/contract, captured field paths, included relations, and completeness category. Design coverage metadata so it does not reveal restricted field names. For old snapshots without a manifest, report unknown coverage; do not infer completeness.

Snapshots currently have no generic name, description, bookmark owner, or pinning fields. If “saved” means a named user bookmark, add a separate tenant-scoped annotation/bookmark table referencing `(tenant_id, snapshot_id)`, with owner/visibility, label, timestamps, and authorization. Preserve immutable snapshot headers/payloads. Removing a bookmark must not delete history. Decide whether repeated saves reuse an existing capture or create a new one; the repository has replay behavior, so clicks do not necessarily equal new snapshot numbers.

The stored hash includes coordinates and predecessor evidence, not just the payload. Equal record contents at different captures need not have equal hashes. Snapshot `audit_event_id` is optional and has no audit FK; resolve links with plane/tenant and event-time provenance where available, and handle absent or no-longer-available audit events without breaking snapshot reads.

Comparison must require the same record and current field authorization on both sides. Detect incompatible contracts and differing coverage. Existing comparison checks record identity but does not establish historical schema compatibility. Restore already requires a matching contract and uses normal patch validation/concurrency; leave it out of the initial UI.

### Capability publication

The reviewed profile contract and generic detail collaboration component currently specialize in Comments and Attachments. Activity needs an explicit published capability contract, server read providers, authorization, descriptor/client support, and entity-detail integration. It is not enabled simply by adding a tab label.

Suggested capability settings, subject to contract design: enabled views limited initially to Audit log, Versions, and Saved snapshots; provider references, direct/related-record scope, history coverage, capture policy, permitted actions, and comparison support. Resolve effective actions on the server. Record information is a footer surface, not a fourth Activity view. Do not require revision providers for Activity. Keep Evidence and Requests disabled without requiring a provider for either.

## 5. Delivery order and acceptance criteria

**First slice:** capability contract and authorized Audit log; per-record snapshot listing, read-only snapshot view, and comparison; footer Record information with authorized current metadata and collapsed technical details. No core history-table replacement required.

**Second slice:** manual capture with explicit coverage; optional named bookmarks; authoritative Versions projection for supported entities.

**Third slice:** related-record history where ownership and authorization are established. Business revision history requires a separately scoped entity requirement; it is not a generic Activity deliverable. Evidence and Requests remain parked until separately scoped.

Before shipping, verify tenant/plane isolation, record and field denials, unauthorized counts/search results, stable pagination, capture replay/concurrency, nullable source versions, two snapshots of one record version, absent payloads, schema drift, missing-versus-null comparisons, and record switching. Qualify actual deployed grants and provider registrations; DDL presence alone is not runtime readiness.

Confirm that Activity exposes only the three agreed view types, with unsupported views hidden. Verify that footer metadata belongs to the current record, technical details and copied values respect authorization, and neither Studio checkpoints nor snapshot numbers are presented as the current business record version.

Prototype checks performed: rendered at desktop width; switched tabs; selected two saved copies and opened comparison; opened Audit log. No JavaScript page errors occurred in that smoke check. At a 390px viewport the document width remained 390px. This was not a full accessibility or mobile usability audit.

## Source references

- [Audit tables](../../server/db/ddl/common/audit/03_tables.sql), [domains](../../server/db/ddl/common/audit/02_domains.sql), [indexes](../../server/db/ddl/common/audit/06_indexes.sql), [write validation](../../server/db/ddl/common/audit/07_functions.sql).
- [Snapshot tables](../../server/db/ddl/common/snapshot/03_tables.sql), [functions](../../server/db/ddl/common/snapshot/07_functions.sql), [constraints](../../server/db/ddl/common/snapshot/05_constraints.sql), [RLS](../../server/db/ddl/common/snapshot/10_rls.sql), [grants](../../server/db/ddl/common/snapshot/11_grants.sql).
- [Studio snapshot/revision tables](../../server/db/ddl/planes/studio/snapshot/03_tables.sql), [Neon document revisions](../../server/db/ddl/planes/neon/document/03_tables.sql), [Neon mutation evidence](../../server/db/ddl/planes/neon/control/03_tables.sql).
- [Snapshot routes](../../server/packages/services/records/src/snapshots/snapshot-routes.ts), [service](../../server/packages/services/records/src/snapshots/snapshot-service.ts), [repository](../../server/packages/services/records/src/snapshots/kysely-snapshot-repository.ts).
- [Audit governance service](../../server/packages/platform/audit/src/governance-service.ts), [capability profiles](../../server/packages/contracts/publication/src/capability-profile.ts), [detail collaboration integration](../../packages/platform/entity/runtime/form-detail/src/detail-collaboration.tsx).

## Adapter and DEV rollout follow-up

Aggregate/domain recording registrations and hard/soft-delete tombstones are implemented and PostgreSQL-verified. DEV schema/catalog and runtime rollout are complete; Country remains read-only on release 8 pending authenticated proposal and independent approval of its prepared Activity successor. See the [rollout evidence and manual testing plan](../reports/entity-activity-rollout-20260928.md). Direct SQL edits can test manual snapshot comparison after publication, but bypass authoritative Versions and automatic capture.

Publication follow-up: Country release 9 is active on all three DEV planes, with verified signatures and Audit Log/Saved Snapshots bindings. Shared Activity browser relay registration was corrected and validated. Application manual acceptance remains with the user; Country is still read-only.
