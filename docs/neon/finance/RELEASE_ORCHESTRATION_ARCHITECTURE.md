# Athyper — Release Orchestration Architecture

> **Version**: 1.0
> **Date**: 2026-03-07
> **Status**: Living Document
> **Scope**: Governed release orchestration (SQL 204-209), BFF runtime, UI components, and audit export

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Model (SQL 204-209)](#2-data-model-sql-204-209)
3. [Lifecycle State Machine](#3-lifecycle-state-machine)
4. [Policy Functions & Gate Enforcement](#4-policy-functions--gate-enforcement)
5. [BFF Runtime Layer](#5-bff-runtime-layer)
6. [UI Components & Hooks](#6-ui-components--hooks)
7. [Audit Export Pipeline](#7-audit-export-pipeline)
8. [Scalability & Performance](#8-scalability--performance)
9. [Security & Immutability](#9-security--immutability)
10. [Cross-References](#10-cross-references)

---

## 1. Overview

The Release Orchestration layer governs the end-to-end flow from period close through pack publication, certification, and release to external stakeholders. It enforces 5 policy gates, provides tamper-evident audit trails, and supports supersession with full lineage.

### Design Principles

- **Policy-first**: Every state transition is gate-checked by SQL functions; the BFF layer cannot bypass governance.
- **Immutability**: Decision logs, export logs, and activity tables have no-update/no-delete triggers.
- **MC-4 compliance**: All monetary values are `DECIMAL(18,4)` in SQL, `string` in TypeScript.
- **BFF pattern**: Next.js API routes query DB views/functions via Kysely `sql` template tags. No business logic in UI.
- **Policy echo**: Every command POST returns `{ ok, releaseId, status, message, command, blockers[], warnings[], snapshot? }`.

### Component Flow

```
Period Close (191-205)
  |
  v
Publication Batch (196-206) --> Publication Manifest (206)
  |                                  |
  v                                  v
Pack Certification (197)       Manifest Hash (tamper check)
  |
  v
Pack Release (207)  <-- Assembles all components
  |
  +--> mark_release_ready() --> evaluate_clean_close()
  |
  +--> release_pack() --> 5-gate enforcement
  |
  +--> supersede_pack_release() --> Correction chain
  |
  v
Audit Export (209) --> SHA-256 content hash + export log
```

---

## 2. Data Model (SQL 204-209)

### 2.1 Close Orchestration Layer (204-205)

| Migration | Table/Object | Purpose |
|-----------|-------------|---------|
| 204 | `fin.close_orchestration_snapshot` | Graph-derived intelligence snapshots (critical path, predicted close time, blocker codes) |
| 204 | `fin.close_override` | Task/category/gate override with reason codes, impact amounts, approval lifecycle |
| 205 | `fin.close_risk_rule` | Tenant-configurable risk detection rules (forecast slip, SLA breach, confidence drop) |
| 205 | `fin.close_risk_signal` | Fired risk signals with lifecycle: fired -> acknowledged -> resolved/suppressed |

### 2.2 Publication & Certification Integrity (206)

| Table | Purpose |
|-------|---------|
| `fin.publication_manifest_item` | Per-artifact freeze: type (KPI/PLANNING/STATEMENT), value, version, artifact hash |
| `fin.publication_batch` enrichment | Supersession governance columns, certification binding |
| `fin.pack_distribution` enrichment | Publication batch lineage, artifact hash propagation |

### 2.3 Governed Release Orchestration (207)

| Object | Type | Purpose |
|--------|------|---------|
| `fin.pack_release` | Table | Top-level release coordination. Links pack instance, publication batch, certification, and close run |
| `fin.trg_pack_release_lifecycle()` | Trigger | Guards state transitions: only valid paths allowed |
| `fin.pack_release_activity` | Table | Append-only immutable activity timeline. Auto-emitted on transitions |
| `fin.trg_pack_release_emit_activity()` | Trigger | Emits activity rows on status changes |
| `fin.check_publication_policy()` | Function | Validates batch is PUBLISHED with non-empty manifest |
| `fin.check_certification_policy()` | Function | Validates certification is APPROVED or CERTIFIED |
| `fin.check_distribution_policy()` | Function | Validates distribution readiness |
| `fin.check_supersession_policy()` | Function | Validates supersession prerequisites |
| `fin.evaluate_clean_close()` | Function | Returns `is_clean`, override count/impact, readiness score, disqualification reasons |
| `fin.verify_release_integrity()` | Function | Runs manifest hash, certification, distribution, and override consistency checks |
| `fin.vw_pack_release_dashboard` | View | Dashboard projection with component status summary |
| `fin.vw_pack_audit_chain` | View | Full audit chain: release -> pack -> batch -> cert -> distribution |

### 2.4 Release Operations Runtime (208)

| Function | Returns | Purpose |
|----------|---------|---------|
| `fin.assemble_pack_release()` | `uuid` | Creates release in ASSEMBLING state |
| `fin.mark_release_ready()` | `jsonb` | Evaluates clean close, validates components, transitions to READY |
| `fin.release_pack()` | `jsonb` | **5-gate enforcement**: status=READY, batch=PUBLISHED, cert=APPROVED, exception signoff, integrity |
| `fin.cancel_pack_release()` | `jsonb` | Governed cancellation from ASSEMBLING/READY with reason logging |
| `fin.supersede_pack_release()` | `jsonb` | Creates correction release, marks old as SUPERSEDED, cascades to batch supersession |
| `fin.capture_release_sla()` | `uuid` | Captures stage duration metrics for SLA analytics |

| Table | Purpose |
|-------|---------|
| `fin.release_decision_log` | Immutable decision evidence: command, actor, policy evaluation, result (APPROVED/BLOCKED/DEFERRED) |
| `fin.release_notification_event` | Structured notification handoff (11 event codes, 4 severity levels) |
| `fin.release_sla_snapshot` | Stage duration metrics: close, assembly, certification wait, distribution |

### 2.5 Release Scalability & Governed Export (209)

| Object | Type | Purpose |
|--------|------|---------|
| `fin.mv_release_kpi_summary` | Materialized View | Pre-aggregated KPIs (in-progress, blocked, released, avg hours). Unique index for `REFRESH CONCURRENTLY` |
| `fin.vw_release_timeline` | View | UNION ALL of decision_log + notification_event + activity + close_override. Supports WHERE pushdown |
| `fin.release_export_log` | Table | Immutable export history: content hash, exporter, release state at export time |
| `fin.log_release_export()` | Function | Records export, snapshots release state, returns export_id |

---

## 3. Lifecycle State Machine

```
                    +---------------+
                    |  ASSEMBLING   |
                    +-------+-------+
                            |
                    mark_release_ready()
                    [evaluate_clean_close]
                            |
                    +-------v-------+
             +----->|     READY     |<-----+
             |      +-------+-------+      |
             |              |              |
     cancel_pack_release()  |      exception_signoff()
             |              |              |
     +-------v-------+     |      +-------+-------+
     |   CANCELLED   |     |      |  (stays READY) |
     +---------------+  release_pack()    +---------+
                        [5 gates]
                            |
                    +-------v-------+
                    |   RELEASED    |
                    +-------+-------+
                            |
                    supersede_pack_release()
                            |
                    +-------v-------+
                    |  SUPERSEDED   |
                    +---------------+
```

**Valid transitions:**
- ASSEMBLING -> READY (via `mark_release_ready`)
- ASSEMBLING -> CANCELLED (via `cancel_pack_release`)
- READY -> RELEASED (via `release_pack`, 5 gates must pass)
- READY -> CANCELLED (via `cancel_pack_release`)
- RELEASED -> SUPERSEDED (via `supersede_pack_release`)

**Terminal states:** RELEASED, SUPERSEDED, CANCELLED

---

## 4. Policy Functions & Gate Enforcement

### 4.1 Clean Close Evaluation (`fin.evaluate_clean_close`)

Called during `mark_release_ready()`. Evaluates whether the close run qualifies as "clean":

| Check | Threshold (policy-configurable) |
|-------|-------------------------------|
| Override count | `policy.max_overrides_for_clean_close` (default: 0) |
| Override impact | `policy.max_override_impact_for_clean_close` (default: 0) |
| Readiness score | `policy.min_readiness_for_clean_close` (default: 100%) |

Returns: `{ is_clean, override_count, override_impact_total, readiness_score, requires_exception_signoff, disqualification_reasons[] }`

### 4.2 Release Gates (`fin.release_pack`)

All 5 gates must pass for a release to proceed:

| Gate | Check | Failure Mode |
|------|-------|-------------|
| 1. Status | `pack_release.status = 'READY'` | BLOCKED |
| 2. Publication | `publication_batch.status = 'PUBLISHED'` | BLOCKED |
| 3. Certification | `pack_certification.status IN ('APPROVED', 'CERTIFIED')` | BLOCKED |
| 4. Exception signoff | If `requires_exception_signoff`, must have `exception_signoff_by` | BLOCKED |
| 5. Integrity | `fin.verify_release_integrity()` must pass | BLOCKED |

### 4.3 Integrity Verification (`fin.verify_release_integrity`)

| Check | What it validates |
|-------|------------------|
| Manifest hash | Publication manifest item hashes match stored batch hash |
| Certification validity | Certification not invalidated or expired |
| Distribution consistency | No orphaned distributions |
| Override consistency | Active overrides reconcile with close run |

---

## 5. BFF Runtime Layer

### 5.1 Route: `/api/fin/releases`

Single BFF route handling all release operations via query parameter dispatch.

**File:** `products/neon/apps/web/app/api/fin/releases/route.ts`

#### GET Views (14 endpoints)

| `view=` parameter | Source | Description |
|-------------------|--------|-------------|
| `dashboard` | `fin.vw_pack_release_dashboard` | All releases with component status summary |
| `detail` | `fin.pack_release` | Single release with full governance posture |
| `decisions` | `fin.release_decision_log` | Decision audit trail for a release |
| `notifications` | `fin.release_notification_event` | Notification events for a release |
| `sla` | `fin.release_sla_snapshot` | SLA metrics for a release |
| `overrides` | `fin.close_override` | Close overrides linked via close_run_id |
| `manifest` | `fin.publication_manifest_item` | Publication manifest items |
| `audit-chain` | `fin.vw_pack_audit_chain` | Full audit chain view |
| `timeline` | `fin.vw_release_timeline` | Unified timeline with server-side filters (source, severity, date range, search) |
| `kpis` | `fin.mv_release_kpi_summary` | Pre-aggregated KPIs (matview with live fallback) |
| `audit-package` | Composite | Full audit package with SHA-256 content hash + governed export logging |
| `export-history` | `fin.release_export_log` | Prior exports with state snapshots |
| `preflight` | Composite | Pre-action impact summary |
| `detail-with-panels` | Composite | Detail + decisions + notifications + SLA + overrides + manifest in one call |

#### POST Commands (7 endpoints)

| `command=` parameter | SQL Function | Idempotency |
|---------------------|-------------|------------|
| `assemble` | `fin.assemble_pack_release()` | `correlation_id` check |
| `mark-ready` | `fin.mark_release_ready()` | `correlation_id` check |
| `release` | `fin.release_pack()` | `correlation_id` check |
| `cancel` | `fin.cancel_pack_release()` | `correlation_id` check |
| `supersede` | `fin.supersede_pack_release()` | `correlation_id` check |
| `exception-signoff` | Direct UPDATE + decision log | `correlation_id` check |
| `verify-integrity` | `fin.verify_release_integrity()` | No (read-only) |

**Idempotency**: Client generates `crypto.randomUUID()` as `correlationId`. Server checks `release_decision_log` for existing `correlation_id` before executing.

**Policy echo**: Every POST returns:
```typescript
interface ReleaseCommandResult {
  ok: boolean;
  releaseId: string;
  status: ReleaseStatus;
  message: string;
  command: ReleaseCommand;
  blockers: PolicyBlocker[];
  warnings: PolicyBlocker[];
  snapshot?: ReleaseStatusSnapshot;
  integrity?: IntegrityCheckResult;
  cleanClose?: CleanCloseEvaluation;
}
```

---

## 6. UI Components & Hooks

### 6.1 Components

| Component | File | Purpose |
|-----------|------|---------|
| `ReleaseDashboard` | `components/finance/ReleaseDashboard.tsx` | Control tower: KPI strip + filterable release card list |
| `ReleaseDetail` | `components/finance/ReleaseDetail.tsx` | Tabbed detail: governance posture, decisions, notifications, SLA, overrides, manifest |
| `ReleaseTimeline` | `components/finance/ReleaseTimeline.tsx` | Filterable chronological view (source, severity, date range, search) |
| `ReleaseIntegrity` | `components/finance/ReleaseIntegrity.tsx` | Integrity check results display |
| `ReleasePreflightDialog` | `components/finance/ReleasePreflightDialog.tsx` | Confirmation dialog before destructive actions |

### 6.2 Hooks (`lib/finance/use-releases.ts`)

| Hook | Purpose |
|------|---------|
| `useReleaseDashboard(filters)` | Fetches dashboard view with status/type/year filters |
| `useReleaseDetail(releaseId)` | Fetches single release detail |
| `useReleaseDetailWithPanels(releaseId)` | Composite: detail + decisions + notifications + SLA + overrides + manifest |
| `useReleaseDecisions(releaseId)` | Decision audit trail |
| `useReleaseNotifications(releaseId)` | Notification events |
| `useReleaseSLA(releaseId)` | SLA metrics |
| `useReleaseOverrides(releaseId)` | Close overrides |
| `useReleaseManifest(releaseId)` | Publication manifest |
| `useReleaseAuditChain(entityCode, fy)` | Full audit chain |
| `useReleaseTimeline(releaseId, filters)` | Filtered timeline (server-side WHERE pushdown) |
| `useReleaseKPIs(entityCode, fy)` | Pre-aggregated KPIs |
| `useReleasePreflight(releaseId)` | Pre-action impact summary |
| `useReleaseAuditPackage(releaseId)` | Full audit package for export |
| `useReleaseExportHistory(releaseId)` | Prior export records |

### 6.3 Command Hook (`lib/finance/use-release-commands.ts`)

| Method | Command | Pre-conditions |
|--------|---------|---------------|
| `assemble(input)` | ASSEMBLE | None (creates new release) |
| `markReady(releaseId)` | MARK_READY | Status = ASSEMBLING |
| `release(releaseId)` | RELEASE | Status = READY, 5 gates pass |
| `cancel(releaseId, reason)` | CANCEL | Status = ASSEMBLING or READY |
| `supersede(releaseId, input)` | SUPERSEDE | Status = RELEASED |
| `exceptionSignoff(releaseId, notes)` | EXCEPTION_SIGNOFF | Status = READY, requires_exception_signoff = true |
| `verifyIntegrity(releaseId)` | INTEGRITY_CHECK | Any status (read-only) |

### 6.4 Export Utilities

| Function | File | Purpose |
|----------|------|---------|
| `downloadReleaseAuditPackage(pkg)` | `lib/finance/export-audit-package.ts` | Multi-sheet Excel with 8 sections + governed metadata (Export ID, Content Hash) |
| `downloadStatementXlsx(...)` | `lib/finance/export-xlsx.ts` | Statement export |
| `downloadCsv(...)` | `lib/finance/export-csv.ts` | Generic CSV export |

---

## 7. Audit Export Pipeline

### 7.1 Content Hash Computation

```
1. BFF fetches all 7 sections in parallel (detail, decisions, overrides, manifest, notifications, SLA, timeline)
2. Runs inline integrity check via fin.verify_release_integrity()
3. Assembles canonical payload:
   - All array sections sorted by `id` for reproducibility
   - JSON.stringify with stable key ordering
4. Computes SHA-256 via crypto.subtle.digest()
5. Calls fin.log_release_export() to record:
   - Content hash
   - Release state snapshot (status, clean close, override count, integrity)
   - Exporter identity
6. Returns audit package with exportId + contentHash stamped
```

### 7.2 Export History

Operators can view prior exports via `view=export-history`, which returns:
- Export ID, timestamp, exporter
- Content hash + algorithm
- Release state at export time (status, clean close, override count, integrity valid)
- Export version number

Two exports with matching content hashes prove identical data. Different hashes after a state change prove the audit trail captured the evolution.

---

## 8. Scalability & Performance

| Technique | Implementation |
|-----------|---------------|
| Materialized view | `fin.mv_release_kpi_summary` — pre-aggregated per tenant/entity/year. Refresh via `REFRESH MATERIALIZED VIEW CONCURRENTLY` |
| Live fallback | If matview query fails (not yet refreshed), falls back to live aggregate |
| Server-side filtering | Timeline view uses WHERE pushdown (source, severity, ILIKE search, date range, LIMIT) |
| Parallel fetch | BFF fetches all audit package sections via `Promise.all` |
| Indexed views | Timeline source tables have indexes on `(release_id, created_at DESC)` |

---

## 9. Security & Immutability

| Table | Guards |
|-------|--------|
| `fin.release_decision_log` | `BEFORE UPDATE/DELETE` triggers raise exception |
| `fin.release_export_log` | `BEFORE UPDATE/DELETE` triggers raise exception |
| `fin.pack_release_activity` | `BEFORE UPDATE/DELETE` triggers raise exception |
| `fin.pack_release` | Lifecycle trigger validates state transitions |
| `fin.publication_manifest_item` | Append-only by design (unique constraint on batch + artifact) |

**Idempotency**: All command POSTs accept `correlationId`. Server checks `release_decision_log` for existing correlation before executing, preventing duplicate actions.

**Content integrity**: Audit package exports are SHA-256 hashed with arrays sorted by `id` for canonical ordering. Hash is logged in `release_export_log` for tamper detection.

---

## 10. Cross-References

| Document | Relation |
|----------|---------|
| `FINANCE_FUNCTIONAL_SPECIFICATION.md` | Parent spec — engines 4.14 (Period Close) feeds into release orchestration |
| SQL 191 `period_close_governance.sql` | Close run, close calendar, checklist — upstream of release |
| SQL 196 `management_pack.sql` | Pack definitions and instances — referenced by pack_release |
| SQL 197 `pack_governance.sql` | Certification, distribution, forecast — release prerequisites |
| SQL 199 `period_close_orchestration_graph.sql` | Orchestration graph — feeds close_orchestration_snapshot |
