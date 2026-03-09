# Financial Document Registry — Operator Runbook

## Quick Reference

| Scenario | Alert | SLO | First Response |
|----------|-------|-----|----------------|
| Status mapping fallback spike | `StatusMappingFallback` | `status_mapping_success` | Check canonical_status_mapping table |
| Multi-book bridge incomplete | `MultibookBridgeIncomplete` | `bridge_completeness` | Query v_doc_incomplete_multibook view |
| Trigger sync failure rate | `TriggerSyncFailureRate` | `registry_sync_latency` | Check source table trigger health |
| Approved-not-posted backlog | `ApprovedNotPostedBacklog` | `approved_not_posted_clearance` | Check posting engine health |
| Closed-period posting violation | `ClosedPeriodPostingViolation` | `closed_period_zero_violation` | Immediate audit investigation |
| Posting inconsistency spike | `PostingInconsistencyCritical` | `posting_consistency` | Query v_doc_posting_inconsistency view |

---

## Procedure 1: Status Mapping Fallback Spike

**When:** `StatusMappingFallback` alert fires (>0.1/s fallback rate for 5+ minutes)

**Pre-checks:**
- [ ] Confirm alert is not a false positive from deployment spike
- [ ] Check if a new source status was recently added to a source table

**Steps:**
1. Query the fallback metrics to identify which doc_type + source_status is failing:
   ```
   Grafana → Document Registry dashboard → Status Mapping panel
   ```
2. Check if the mapping exists in the governance table:
   ```sql
   SELECT * FROM fin.canonical_status_mapping
   WHERE doc_type = '<affected_type>'
   ORDER BY source_status;
   ```
3. If missing, add the mapping:
   ```sql
   INSERT INTO fin.canonical_status_mapping
     (doc_type, source_status, canonical_status, description)
   VALUES ('<type>', '<new_status>', '<canonical>', '<description>');
   ```
4. Update `fin.map_canonical_status()` function to include the new mapping
5. Update the TypeScript `mapCanonicalStatus()` in `domain/types.ts`
6. Verify the alert clears within 5 minutes

**Result:** Mapping fallback rate returns to zero

**If blocked:** If the source status is intentionally unmapped (transient/internal state), add it with `canonical_status = 'DRAFT'` and document the decision.

---

## Procedure 2: Multi-Book Bridge Incomplete

**When:** `MultibookBridgeIncomplete` alert fires (>5 documents with incomplete postings)

**Pre-checks:**
- [ ] Check if a book posting rule was recently changed
- [ ] Check posting engine health (event bus connectivity)

**Steps:**
1. Identify affected documents:
   ```sql
   SELECT * FROM fin.v_doc_incomplete_multibook
   ORDER BY posting_count DESC;
   ```
2. For each affected document, check the source JE status:
   ```sql
   SELECT je.id, je.doc_id, je.book_code, je.status, je.derived_from_je_id
   FROM fin.journal_entry je
   WHERE je.doc_id = '<affected_doc_id>'
   ORDER BY je.book_code;
   ```
3. If JEs exist but bridge rows are missing, re-trigger sync:
   ```sql
   -- Touch the JE to re-fire the sync trigger
   UPDATE fin.journal_entry
   SET updated_at = now()
   WHERE doc_id = '<affected_doc_id>' AND status IN ('POSTED', 'REVERSED');
   ```
4. If JEs don't exist (posting engine failure), escalate to posting engine team

**Result:** `v_doc_incomplete_multibook` returns empty

**If blocked:** If the posting engine is down, the bridge will self-heal when JEs are eventually created (trigger fires on INSERT/UPDATE).

---

## Procedure 3: Trigger Sync Failure Rate

**When:** `TriggerSyncFailureRate` alert fires (>0.05/s for 3+ minutes)

**Pre-checks:**
- [ ] Check database connectivity and load
- [ ] Check if a schema migration is running

**Steps:**
1. Check PostgreSQL logs for trigger errors:
   ```sql
   SELECT * FROM pg_stat_activity
   WHERE state = 'active' AND query LIKE '%trg_sync_financial_document%';
   ```
2. Identify if a specific trigger is failing:
   - `trg_fin_pi_sync_doc_registry` (purchase invoice)
   - `trg_fin_pay_sync_doc_registry` (payment entry)
   - `trg_fin_je_sync_doc_registry` (journal entry)
3. Common causes:
   - **FK violation**: registry references a row that doesn't exist (e.g., currency code)
   - **CHECK constraint**: new source status not in the allowed list
   - **Column missing**: migration ordering issue (e.g., book_code not yet added)
4. Fix the root cause and verify trigger fires successfully

**Result:** Trigger sync failure rate drops to zero

---

## Procedure 4: Approved-Not-Posted Backlog

**When:** `ApprovedNotPostedBacklog` alert fires (>50 documents for 10+ minutes)

**Pre-checks:**
- [ ] Check posting engine health and queue depth
- [ ] Check if fiscal periods are open for the relevant entities

**Steps:**
1. Query the backlog:
   ```sql
   SELECT doc_type, entity_code, count(*) as cnt,
          min(updated_at) as oldest
   FROM fin.financial_document
   WHERE status = 'APPROVED' AND je_id IS NULL
   GROUP BY doc_type, entity_code
   ORDER BY cnt DESC;
   ```
2. If concentrated in one entity: check if that entity's fiscal period is OPEN
3. If spread across entities: check posting engine event bus health
4. If posting engine is healthy but backlog persists: check for approval→posting workflow blockage

**Result:** Backlog drops below 50

---

## Procedure 5: Closed-Period Posting Violation

**When:** `ClosedPeriodPostingViolation` alert fires (any count > 0)

**SEVERITY: CRITICAL — requires immediate investigation**

**Pre-checks:**
- [ ] This is a potential audit finding — document all investigation steps

**Steps:**
1. Identify the violations immediately:
   ```sql
   SELECT fd.doc_no, fd.doc_type, fd.entity_code, fd.posting_date,
          fd.status, fd.posted_at, fd.posted_by,
          fp.status as period_status, fp.start_date, fp.end_date
   FROM fin.v_doc_posted_in_closed_period fd
   JOIN fin.fiscal_period fp
     ON fp.tenant_id = fd.tenant_id
    AND fp.entity_code = fd.entity_code
    AND fd.posting_date BETWEEN fp.start_date AND fp.end_date;
   ```
2. Determine root cause:
   - **Backdated posting**: Document posted with a posting_date in a now-closed period
   - **Period closed after posting**: Period was closed after the document was posted (less concerning)
   - **Override**: An authorized user overrode the period control
3. Notify the controller and audit team
4. If unauthorized: the posting should be reversed and re-posted to the correct period
5. Document the finding in the audit trail

**Result:** Violation count returns to zero or is documented with approved override

**If blocked:** Do NOT modify the registry or source data without controller sign-off.

---

## Procedure 6: Posting Inconsistency Spike

**When:** `PostingInconsistencyCritical` alert fires (>100 inconsistencies)

**Pre-checks:**
- [ ] Check if a bulk operation or migration recently ran
- [ ] Check if the posting engine experienced failures

**Steps:**
1. Categorize the inconsistencies:
   ```sql
   SELECT inconsistency_type, count(*) as cnt
   FROM fin.v_doc_posting_inconsistency
   GROUP BY inconsistency_type
   ORDER BY cnt DESC;
   ```
2. For `POSTED_NO_JE`: documents claim posted but have no JE
   ```sql
   SELECT * FROM fin.v_doc_posting_inconsistency
   WHERE inconsistency_type = 'POSTED_NO_JE';
   ```
   - Likely cause: posting engine failure after status update but before JE creation
   - Resolution: re-trigger posting or revert status to APPROVED
3. For `JE_EXISTS_BUT_NOT_POSTED`: JE exists but doc status is pre-posted
   - Likely cause: trigger sync failure (status not propagated)
   - Resolution: touch the source row to re-fire the sync trigger
4. For `JE_REVERSED_DOC_NOT`: JE reversed but registry not updated
   - Likely cause: reversal workflow didn't update source table
   - Resolution: update the source table status to match

**Result:** `v_doc_posting_inconsistency` count drops below 5
