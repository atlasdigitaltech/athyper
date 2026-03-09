# Release Orchestration — Demo Walkthrough

> **Purpose**: Two end-to-end scenarios demonstrating the governed release lifecycle.
> **Audience**: Product demos, onboarding, QA validation.
> **Date**: 2026-03-07

---

## Prerequisites

- Tenant: `ACME Corp` (entity code `ACME`)
- Fiscal year: 2026, Book: `STAT` (Statutory)
- Period close for P1 (January) and P2 (February) completed
- Pack definitions and KPI definitions seeded
- User roles: `CFO` (releases), `Controller` (certification), `Analyst` (assembly)

---

## Scenario A: January — Clean Close, Smooth Release

This scenario demonstrates the happy path: a clean close with no overrides, straightforward certification, and a governed release.

### Step 1: Assemble Release

**Actor**: Analyst

```
POST /api/fin/releases?command=assemble
{
  "entityCode": "ACME",
  "releaseCode": "ACME-2026-P1-MGMT",
  "releaseName": "January 2026 Management Pack",
  "releaseType": "MANAGEMENT_PACK",
  "fiscalYear": 2026,
  "periodFrom": 1,
  "periodTo": 1,
  "bookCode": "STAT",
  "packInstanceId": "<pack-instance-uuid>",
  "publicationBatchId": "<batch-uuid>",
  "certificationId": "<cert-uuid>",
  "closeRunId": "<close-run-uuid>"
}
```

**Response:**
```json
{
  "ok": true,
  "releaseId": "r-111-...",
  "status": "ASSEMBLING",
  "message": "Release assembled",
  "command": "ASSEMBLE",
  "blockers": [],
  "warnings": []
}
```

**What happens in the database:**
- `fin.pack_release` row created with `status = 'ASSEMBLING'`
- `fin.pack_release_activity` row auto-emitted: `ASSEMBLED`
- `fin.release_decision_log` row: command=ASSEMBLE, result=APPROVED

**UI**: ReleaseDashboard shows new card with amber "Assembling" badge. KPI strip increments "In Progress".

---

### Step 2: Mark Ready

**Actor**: Controller

```
POST /api/fin/releases?command=mark-ready
{ "releaseId": "r-111-..." }
```

**What happens:**
1. `fin.mark_release_ready()` calls `fin.evaluate_clean_close()`
2. January had **zero overrides**, readiness score = **100%**
3. Clean close evaluation: `is_clean = true`, `requires_exception_signoff = false`
4. Status transitions to `READY`

**Response:**
```json
{
  "ok": true,
  "status": "READY",
  "message": "Release marked ready — clean close",
  "blockers": [],
  "warnings": [],
  "cleanClose": {
    "isCleanClose": true,
    "overrideCount": 0,
    "overrideImpactTotal": "0.0000",
    "readinessScore": "100.00",
    "requiresExceptionSignoff": false,
    "failureReasons": []
  }
}
```

**UI**: Card turns blue "Ready". Clean close badge (green shield) appears. No exception signoff banner.

---

### Step 3: Verify Integrity

**Actor**: Controller (optional but recommended before release)

```
POST /api/fin/releases?command=verify-integrity
{ "releaseId": "r-111-..." }
```

**Response:**
```json
{
  "ok": true,
  "integrity": {
    "releaseId": "r-111-...",
    "overallPass": true,
    "checks": [
      { "checkName": "manifest_hash", "passed": true, "detail": "All 12 manifest items verified" },
      { "checkName": "certification_valid", "passed": true, "detail": "Certification APPROVED" },
      { "checkName": "distribution_consistency", "passed": true, "detail": "No orphaned distributions" },
      { "checkName": "override_reconciliation", "passed": true, "detail": "0 overrides, consistent" }
    ]
  }
}
```

**UI**: ReleaseIntegrity component shows 4/4 green checks.

---

### Step 4: Release

**Actor**: CFO

```
POST /api/fin/releases?command=release
{ "releaseId": "r-111-..." }
```

**What happens — 5 gates checked:**
1. Status = READY (pass)
2. Publication batch = PUBLISHED (pass)
3. Certification = APPROVED (pass)
4. Exception signoff not required (pass — clean close)
5. Integrity verification (pass — just verified)

**Response:**
```json
{
  "ok": true,
  "status": "RELEASED",
  "message": "Pack released successfully",
  "blockers": [],
  "warnings": [],
  "snapshot": {
    "status": "RELEASED",
    "isCleanClose": true,
    "overrideCount": 0,
    "readinessScore": "100.00",
    "requiresExceptionSignoff": false,
    "hasExceptionSignoff": false,
    "packStatus": "GENERATED",
    "batchStatus": "PUBLISHED",
    "certificationStatus": "APPROVED",
    "distributionCount": 3
  }
}
```

**Database effects:**
- `fin.pack_release.status` -> `RELEASED`, `released_at` stamped
- `fin.release_decision_log`: command=RELEASE, result=APPROVED, policy_evaluation captures all 5 gates
- `fin.release_notification_event`: event_code=RELEASE_COMPLETED, severity=INFO
- `fin.release_sla_snapshot` captured automatically

**UI**: Card turns green "Released". KPI strip: "Released" count +1, "In Progress" -1.

---

### Step 5: Export Audit Package

**Actor**: CFO or Auditor

```
GET /api/fin/releases?view=audit-package&releaseId=r-111-...
```

**Response includes:**
- Full release summary (8 sections)
- `contentHash`: SHA-256 of canonical payload
- `exportId`: UUID from `fin.release_export_log`

**Client-side**: `downloadReleaseAuditPackage(pkg)` generates multi-sheet Excel:
- Sheet 1: Release Summary (includes Export ID and Content Hash rows)
- Sheet 2: Decision Log (3 entries: ASSEMBLE, MARK_READY, RELEASE)
- Sheet 3: Close Overrides (empty — clean close)
- Sheet 4: Publication Manifest (12 items)
- Sheet 5: Integrity Checks (4/4 PASS)
- Sheet 6: Notifications (1 entry: RELEASE_COMPLETED)
- Sheet 7: SLA Snapshot (all timing metrics)
- Sheet 8: Timeline (chronological merged view)

---

## Scenario B: February — Exception Release with Supersession

This scenario demonstrates the governance guardrails: a non-clean close requiring exception signoff, followed by a post-release error correction via supersession.

### Step 1: Assemble (same as Scenario A)

```
POST /api/fin/releases?command=assemble
{
  "entityCode": "ACME",
  "releaseCode": "ACME-2026-P2-MGMT",
  "releaseName": "February 2026 Management Pack",
  "releaseType": "MANAGEMENT_PACK",
  "fiscalYear": 2026,
  "periodFrom": 2, "periodTo": 2,
  ...
}
```

Status: ASSEMBLING.

---

### Step 2: Mark Ready — Non-Clean Close Detected

February's period close had **2 overrides** totaling **$45,000 impact**:
- Override 1: `IMMATERIAL` / `BELOW_THRESHOLD` — $12,000 accrual timing difference
- Override 2: `EXTERNAL_DELAY` / `VENDOR_DELAY` — $33,000 invoice pending vendor confirmation

```
POST /api/fin/releases?command=mark-ready
{ "releaseId": "r-222-..." }
```

**Response:**
```json
{
  "ok": true,
  "status": "READY",
  "message": "Release marked ready — exception signoff required",
  "blockers": [],
  "warnings": [
    { "code": "NON_CLEAN_CLOSE", "message": "2 overrides with $45,000 impact", "severity": "warning" }
  ],
  "cleanClose": {
    "isCleanClose": false,
    "overrideCount": 2,
    "overrideImpactTotal": "45000.0000",
    "readinessScore": "87.50",
    "requiresExceptionSignoff": true,
    "failureReasons": [
      "Override count (2) exceeds threshold (0)",
      "Override impact ($45,000) exceeds threshold ($0)"
    ]
  }
}
```

**Database effects:**
- `fin.pack_release.requires_exception_signoff = true`, `is_clean_close = false`
- Trigger `trg_release_exception_notification` fires -> inserts notification event:
  - `event_code = 'EXCEPTION_SIGNOFF_REQUIRED'`, `severity = 'HIGH'`

**UI**: Card shows blue "Ready" with red shield "Exception Required" badge. Notification banner appears.

---

### Step 3: Attempt Release — BLOCKED

If someone tries to release without exception signoff:

```
POST /api/fin/releases?command=release
{ "releaseId": "r-222-..." }
```

**Response:**
```json
{
  "ok": false,
  "status": "READY",
  "message": "Release blocked by policy",
  "command": "RELEASE",
  "blockers": [
    { "code": "EXCEPTION_SIGNOFF_MISSING", "message": "Release requires exception signoff (non-clean close)", "severity": "error" }
  ],
  "warnings": []
}
```

**Decision log**: command=RELEASE, result=BLOCKED, policy_evaluation shows gate 4 failure.

**UI**: Error toast: "Release blocked — exception signoff required". Blockers displayed in ReleaseDetail.

---

### Step 4: Exception Signoff

**Actor**: CFO (authorized signoff authority)

```
POST /api/fin/releases?command=exception-signoff
{
  "releaseId": "r-222-...",
  "notes": "Reviewed both overrides. Accrual timing is self-correcting in P3. Vendor delay confirmed immaterial to consolidated position. Approving release with exceptions noted."
}
```

**Response:**
```json
{
  "ok": true,
  "status": "READY",
  "message": "Exception signoff granted"
}
```

**Database effects:**
- `pack_release.exception_signoff_by`, `exception_signoff_at`, `exception_signoff_notes` populated
- Decision log: command=EXCEPTION_SIGNOFF, result=APPROVED
- Notification: event_code=EXCEPTION_SIGNOFF_GRANTED, severity=INFO

**UI**: Exception badge changes from red to amber "Exception Signed Off". Release button becomes enabled.

---

### Step 5: Release (now succeeds)

```
POST /api/fin/releases?command=release
{ "releaseId": "r-222-..." }
```

All 5 gates pass (gate 4 now satisfied by exception signoff). Status -> RELEASED.

**UI**: Card turns green. Snapshot shows `isCleanClose: false`, `overrideCount: 2`.

---

### Step 6: Post-Release Error — Supersession

One week later, the controller discovers that Override 2 (vendor delay) was resolved and the correct amount is $28,000 different. A correction release is needed.

#### 6a. Assemble correction release

```
POST /api/fin/releases?command=assemble
{
  "entityCode": "ACME",
  "releaseCode": "ACME-2026-P2-MGMT-C1",
  "releaseName": "February 2026 Management Pack — Correction 1",
  ...
  "packInstanceId": "<corrected-pack-instance-uuid>",
  "publicationBatchId": "<corrected-batch-uuid>"
}
```

#### 6b. Process correction through mark-ready and release

(Same flow as above — the correction release goes through its own governance gates.)

#### 6c. Supersede original release

```
POST /api/fin/releases?command=supersede
{
  "releaseId": "r-222-...",
  "correctionReleaseCode": "ACME-2026-P2-MGMT-C1",
  "correctionReleaseName": "February 2026 Management Pack — Correction 1",
  "supersessionReason": "Vendor invoice confirmed at revised amount. Override 2 resolved with $28,000 adjustment. Re-published with corrected figures."
}
```

**What happens:**
1. Original release (r-222) -> `SUPERSEDED`, `supersession_reason` populated
2. Correction release linked: `supersedes_id = r-222`
3. Original publication batch superseded (triggers `fin.supersede_publication_batch()`)
4. Certification invalidated on old batch
5. Notification emitted: `RELEASE_SUPERSEDED`, severity=HIGH
6. Decision log captures both releases and reason

**UI effects:**
- Original card: gray "Superseded" with link to correction
- Correction card: green "Released" with "Supersedes: ACME-2026-P2-MGMT" reference
- KPI strip: "Superseded" count +1
- Timeline shows full supersession chain

---

### Step 7: Audit Trail Comparison

Export audit packages for both releases and compare:

| Aspect | Original (r-222) | Correction (r-222-C1) |
|--------|------------------|----------------------|
| Status at export | SUPERSEDED | RELEASED |
| Clean close | No | No |
| Override count | 2 | 1 (override 2 resolved) |
| Override impact | $45,000 | $12,000 |
| Content hash | `a3f2...` | `7b91...` (different — data changed) |
| Supersedes | — | r-222 |

The export history (`view=export-history`) shows both exports with their content hashes, enabling auditors to verify that the correction was properly governed.

---

## Key Governance Observations

1. **Policy gates cannot be bypassed**: The BFF calls SQL functions that enforce all checks server-side.
2. **Every action is logged**: Decision log captures command, actor, policy evaluation, and result — immutable.
3. **Non-clean closes are visible**: Exception signoff requirement surfaces automatically; CFO must explicitly approve.
4. **Supersession preserves lineage**: The original release is never deleted — it transitions to SUPERSEDED with the correction linked.
5. **Content hashes prove integrity**: Different exports of the same data produce identical hashes; changes produce different hashes.
6. **Idempotent commands**: Duplicate POSTs with the same `correlationId` return the existing result instead of re-executing.
