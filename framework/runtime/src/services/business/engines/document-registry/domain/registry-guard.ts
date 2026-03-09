// framework/runtime/src/services/business/engines/document-registry/domain/registry-guard.ts
//
// Document Registry Guard — runtime policy enforcement for registry invariants.
//
// Enforces business rules that go beyond what SQL CHECK/triggers can express:
//   - Terminal docs cannot lose JE linkage
//   - Posted docs require posting bridge rows
//   - Reversed docs require reversal metadata completeness
//   - Approved docs require approval evidence under governed routes

import { fail } from "../../shared/engine-base.js";
import type { ServiceResult } from "../../shared/engine-base.js";
import type {
  FinancialDocument,
  FinancialDocumentPosting,
  CanonicalDocStatus,
} from "./types.js";

// ---------------------------------------------------------------------------
// Policy violation result
// ---------------------------------------------------------------------------

export interface PolicyViolation {
  rule: string;
  message: string;
  docId: string;
  docNo: string;
  severity: "error" | "warning";
}

// ---------------------------------------------------------------------------
// Guard configuration
// ---------------------------------------------------------------------------

/** Statuses considered terminal — should not regress */
const TERMINAL_STATUSES: ReadonlySet<CanonicalDocStatus> = new Set([
  "POSTED",
  "REVERSED",
  "VOIDED",
  "SETTLED",
]);

/** Statuses that require JE linkage */
const POSTED_STATUSES: ReadonlySet<CanonicalDocStatus> = new Set([
  "POSTED",
  "PARTIALLY_SETTLED",
  "SETTLED",
]);

/** Approval routes that mandate scoring */
const GOVERNED_APPROVAL_ROUTES: ReadonlySet<string> = new Set([
  "STANDARD",
  "ENHANCED",
  "EXECUTIVE",
]);

// ---------------------------------------------------------------------------
// DocumentRegistryGuard
// ---------------------------------------------------------------------------

export class DocumentRegistryGuard {
  /**
   * Validate that a document meets all registry invariants.
   * Returns a list of policy violations (empty = all clear).
   */
  validate(
    doc: FinancialDocument,
    postings?: FinancialDocumentPosting[],
  ): PolicyViolation[] {
    const violations: PolicyViolation[] = [];

    this.checkJeLinkage(doc, violations);
    this.checkReversalCompleteness(doc, violations);
    this.checkApprovalEvidence(doc, violations);
    this.checkPostingBridge(doc, postings, violations);

    return violations;
  }

  /**
   * Guard variant that returns a ServiceResult — fails if any error-severity
   * violations are found.
   */
  guard(
    doc: FinancialDocument,
    postings?: FinancialDocumentPosting[],
  ): ServiceResult<PolicyViolation[]> {
    const violations = this.validate(doc, postings);
    const errors = violations.filter((v) => v.severity === "error");

    if (errors.length > 0) {
      return fail(
        "POLICY_VIOLATION",
        `Document ${doc.docNo} has ${errors.length} policy violation(s): ${errors.map((e) => e.rule).join(", ")}`,
        { violations: errors },
      );
    }

    return { ok: true, value: violations };
  }

  // -------------------------------------------------------------------------
  // Rule: Terminal docs cannot lose JE linkage
  // -------------------------------------------------------------------------
  private checkJeLinkage(
    doc: FinancialDocument,
    violations: PolicyViolation[],
  ): void {
    if (POSTED_STATUSES.has(doc.status) && !doc.jeId) {
      violations.push({
        rule: "TERMINAL_JE_LINKAGE",
        message: `Document in status ${doc.status} must have JE linkage (je_id is null)`,
        docId: doc.docId,
        docNo: doc.docNo,
        severity: "error",
      });
    }
  }

  // -------------------------------------------------------------------------
  // Rule: Reversed docs require reversal metadata completeness
  // -------------------------------------------------------------------------
  private checkReversalCompleteness(
    doc: FinancialDocument,
    violations: PolicyViolation[],
  ): void {
    if (doc.status === "REVERSED") {
      if (!doc.reversingDocId && !doc.reversedDocId) {
        violations.push({
          rule: "REVERSAL_CHAIN_INCOMPLETE",
          message: "Reversed document must have either reversingDocId or reversedDocId set",
          docId: doc.docId,
          docNo: doc.docNo,
          severity: "error",
        });
      }
      if (!doc.reversalAt) {
        violations.push({
          rule: "REVERSAL_TIMESTAMP_MISSING",
          message: "Reversed document must have reversal_at timestamp",
          docId: doc.docId,
          docNo: doc.docNo,
          severity: "warning",
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Rule: Approved docs require approval evidence under governed routes
  // -------------------------------------------------------------------------
  private checkApprovalEvidence(
    doc: FinancialDocument,
    violations: PolicyViolation[],
  ): void {
    // Only applies to doc types that go through approval workflow
    if (doc.docType !== "PURCHASE_INVOICE" && doc.docType !== "PAYMENT_ENTRY") {
      return;
    }

    // If the doc has a governed approval route, it needs scoring evidence
    if (
      doc.approvalRoute &&
      GOVERNED_APPROVAL_ROUTES.has(doc.approvalRoute) &&
      !doc.decisionScore
    ) {
      violations.push({
        rule: "APPROVAL_SCORING_MISSING",
        message: `Document on ${doc.approvalRoute} route should have decision_score`,
        docId: doc.docId,
        docNo: doc.docNo,
        severity: "warning",
      });
    }

    // Posted without approval instance (stronger check)
    if (POSTED_STATUSES.has(doc.status) && !doc.approvalInstanceId) {
      violations.push({
        rule: "POSTED_WITHOUT_APPROVAL_INSTANCE",
        message: "Posted document has no approval_instance_id",
        docId: doc.docId,
        docNo: doc.docNo,
        severity: "warning",
      });
    }
  }

  // -------------------------------------------------------------------------
  // Rule: Posted docs with multi-book should have bridge rows
  // -------------------------------------------------------------------------
  private checkPostingBridge(
    doc: FinancialDocument,
    postings: FinancialDocumentPosting[] | undefined,
    violations: PolicyViolation[],
  ): void {
    // Only check if postings were provided and doc is posted
    if (!postings || !POSTED_STATUSES.has(doc.status)) return;

    // If we have postings array but it's empty for a posted doc, that's a gap
    if (postings.length === 0 && doc.jeId) {
      violations.push({
        rule: "BRIDGE_MISSING_FOR_POSTED",
        message: "Posted document has je_id but no posting bridge rows",
        docId: doc.docId,
        docNo: doc.docNo,
        severity: "warning",
      });
    }

    // Check for any FAILED postings
    const failedPostings = postings.filter((p) => p.postingStatus === "FAILED");
    if (failedPostings.length > 0) {
      violations.push({
        rule: "BRIDGE_HAS_FAILED_POSTING",
        message: `Document has ${failedPostings.length} failed posting(s) in bridge`,
        docId: doc.docId,
        docNo: doc.docNo,
        severity: "error",
      });
    }
  }
}
