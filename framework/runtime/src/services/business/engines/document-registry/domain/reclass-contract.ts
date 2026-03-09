// framework/runtime/src/services/business/engines/document-registry/domain/reclass-contract.ts
//
// Onboarding contract for RECLASS document type.

import type { DocTypeOnboardingContract } from "./onboarding-contract.js";

export const RECLASS_CONTRACT: DocTypeOnboardingContract = {
  docType: "RECLASS",
  label: "Reclassification",
  description:
    "Account reclassification that transfers a balance between accounts within the same entity. Approval is always mandatory.",
  contractVersion: "1.0.0",

  statusMappings: [
    { sourceStatus: "DRAFT", canonicalStatus: "DRAFT", description: "Reclassification drafted" },
    { sourceStatus: "APPROVED", canonicalStatus: "APPROVED", description: "Approved, pending posting" },
    { sourceStatus: "POSTED", canonicalStatus: "POSTED", description: "Posted with JE" },
    { sourceStatus: "REVERSED", canonicalStatus: "REVERSED", description: "Reversed" },
  ],

  syncTrigger: {
    sourceTable: "fin.reclass_document",
    sourceModule: "finance.accounting",
    docIdColumn: "id",
    txnIdColumn: "txn_id",
    docNoColumn: "reclass_number",
    entityCodeColumn: "entity_code",
    statusColumn: "status",
    docDateColumn: "reclass_date",
    postingDateColumn: "posting_date",
    currencyCodeColumn: "currency_code",
    totalAmountColumn: "amount",
    jeIdColumn: "je_id",
    counterpartyType: "INTERNAL",
    counterpartyIdColumn: null,
  },

  approvalEvidence: {
    requiresApproval: true,
    approvalInstanceIdColumn: "approval_instance_id",
    approvalRouteColumn: "approval_route",
    decisionScoreColumn: "decision_score",
    // No ZERO_APPROVAL for reclass — always requires at least STANDARD
    governedRoutes: ["STANDARD", "ENHANCED", "EXECUTIVE"],
  },

  postingBridge: {
    producesJournalEntries: true,
    supportsMultiBook: false,
    targetBooks: ["STAT"],
  },

  compliance: {
    requiresJeLinkage: true,
    requiresReversalCompleteness: true,
    requiresApprovalForPosting: true,
    requiresPostingBridge: false,
    customRules: [
      {
        ruleCode: "RCL_APPROVAL_MANDATORY",
        description: "Reclassifications must always have approval evidence",
        severity: "error",
        condition: "status IN ('APPROVED','POSTED') AND approval_instance_id IS NULL",
      },
      {
        ruleCode: "RCL_DIFFERENT_ACCOUNTS",
        description: "Source and target accounts must differ",
        severity: "error",
        condition: "from_account_id = to_account_id",
      },
    ],
  },

  testTemplate: {
    statusMappingTests: [
      { sourceStatus: "DRAFT", expectedCanonical: "DRAFT" },
      { sourceStatus: "APPROVED", expectedCanonical: "APPROVED" },
      { sourceStatus: "POSTED", expectedCanonical: "POSTED" },
      { sourceStatus: "REVERSED", expectedCanonical: "REVERSED" },
    ],
    triggerScenarios: [
      {
        description: "New draft reclass creates registry row",
        sourceState: { status: "DRAFT", je_id: null },
        expectedRegistryState: { status: "DRAFT", jeId: null },
      },
      {
        description: "Posted reclass populates JE linkage",
        sourceState: { status: "POSTED", je_id: "je-rcl-001" },
        expectedRegistryState: { status: "POSTED", jeId: "je-rcl-001" },
      },
    ],
  },

  migrationRef: "198g_reclass_document.sql",
};
