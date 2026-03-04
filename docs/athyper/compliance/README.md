# Audit & Compliance

Athyper provides a comprehensive audit governance system with cryptographic integrity, privacy controls, and compliance features for enterprise deployments.

---

## Audit Architecture

```
Business Logic ──► Resilient Writer ──► Outbox ──► Drain Worker ──► Audit Store
                         │                                              │
                         ├─ Hash Chain                                  ├─ Storage Tiering
                         ├─ Column Encryption                          ├─ Partition Lifecycle
                         ├─ Redaction Pipeline                         └─ Archive Markers
                         └─ DLQ (on failure)
```

The audit system is implemented in `framework/runtime/src/services/platform/audit-governance/` (63 files, 25 tests).

---

## Core Components

### Resilient Audit Writer

File: `domain/resilient-audit-writer.ts`

The entry point for all audit writes. Provides:
- **Write-ahead to outbox**: Events are first written to the audit outbox table, then drained asynchronously
- **Retry with backoff**: Failed writes are retried with exponential backoff
- **DLQ fallback**: Events that fail after all retries go to the Dead Letter Queue
- **Rate limiting**: Per-tenant audit rate limits prevent abuse
- **Load shedding**: Under extreme load, non-critical events can be shed

### Hash Chain

File: `domain/hash-chain.service.ts`

Every audit event is linked to its predecessor via SHA-256 hash chain:

```
Event[n].hash = SHA-256(Event[n].payload + Event[n-1].hash)
```

This provides:
- **Tamper detection**: Any modification to a historical event breaks the chain
- **Integrity verification**: The chain can be verified from any point forward
- **Non-repudiation**: Events cannot be inserted, deleted, or reordered without detection

### Column Encryption

Selected audit columns are encrypted at rest using AES-256-GCM:
- Personally Identifiable Information (PII)
- Financial amounts
- Access tokens (hashed, not stored)

Key rotation is handled by the `auditKeyRotation` worker.

### Redaction Pipeline

File: `domain/redaction-pipeline.ts`

Before audit events are written, sensitive data can be redacted:
- **Pattern-based**: Regex patterns for credit cards, SSNs, emails
- **Field-based**: Specific fields marked for redaction in meta-engine
- **Role-based**: Different redaction levels for different access roles

---

## Outbox Pattern

The audit outbox (`persistence/AuditOutboxRepo.ts`) ensures at-least-once delivery:

```
1. Business operation writes audit event to outbox (same DB transaction)
2. Drain worker polls outbox periodically
3. Events are written to audit store with hash chain
4. Successfully written events are marked as drained
5. Failed events go to DLQ
```

Worker: `jobs/workers/drainAuditOutbox.worker.ts`

---

## Dead Letter Queue (DLQ)

File: `domain/AuditDlqManager.ts`, `persistence/AuditDlqRepo.ts`

Events that fail processing are sent to the DLQ with:
- Original event payload
- Error reason
- Retry count
- Timestamp

Admin API endpoints allow:
- Viewing DLQ contents
- Replaying events from DLQ
- Purging acknowledged events

---

## Storage Tiering

File: `domain/audit-storage-tiering.service.ts`

Audit events move through storage tiers based on age:

| Tier | Age | Storage | Access Speed |
|------|-----|---------|-------------|
| **Hot** | 0–30 days | Primary PostgreSQL | Fast |
| **Warm** | 30–90 days | Partitioned tables | Medium |
| **Cold** | 90+ days | Archive (S3/MinIO) | Slow |

The `auditPartitionLifecycle` worker manages partition creation and retirement.

### Partition Lifecycle

Worker: `jobs/workers/auditPartitionLifecycle.worker.ts`

- Creates new partitions ahead of time (pre-provisioning)
- Detaches old partitions based on retention policy
- Marks detached partitions for archival

### Archive Markers

Repository: `persistence/AuditArchiveMarkerRepo.ts`

Tracks which partitions have been archived to object storage, enabling:
- Verification that no data is lost during archival
- On-demand retrieval of archived data

---

## Compliance Features

### Query Gate

File: `domain/audit-query-gate.ts`

Controls access to audit data:
- Role-based query permissions
- Query complexity limits
- Tenant isolation enforcement
- Slow query detection and logging

### Feature Flags

File: `domain/audit-feature-flags.ts`

Granular control over audit features per tenant:
- Hash chain verification (on/off)
- Column encryption (on/off)
- Redaction level (none/standard/strict)
- Storage tiering policy
- DLQ auto-retry

### Load Shedding

File: `domain/audit-load-shedding.service.ts`

Under extreme load, the audit system can:
- Drop non-critical events (e.g., read events)
- Batch writes more aggressively
- Skip hash chain for low-priority events
- Always preserve security-critical events (auth, access changes)

### Replay Service

File: `domain/audit-replay.service.ts`

Allows replaying audit events from a specific point:
- Rebuild projections from event history
- Verify hash chain integrity
- Export events for compliance reporting

---

## DSAR (Data Subject Access Request)

File: `domain/audit-dsar.service.ts`

Supports GDPR/privacy compliance:
- Export all audit events for a specific user
- Redact user data across audit history
- Generate access reports showing who accessed what data

### Access Reports

File: `domain/audit-access-report.service.ts`

Generates reports showing:
- Who accessed specific records
- When access occurred
- What operations were performed
- From what IP/location

### Explainability

File: `domain/audit-explainability.service.ts`

Provides human-readable explanations for audit events:
- What happened
- Who did it
- Why (linked to business context)
- What was the outcome

---

## UX Features

### Activity Timeline

File: `domain/activity-timeline.service.ts`

Provides a user-facing timeline of activities on entities:
- Recent changes
- Status transitions
- Comments and approvals
- Linked audit events

### Timeline Cache

Cached in Redis for fast rendering of recent activity.

---

## Background Workers

| Worker | File | Schedule | Purpose |
|--------|------|----------|---------|
| Outbox drain | `drainAuditOutbox.worker.ts` | Every 5s | Drain audit outbox to store |
| Partition lifecycle | `auditPartitionLifecycle.worker.ts` | Daily | Create/retire partitions |
| Daily backup | `auditDailyBackup.worker.ts` | Daily | Backup audit data |
| Key rotation | `auditKeyRotation.worker.ts` | Monthly | Rotate encryption keys |
| Archive | `auditArchive.worker.ts` | Weekly | Archive cold data to S3 |
| Retention cleanup | `audit-log-retention.job.ts` | Daily | Enforce retention policies |

---

## Observability

File: `observability/metrics.ts`

Audit-specific metrics:
- `audit_events_written_total` — Total events written
- `audit_events_failed_total` — Failed event writes
- `audit_dlq_depth` — Current DLQ depth
- `audit_outbox_depth` — Current outbox depth
- `audit_hash_chain_verified` — Hash chain verification results
- `audit_encryption_ops` — Encryption/decryption operations

---

## Database Schema (`audit`)

| Table | Purpose |
|-------|---------|
| `audit.events` | Main audit event store (partitioned by month) |
| `audit.outbox` | Write-ahead outbox for at-least-once delivery |
| `audit.dlq` | Dead letter queue for failed events |
| `audit.archive_markers` | Tracks archived partitions |
| `audit.hash_chain_heads` | Current hash chain head per tenant |
| `audit.encryption_keys` | Encryption key metadata (keys in external KMS) |

SQL: `framework/adapters/db/src/sql/090_audit.sql`

---

## Test Coverage (25 tests)

| Test File | Coverage |
|-----------|----------|
| `hash-chain.test.ts` | Hash chain creation, verification, tamper detection |
| `redaction-pipeline.test.ts` | Pattern/field/role-based redaction |
| `column-encryption.test.ts` | AES-256-GCM encrypt/decrypt, key rotation |
| `resilient-audit-writer.test.ts` | Retry, DLQ fallback, rate limiting |
| `audit-dlq.test.ts` | DLQ operations, replay, purge |
| `audit-export.test.ts` | DSAR export, access report generation |
| `audit-integrity.test.ts` | End-to-end integrity verification |
| `audit-rate-limiter.test.ts` | Per-tenant rate limiting |
| `audit-replay.test.ts` | Event replay from checkpoint |
| `audit-load-shedding.test.ts` | Load shedding behavior |
| `storage-tiering.test.ts` | Hot/warm/cold tiering |
| `partition-lifecycle.test.ts` | Partition create/retire/archive |
| `outbox-drain.test.ts` | Outbox polling and draining |
| `timeline-cache.test.ts` | Activity timeline caching |
| `workflow-audit-repository.test.ts` | Workflow audit persistence |
| + 10 more | Feature flags, metrics, query gate, security hardening, etc. |

---

## Related Documentation

- [Security](../security/README.md) — Security hardening, field-level security
- [Architecture](../architecture/README.md) — System architecture overview
- [Runbooks: Audit Go-Live](../runbooks/audit-go-live.md) — Operational procedures
