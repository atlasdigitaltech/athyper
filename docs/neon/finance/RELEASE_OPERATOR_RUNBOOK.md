# Release Orchestration — Operator Runbook

> **Purpose**: Step-by-step procedures for release operators (Controller, CFO, Finance Admin).
> **Date**: 2026-03-07
> **UI Entry Point**: Finance > Releases (ReleaseDashboard)
> **API Base**: `POST /api/fin/releases?command=<cmd>`

---

## Quick Reference

| Operation | Required Status | Command | Actor |
|-----------|----------------|---------|-------|
| Assemble | (new) | `assemble` | Analyst/Controller |
| Mark Ready | ASSEMBLING | `mark-ready` | Controller |
| Exception Signoff | READY + non-clean | `exception-signoff` | CFO |
| Verify Integrity | Any | `verify-integrity` | Any |
| Release | READY (all gates) | `release` | CFO |
| Cancel | ASSEMBLING or READY | `cancel` | Controller/CFO |
| Supersede | RELEASED | `supersede` | CFO |
| Export Audit Package | Any (read-only) | GET `view=audit-package` | Any authorized |

---

## Procedure 1: Assemble a New Release

**When**: Period close is complete, pack is generated, publication batch is finalized.

**Pre-checks**:
- [ ] Close run completed (all tasks satisfied or overridden)
- [ ] Pack instance generated with current data
- [ ] Publication batch status = FINALIZED or PUBLISHED
- [ ] Certification submitted (status = PENDING or higher)

**Steps**:
1. Navigate to **Finance > Releases > New Release**
2. Fill in release details:
   - Release code (convention: `{ENTITY}-{YEAR}-P{PERIOD}-{TYPE}`)
   - Release name (human-readable)
   - Release type: MANAGEMENT_PACK, BOARD_PACK, REGULATORY, AD_HOC, or INTERIM
   - Period range (single period or range)
   - Book code (default: STAT)
3. Link components:
   - Pack instance (required)
   - Publication batch (required)
   - Certification (required)
   - Close run (recommended — enables override/SLA tracking)
4. Click **Assemble**

**Result**: Release created in ASSEMBLING status. Appears on dashboard.

**If blocked**: Check error message. Common issues:
- Missing pack instance ID
- Release code already exists (use a unique code)

---

## Procedure 2: Mark Release Ready

**When**: All components are in their required states.

**Pre-checks**:
- [ ] Publication batch is PUBLISHED (not DRAFT or FINALIZED)
- [ ] Pack instance is generated
- [ ] Certification is submitted

**Steps**:
1. Open the release from the dashboard
2. Review the component status panel:
   - Pack: should show "Generated"
   - Batch: should show "Published"
   - Certification: should show submitted/approved
3. Click **Mark Ready**
4. Review the clean close evaluation in the response:
   - **Clean close**: No further action needed before release
   - **Non-clean close**: Exception signoff will be required (see Procedure 3)

**Result**: Release transitions to READY. Clean close evaluation is stored.

**If non-clean close**: The system automatically:
- Sets `requires_exception_signoff = true`
- Fires `EXCEPTION_SIGNOFF_REQUIRED` notification (HIGH severity)
- Displays exception badge on the release card

---

## Procedure 3: Exception Signoff (Non-Clean Close Only)

**When**: Release is READY but flagged as non-clean close.

**Who**: CFO or authorized signoff authority only.

**Pre-checks**:
- [ ] Review all active overrides and their justifications
- [ ] Understand the total override impact amount
- [ ] Verify the readiness score and disqualification reasons

**Steps**:
1. Open the release detail
2. Review the **Overrides** tab:
   - Examine each override's scope, reason code, and impact amount
   - Verify that override reasons are justified
3. Review the **Clean Close** section:
   - Override count vs. threshold
   - Override impact vs. threshold
   - Readiness score vs. minimum required
   - Specific disqualification reasons
4. Click **Exception Signoff**
5. Enter signoff notes explaining:
   - Why the release is acceptable despite exceptions
   - Any follow-up actions planned for future periods
   - Risk assessment for the exceptions
6. Confirm

**Result**: Exception signoff recorded. Release can now proceed to the Release step.

**Important**: Exception signoff notes are immutable and visible in audit trails. Be thorough and specific.

---

## Procedure 4: Verify Integrity

**When**: Before releasing (recommended), or at any time for audit purposes.

**Steps**:
1. Open the release detail
2. Click **Verify Integrity**
3. Review the 4 integrity checks:
   - **Manifest hash**: Publication manifest items match batch hash
   - **Certification validity**: Certification not invalidated or expired
   - **Distribution consistency**: No orphaned distributions
   - **Override reconciliation**: Active overrides consistent with close run

**Result**: Integrity check results displayed. Decision logged with full check details.

**If any check fails**:
- **Manifest hash failure**: Re-publish the publication batch
- **Certification invalid**: Re-submit certification
- **Distribution inconsistency**: Review distribution records
- **Override mismatch**: Reconcile overrides with close run

---

## Procedure 5: Release

**When**: Release is READY and all gates will pass.

**Pre-checks (the 5 gates)**:
- [ ] Status = READY
- [ ] Publication batch = PUBLISHED
- [ ] Certification = APPROVED or CERTIFIED
- [ ] Exception signoff granted (if required)
- [ ] Integrity verification passes

**Steps**:
1. Open the release detail
2. (Optional) Run Preflight check: reviews impact before committing
3. Click **Release**
4. Review the policy echo response:
   - `blockers[]` should be empty
   - `warnings[]` — review any warnings
   - `snapshot` — verify final state
5. Confirm the release

**Result**: Release transitions to RELEASED. SLA metrics captured. Distributions begin.

**If blocked**: The response shows exactly which gate(s) failed:
- Gate 1 (status): Ensure release is in READY state
- Gate 2 (publication): Publish the batch first
- Gate 3 (certification): Get certification approved
- Gate 4 (exception signoff): Complete exception signoff procedure
- Gate 5 (integrity): Run integrity check and fix failures

---

## Procedure 6: Export Audit Package

**When**: After release (for compliance), or at any status (for review).

**Steps**:
1. Open the release detail
2. Click **Export Audit Package**
3. The system:
   - Fetches all 7 sections (detail, decisions, overrides, manifest, notifications, SLA, timeline)
   - Runs inline integrity check
   - Computes SHA-256 content hash (canonical: arrays sorted by ID)
   - Logs the export to `fin.release_export_log` with state snapshot
   - Stamps the export with Export ID and Content Hash
4. Multi-sheet Excel file downloads automatically

**Sections included**:
| Sheet | Contents |
|-------|----------|
| Release Summary | Full release metadata + governance posture + Export ID + Content Hash |
| Decision Log | All commands with timestamps, actors, results |
| Close Overrides | Active overrides with reason codes and impacts |
| Publication Manifest | Per-artifact freeze (type, version, value, hash) |
| Integrity Checks | Check name, pass/fail, detail |
| Notifications | Event code, severity, summary, processed status |
| SLA Snapshot | Stage durations and SLA compliance |
| Timeline | Chronological merged view of all events |

**Verifying exports**: Use **Export History** (Finance > Releases > [Release] > Export History) to:
- View all prior exports with timestamps
- Compare content hashes between exports
- See release state at each export time
- Detect if data changed between exports (different hashes)

---

## Procedure 7: Cancel a Release

**When**: Release is no longer needed (before it's been released).

**Allowed from**: ASSEMBLING or READY status only.

**Steps**:
1. Open the release detail
2. Click **Cancel**
3. Enter cancellation reason (required for audit trail)
4. Confirm via preflight dialog

**Result**: Release transitions to CANCELLED (terminal state). Cannot be undone.

**Important**: Cancellation does NOT affect the underlying pack instance, publication batch, or certification. Those remain valid for a future release.

---

## Procedure 8: Supersede a Released Pack

**When**: A post-release error is discovered and a correction is needed.

**Allowed from**: RELEASED status only.

**Steps**:

### 8a. Prepare the correction
1. Create corrected data:
   - Re-generate pack instance with corrected figures
   - Create new publication batch with corrected manifest
   - Submit new certification for the correction
2. Assemble a new release (Procedure 1) for the correction
3. Process the correction release through mark-ready and release (Procedures 2-5)

### 8b. Supersede the original
1. Open the **original** released release
2. Click **Supersede**
3. Enter:
   - Correction release code (must already exist)
   - Correction release name
   - Supersession reason (detailed explanation of the error and correction)
4. Confirm

**What the system does**:
- Original release -> SUPERSEDED, `supersession_reason` populated
- Correction release linked via `supersedes_id`
- Original publication batch superseded (triggers cascade)
- Certification on original batch invalidated
- Notification emitted: `RELEASE_SUPERSEDED` (HIGH severity)
- Decision log captures full context

**Result**: Original shows "Superseded" with link to correction. Correction shows "Supersedes: [original]". Full lineage preserved.

---

## Troubleshooting

### Release is stuck in ASSEMBLING
- **Check**: Are all component IDs (pack, batch, cert, close run) valid UUIDs that exist in the database?
- **Action**: Re-assemble with correct component references, or cancel and start fresh

### "Non-clean close" but no overrides visible
- **Check**: Readiness score may be below threshold even with zero overrides
- **Check**: Close run ID may not be linked, so override count shows 0 but score is low
- **Action**: Verify the close run is correctly linked to the release

### Integrity check fails on manifest hash
- **Cause**: Publication batch was modified after manifest items were created
- **Action**: Re-publish the batch to regenerate manifest items with fresh hashes

### Export content hash differs between consecutive exports
- **Expected if**: Release state changed between exports (e.g., new notification or decision logged)
- **Unexpected if**: Same state, same data — indicates a non-determinism bug. Report to engineering

### Supersession blocked
- **Check**: Original release must be in RELEASED status (not ASSEMBLING, READY, or already SUPERSEDED)
- **Check**: Correction release must exist (assemble it first)
- **Action**: Ensure the correction release is assembled before attempting supersession

### Duplicate command error
- **Cause**: Same `correlationId` sent twice (idempotency guard)
- **Expected behavior**: Returns the result of the first execution without re-running
- **Not a bug**: This is intentional protection against accidental double-clicks

---

## Monitoring & KPIs

### Dashboard KPIs (ReleaseDashboard)

| KPI | Source | Alert Threshold |
|-----|--------|----------------|
| In Progress | Count of ASSEMBLING + READY | > 3 releases stalled |
| Policy Blocked | Non-clean with no exception signoff | Any (requires action) |
| Awaiting Exception Signoff | READY + requires signoff + no signoff | Any (requires CFO action) |
| Superseded | Count of SUPERSEDED | Monitor trend |
| Released | Count of RELEASED | Expected: 1 per period |
| Avg Release Hours | Assembly to release duration | > 48h review process |
| Integrity Failures | BLOCKED integrity checks | Any (investigate) |

### Timeline Filtering

Use the Timeline tab to investigate specific events:
- Filter by **source**: lifecycle, decision, notification, override
- Filter by **severity**: INFO, WARNING, HIGH, CRITICAL
- Filter by **date range**: isolate events to a specific window
- **Search**: free-text search across titles and details

### Export History Monitoring

Regular audit practice:
1. Export audit package monthly after each release
2. Compare content hashes with prior period exports
3. Verify export count matches expected release count
4. Archive exports per retention policy
