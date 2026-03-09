// framework/runtime/src/services/business/engines/document-registry/domain/credit-note-contract.ts
//
// Onboarding contract for CREDIT_NOTE document type.

import type { DocTypeOnboardingContract } from "./onboarding-contract.js";

export const CREDIT_NOTE_CONTRACT: DocTypeOnboardingContract = {
  docType: "CREDIT_NOTE",
  label: "Credit Note",
  description:
    "Supplier credit note that reduces AP liability, linked to a purchase invoice or standalone",
  contractVersion: "1.0.0",

  statusMappings: [
    { sourceStatus: "DRAFT", canonicalStatus: "DRAFT", description: "Credit note created, not submitted" },
    { sourceStatus: "SUBMITTED", canonicalStatus: "IN_REVIEW", description: "Submitted for approval" },
    { sourceStatus: "APPROVED", canonicalStatus: "APPROVED", description: "Approved, pending posting" },
    { sourceStatus: "POSTED", canonicalStatus: "POSTED", description: "Posted with JE" },
    { sourceStatus: "APPLIED", canonicalStatus: "SETTLED", description: "Fully applied to invoice" },
    { sourceStatus: "CANCELLED", canonicalStatus: "CANCELLED", description: "Cancelled" },
    { sourceStatus: "FAILED", canonicalStatus: "FAILED", description: "Posting failed" },
  ],

  syncTrigger: {
    sourceTable: "fin.credit_note",
    sourceModule: "finance.accounting",
    docIdColumn: "id",
    txnIdColumn: "txn_id",
    docNoColumn: "credit_note_number",
    entityCodeColumn: "entity_code",
    statusColumn: "status",
    docDateColumn: "credit_note_date",
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
    requiresReversalCompleteness: true,
    requiresApprovalForPosting: true,
    requiresPostingBridge: true,
    customRules: [],
  },

  testTemplate: {
    statusMappingTests: [
      { sourceStatus: "DRAFT", expectedCanonical: "DRAFT" },
      { sourceStatus: "SUBMITTED", expectedCanonical: "IN_REVIEW" },
      { sourceStatus: "APPROVED", expectedCanonical: "APPROVED" },
      { sourceStatus: "POSTED", expectedCanonical: "POSTED" },
      { sourceStatus: "APPLIED", expectedCanonical: "SETTLED" },
      { sourceStatus: "CANCELLED", expectedCanonical: "CANCELLED" },
      { sourceStatus: "FAILED", expectedCanonical: "FAILED" },
    ],
    triggerScenarios: [
      {
        description: "New draft credit note creates registry row",
        sourceState: { status: "DRAFT", je_id: null },
        expectedRegistryState: { status: "DRAFT", jeId: null },
      },
      {
        description: "Posted credit note populates JE linkage",
        sourceState: { status: "POSTED", je_id: "je-cn-001" },
        expectedRegistryState: { status: "POSTED", jeId: "je-cn-001" },
      },
      {
        description: "Applied credit note maps to SETTLED",
        sourceState: { status: "APPLIED", je_id: "je-cn-001" },
        expectedRegistryState: { status: "SETTLED", jeId: "je-cn-001" },
      },
    ],
  },

  migrationRef: "198e_credit_note.sql",
};
