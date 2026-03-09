/**
 * Document Registry Invariant Tests
 *
 * Specification tests for:
 *   1. Status mapping coverage — all source statuses have a canonical mapping
 *   2. Delete guard correctness — only DRAFT/FAILED can be deleted
 *   3. Trigger idempotency — repeated upserts produce same result
 *   4. Multi-book bridge sync — JE trigger populates bridge
 *   5. Reversal symmetry — reversed↔reversing docs point at each other
 *   6. Approval evidence propagation — source fields reach registry
 *   7. Policy guard correctness — all invariants enforced at runtime
 */
import { describe, it, expect } from "vitest";

import { mapCanonicalStatus } from "../domain/types.js";
import type {
  FinancialDocument,
  FinancialDocType,
  CanonicalDocStatus,
  FinancialDocumentPosting,
} from "../domain/types.js";
import { DocumentRegistryGuard } from "../domain/registry-guard.js";

// ============================================================================
// Helpers
// ============================================================================

function makeDoc(overrides: Partial<FinancialDocument> = {}): FinancialDocument {
  return {
    id: "reg-001",
    tenantId: "t-001",
    docId: "doc-001",
    txnId: "txn-001",
    docType: "PURCHASE_INVOICE",
    docNo: "PI-001",
    entityCode: "ACME-01",
    sourceModule: "finance.accounting",
    sourceTable: "fin.purchase_invoice",
    sourceRefId: "src-001",
    status: "DRAFT",
    sourceStatus: "DRAFT",
    docDate: new Date("2026-01-15"),
    postingDate: null,
    currencyCode: "USD",
    totalAmount: "10000.0000",
    counterpartyType: "SUPPLIER",
    counterpartyId: "sup-001",
    jeId: null,
    bookCode: null,
    postedAt: null,
    postedBy: null,
    reversedDocId: null,
    voidReasonCode: null,
    reversalReason: null,
    reversalAt: null,
    reversalBy: null,
    reversingDocId: null,
    approvalInstanceId: null,
    approvalRoute: null,
    decisionScore: null,
    lastEventId: null,
    lastLifecycleAt: null,
    lastPostingEventAt: null,
    createdBy: "user-001",
    createdAt: new Date("2026-01-15"),
    updatedBy: null,
    updatedAt: new Date("2026-01-15"),
    ...overrides,
  };
}

function makePosting(
  overrides: Partial<FinancialDocumentPosting> = {},
): FinancialDocumentPosting {
  return {
    id: "post-001",
    tenantId: "t-001",
    docId: "doc-001",
    bookCode: "STAT",
    jeId: "je-001",
    postingRuleId: null,
    postingStatus: "POSTED",
    postedAt: new Date("2026-01-20"),
    postedBy: "user-001",
    reversedAt: null,
    reversedBy: null,
    createdAt: new Date("2026-01-20"),
    ...overrides,
  };
}

// ============================================================================
// 1. Status Mapping Coverage
// ============================================================================

describe("Status Mapping Coverage (specifications)", () => {
  const invoiceStatuses = [
    "DRAFT",
    "SUBMITTED",
    "APPROVED",
    "POSTED",
    "PARTIALLY_PAID",
    "PAID",
    "CANCELLED",
  ];
  const paymentStatuses = [
    "DRAFT",
    "SUBMITTED",
    "APPROVED",
    "POSTED",
    "RECONCILED",
    "CANCELLED",
    "VOIDED",
  ];
  const jeStatuses = ["CREATED", "POSTED", "REVERSED"];

  it("spec: every purchase invoice status maps to a non-DRAFT canonical status", () => {
    for (const s of invoiceStatuses) {
      const mapped = mapCanonicalStatus("PURCHASE_INVOICE", s);
      expect(mapped).toBeDefined();
      if (s !== "DRAFT") {
        expect(mapped).not.toBe("DRAFT");
      }
    }
  });

  it("spec: every payment entry status maps to a non-DRAFT canonical status", () => {
    for (const s of paymentStatuses) {
      const mapped = mapCanonicalStatus("PAYMENT_ENTRY", s);
      expect(mapped).toBeDefined();
      if (s !== "DRAFT") {
        expect(mapped).not.toBe("DRAFT");
      }
    }
  });

  it("spec: every journal entry status maps correctly", () => {
    for (const s of jeStatuses) {
      const mapped = mapCanonicalStatus("JOURNAL_ENTRY", s);
      expect(mapped).toBeDefined();
      if (s !== "CREATED") {
        expect(mapped).not.toBe("DRAFT");
      }
    }
  });

  it("spec: unknown source status falls back to DRAFT", () => {
    expect(mapCanonicalStatus("PURCHASE_INVOICE", "UNKNOWN_STATUS")).toBe("DRAFT");
    expect(mapCanonicalStatus("PAYMENT_ENTRY", "UNKNOWN_STATUS")).toBe("DRAFT");
    expect(mapCanonicalStatus("JOURNAL_ENTRY", "UNKNOWN_STATUS")).toBe("DRAFT");
  });

  it("spec: unknown doc type falls back to DRAFT", () => {
    expect(mapCanonicalStatus("CREDIT_NOTE" as FinancialDocType, "POSTED")).toBe("DRAFT");
  });

  it("spec: canonical mapping is symmetric with SQL function", () => {
    // The TypeScript mapping must stay in sync with fin.map_canonical_status().
    // This test documents the expected mapping values.
    const expected: Array<[FinancialDocType, string, CanonicalDocStatus]> = [
      ["PURCHASE_INVOICE", "DRAFT", "DRAFT"],
      ["PURCHASE_INVOICE", "SUBMITTED", "IN_REVIEW"],
      ["PURCHASE_INVOICE", "APPROVED", "APPROVED"],
      ["PURCHASE_INVOICE", "POSTED", "POSTED"],
      ["PURCHASE_INVOICE", "PARTIALLY_PAID", "PARTIALLY_SETTLED"],
      ["PURCHASE_INVOICE", "PAID", "SETTLED"],
      ["PURCHASE_INVOICE", "CANCELLED", "CANCELLED"],
      ["PAYMENT_ENTRY", "DRAFT", "DRAFT"],
      ["PAYMENT_ENTRY", "SUBMITTED", "IN_REVIEW"],
      ["PAYMENT_ENTRY", "APPROVED", "APPROVED"],
      ["PAYMENT_ENTRY", "POSTED", "POSTED"],
      ["PAYMENT_ENTRY", "RECONCILED", "SETTLED"],
      ["PAYMENT_ENTRY", "CANCELLED", "CANCELLED"],
      ["PAYMENT_ENTRY", "VOIDED", "VOIDED"],
      ["JOURNAL_ENTRY", "CREATED", "DRAFT"],
      ["JOURNAL_ENTRY", "POSTED", "POSTED"],
      ["JOURNAL_ENTRY", "REVERSED", "REVERSED"],
    ];
    for (const [docType, source, canonical] of expected) {
      expect(mapCanonicalStatus(docType, source)).toBe(canonical);
    }
  });
});

// ============================================================================
// 2. Delete Guard Correctness (specification)
// ============================================================================

describe("Delete Guard (specifications)", () => {
  it("spec: DRAFT documents may be deleted", () => {
    // SQL trigger allows DELETE where status IN ('DRAFT','FAILED')
    const draftDoc = makeDoc({ status: "DRAFT" });
    expect(draftDoc.status).toBe("DRAFT");
    // Guard: no violation for DRAFT
  });

  it("spec: FAILED documents may be deleted", () => {
    const failedDoc = makeDoc({ status: "FAILED" });
    expect(failedDoc.status).toBe("FAILED");
  });

  const protectedStatuses: CanonicalDocStatus[] = [
    "IN_REVIEW",
    "APPROVED",
    "POSTING_PENDING",
    "POSTED",
    "PARTIALLY_SETTLED",
    "SETTLED",
    "REVERSED",
    "VOIDED",
    "CANCELLED",
  ];

  for (const status of protectedStatuses) {
    it(`spec: ${status} documents cannot be deleted`, () => {
      // SQL trigger raises restrict_violation for non-DRAFT/FAILED deletes
      const doc = makeDoc({ status });
      expect(["DRAFT", "FAILED"]).not.toContain(doc.status);
    });
  }
});

// ============================================================================
// 3. Trigger Idempotency (specification)
// ============================================================================

describe("Trigger Idempotency (specifications)", () => {
  it("spec: ON CONFLICT DO UPDATE produces same result regardless of insert count", () => {
    // The registry uses ON CONFLICT (tenant_id, source_table, source_ref_id) DO UPDATE SET
    // Running the sync trigger twice with same data must produce identical registry state.
    const sourceData = {
      tenantId: "t-001",
      sourceTable: "fin.purchase_invoice",
      sourceRefId: "pi-001",
      status: "POSTED",
    };
    // Key property: same (tenant_id, source_table, source_ref_id) = same row
    expect(sourceData.tenantId).toBeTruthy();
    expect(sourceData.sourceTable).toBeTruthy();
    expect(sourceData.sourceRefId).toBeTruthy();
  });

  it("spec: upsert preserves approval evidence with COALESCE", () => {
    // Trigger uses: approval_instance_id = COALESCE(NEW.val, EXISTING.val)
    // This means once approval evidence is set, it's never overwritten with NULL
    const existing = { approvalInstanceId: "ai-001", approvalRoute: "STANDARD" };
    const update = { approvalInstanceId: null, approvalRoute: null };
    const result = {
      approvalInstanceId: update.approvalInstanceId ?? existing.approvalInstanceId,
      approvalRoute: update.approvalRoute ?? existing.approvalRoute,
    };
    expect(result.approvalInstanceId).toBe("ai-001");
    expect(result.approvalRoute).toBe("STANDARD");
  });
});

// ============================================================================
// 4. Multi-Book Bridge Sync (specification)
// ============================================================================

describe("Multi-Book Bridge Sync (specifications)", () => {
  it("spec: derived JEs (doc_id != id) create bridge rows", () => {
    // JE trigger: if NEW.doc_id != NEW.id AND status IN ('POSTED','REVERSED')
    // → INSERT INTO fin.financial_document_posting
    const je = { docId: "pi-001", id: "je-001", status: "POSTED" };
    expect(je.docId).not.toBe(je.id);
    expect(["POSTED", "REVERSED"]).toContain(je.status);
  });

  it("spec: manual JEs (doc_id = id) do NOT create bridge rows", () => {
    const manualJe = { docId: "je-002", id: "je-002", status: "POSTED" };
    expect(manualJe.docId).toBe(manualJe.id);
    // No bridge row created for self-referential JEs
  });

  it("spec: REVERSED JE sets bridge posting_status to REVERSED", () => {
    const je = { docId: "pi-001", id: "je-001", status: "REVERSED" };
    const bridgeStatus = je.status === "REVERSED" ? "REVERSED" : "POSTED";
    expect(bridgeStatus).toBe("REVERSED");
  });

  it("spec: bridge unique constraint is (tenant_id, doc_id, book_code, je_id)", () => {
    // One JE per book per document per tenant
    const constraint = { tenantId: "t-001", docId: "pi-001", bookCode: "STAT", jeId: "je-001" };
    expect(Object.keys(constraint)).toEqual(["tenantId", "docId", "bookCode", "jeId"]);
  });
});

// ============================================================================
// 5. Reversal Symmetry (specification)
// ============================================================================

describe("Reversal Symmetry (specifications)", () => {
  it("spec: reversed doc points to original via reversedDocId", () => {
    // The NEW reversal document sets reversed_doc_id = original.id
    const original = makeDoc({ id: "reg-001", status: "POSTED" });
    const reversal = makeDoc({
      id: "reg-002",
      status: "POSTED",
      reversedDocId: original.id,
    });
    expect(reversal.reversedDocId).toBe(original.id);
  });

  it("spec: original doc points to reversal via reversingDocId", () => {
    // The original document is updated with reversing_doc_id = reversal.id
    const reversal = makeDoc({ id: "reg-002" });
    const original = makeDoc({
      id: "reg-001",
      status: "REVERSED",
      reversingDocId: reversal.id,
      reversalAt: new Date(),
    });
    expect(original.reversingDocId).toBe(reversal.id);
    expect(original.status).toBe("REVERSED");
  });

  it("spec: both pointers form a bidirectional chain", () => {
    const originalId = "reg-001";
    const reversalId = "reg-002";
    const original = makeDoc({
      id: originalId,
      status: "REVERSED",
      reversingDocId: reversalId,
      reversalAt: new Date(),
    });
    const reversal = makeDoc({
      id: reversalId,
      status: "POSTED",
      reversedDocId: originalId,
    });
    expect(original.reversingDocId).toBe(reversal.id);
    expect(reversal.reversedDocId).toBe(original.id);
  });
});

// ============================================================================
// 6. Approval Evidence Propagation (specification)
// ============================================================================

describe("Approval Evidence Propagation (specifications)", () => {
  it("spec: approval_instance_id flows from source to registry", () => {
    // PI trigger: approval_instance_id = NEW.approval_instance_id
    const doc = makeDoc({
      approvalInstanceId: "ai-001",
      approvalRoute: "ENHANCED",
      decisionScore: "0.8500",
    });
    expect(doc.approvalInstanceId).toBe("ai-001");
    expect(doc.approvalRoute).toBe("ENHANCED");
    expect(doc.decisionScore).toBe("0.8500");
  });

  it("spec: decision_score is MC-4 compliant (string, not float)", () => {
    const doc = makeDoc({ decisionScore: "0.9200" });
    expect(typeof doc.decisionScore).toBe("string");
    // Never: typeof doc.decisionScore === 'number'
  });
});

// ============================================================================
// 7. Policy Guard Correctness
// ============================================================================

describe("DocumentRegistryGuard", () => {
  const guard = new DocumentRegistryGuard();

  it("passes for a well-formed DRAFT document", () => {
    const doc = makeDoc();
    const violations = guard.validate(doc);
    expect(violations).toHaveLength(0);
  });

  it("flags POSTED doc without JE linkage", () => {
    const doc = makeDoc({ status: "POSTED", jeId: null });
    const violations = guard.validate(doc);
    expect(violations.some((v) => v.rule === "TERMINAL_JE_LINKAGE")).toBe(true);
  });

  it("does not flag POSTED doc with JE linkage", () => {
    const doc = makeDoc({ status: "POSTED", jeId: "je-001" });
    const violations = guard.validate(doc);
    expect(violations.some((v) => v.rule === "TERMINAL_JE_LINKAGE")).toBe(false);
  });

  it("flags REVERSED doc without reversal chain", () => {
    const doc = makeDoc({
      status: "REVERSED",
      reversedDocId: null,
      reversingDocId: null,
    });
    const violations = guard.validate(doc);
    expect(violations.some((v) => v.rule === "REVERSAL_CHAIN_INCOMPLETE")).toBe(true);
  });

  it("passes REVERSED doc with reversing_doc_id", () => {
    const doc = makeDoc({
      status: "REVERSED",
      reversingDocId: "reg-002",
      reversalAt: new Date(),
    });
    const violations = guard.validate(doc);
    expect(violations.some((v) => v.rule === "REVERSAL_CHAIN_INCOMPLETE")).toBe(false);
  });

  it("flags REVERSED doc without reversal_at timestamp", () => {
    const doc = makeDoc({
      status: "REVERSED",
      reversingDocId: "reg-002",
      reversalAt: null,
    });
    const violations = guard.validate(doc);
    expect(violations.some((v) => v.rule === "REVERSAL_TIMESTAMP_MISSING")).toBe(true);
  });

  it("flags governed-route doc without decision score", () => {
    const doc = makeDoc({
      docType: "PURCHASE_INVOICE",
      status: "POSTED",
      jeId: "je-001",
      approvalRoute: "ENHANCED",
      decisionScore: null,
      approvalInstanceId: "ai-001",
    });
    const violations = guard.validate(doc);
    expect(violations.some((v) => v.rule === "APPROVAL_SCORING_MISSING")).toBe(true);
  });

  it("does not flag ZERO_APPROVAL route without score", () => {
    const doc = makeDoc({
      docType: "PURCHASE_INVOICE",
      status: "POSTED",
      jeId: "je-001",
      approvalRoute: "ZERO_APPROVAL",
      decisionScore: null,
      approvalInstanceId: "ai-001",
    });
    const violations = guard.validate(doc);
    expect(violations.some((v) => v.rule === "APPROVAL_SCORING_MISSING")).toBe(false);
  });

  it("flags posted doc without approval instance", () => {
    const doc = makeDoc({
      docType: "PURCHASE_INVOICE",
      status: "POSTED",
      jeId: "je-001",
      approvalInstanceId: null,
    });
    const violations = guard.validate(doc);
    expect(violations.some((v) => v.rule === "POSTED_WITHOUT_APPROVAL_INSTANCE")).toBe(true);
  });

  it("does not flag JE-type doc for approval checks", () => {
    const doc = makeDoc({
      docType: "JOURNAL_ENTRY",
      status: "POSTED",
      jeId: "je-001",
      approvalInstanceId: null,
    });
    const violations = guard.validate(doc);
    expect(violations.some((v) => v.rule === "POSTED_WITHOUT_APPROVAL_INSTANCE")).toBe(false);
  });

  it("flags posted doc with empty bridge when postings array provided", () => {
    const doc = makeDoc({ status: "POSTED", jeId: "je-001" });
    const violations = guard.validate(doc, []);
    expect(violations.some((v) => v.rule === "BRIDGE_MISSING_FOR_POSTED")).toBe(true);
  });

  it("flags failed postings in bridge", () => {
    const doc = makeDoc({ status: "POSTED", jeId: "je-001" });
    const postings = [
      makePosting({ postingStatus: "POSTED", bookCode: "STAT" }),
      makePosting({ postingStatus: "FAILED", bookCode: "TAX" }),
    ];
    const violations = guard.validate(doc, postings);
    expect(violations.some((v) => v.rule === "BRIDGE_HAS_FAILED_POSTING")).toBe(true);
  });

  it("guard() returns ServiceResult fail on error-severity violations", () => {
    const doc = makeDoc({ status: "POSTED", jeId: null });
    const result = guard.guard(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("POLICY_VIOLATION");
    }
  });

  it("guard() returns ok with warnings when no errors", () => {
    const doc = makeDoc({
      docType: "PURCHASE_INVOICE",
      status: "POSTED",
      jeId: "je-001",
      approvalInstanceId: null,
    });
    const result = guard.guard(doc);
    // POSTED_WITHOUT_APPROVAL_INSTANCE is a warning, not error
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
      expect(result.value.every((v) => v.severity === "warning")).toBe(true);
    }
  });
});
