// framework/runtime/src/services/business/engines/document-registry/domain/debit-note-contract.ts
//
// Onboarding contract for DEBIT_NOTE document type.
// Mirror of credit_note — increases AP liability against a purchase invoice.

import type { DocTypeOnboardingContract } from "./onboarding-contract.js";

export const DEBIT_NOTE_CONTRACT: DocTypeOnboardingContract = {
  docType: "DEBIT_NOTE",
  label: "Debit Note",
  description:
    "Supplier debit note that increases AP liability — used for price increases, underbilling corrections, freight adjustments",
  contractVersion: "1.0.0",

  statusMappings: [
    { sourceStatus: "DRAFT", canonicalStatus: "DRAFT", description: "Debit note created, not submitted" },
    { sourceStatus: "SUBMITTED", canonicalStatus: "IN_REVIEW", description: "Submitted for approval" },
    { sourceStatus: "APPROVED", canonicalStatus: "APPROVED", description: "Approved, pending posting" },
    { sourceStatus: "POSTED", canonicalStatus: "POSTED", description: "Posted with JE" },
    { sourceStatus: "CANCELLED", canonicalStatus: "CANCELLED", description: "Cancelled" },
    { sourceStatus: "FAILED", canonicalStatus: "FAILED", description: "Posting failed" },
  ],

  syncTrigger: {
    sourceTable: "fin.debit_note",
    sourceModule: "finance.accounting",
    docIdColumn: "id",
    txnIdColumn: "txn_id",
    docNoColumn: "debit_note_number",
    entityCodeColumn: "entity_code",
    statusColumn: "status",
    docDateColumn: "debit_note_date",
    postingDateColumn: "posting_date",
    currencyCodeColumn: "currency_code",
    totalAmountColumn: "total_amount",
    jeIdColumn: "je_id",
    counterpartyType: "SUPPLIER",
    counterpartyIdColumn: "supplier_id",
  },

  approvalEvidence: {
    requiresApproval: true,
    approvalInstanceIdColumn: "approval_instance_id",
    approvalRouteColumn: "approval_route",
    decisionScoreColumn: "decision_score",
    governedRoutes: ["STANDARD", "ENHANCED", "EXECUTIVE"],
  },

  postingBridge: {
    producesJournalEntries: true,
    supportsMultiBook: true,
    targetBooks: ["STAT", "IFRS", "LOCAL"],
  },

  compliance: {
    requiresJeLinkage: true,
    requiresReversalCompleteness: false,
    requiresApprovalForPosting: true,
    requiresPostingBridge: true,
    customRules: [
      {
        ruleCode: "DN_WITHOUT_INVOICE",
        description: "Debit notes without a linked invoice require additional review",
        severity: "warning",
        condition: "invoice_id IS NULL AND status IN ('APPROVED','POSTED')",
      },
    ],
  },

  testTemplate: {
    statusMappingTests: [
      { sourceStatus: "DRAFT", expectedCanonical: "DRAFT" },
      { sourceStatus: "SUBMITTED", expectedCanonical: "IN_REVIEW" },
      { sourceStatus: "APPROVED", expectedCanonical: "APPROVED" },
      { sourceStatus: "POSTED", expectedCanonical: "POSTED" },
      { sourceStatus: "CANCELLED", expectedCanonical: "CANCELLED" },
      { sourceStatus: "FAILED", expectedCanonical: "FAILED" },
    ],
    triggerScenarios: [
      {
        description: "New draft debit note creates registry row",
        sourceState: { status: "DRAFT", je_id: null },
        expectedRegistryState: { status: "DRAFT", jeId: null },
      },
      {
        description: "Posted debit note populates JE linkage",
        sourceState: { status: "POSTED", je_id: "je-dn-001" },
        expectedRegistryState: { status: "POSTED", jeId: "je-dn-001" },
      },
    ],
  },

  migrationRef: "198i_debit_note.sql",
};
