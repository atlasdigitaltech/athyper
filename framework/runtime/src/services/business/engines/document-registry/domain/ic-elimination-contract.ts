// framework/runtime/src/services/business/engines/document-registry/domain/ic-elimination-contract.ts
//
// Onboarding contract for IC_ELIMINATION document type.
// Intercompany elimination entries for group consolidation.

import type { DocTypeOnboardingContract } from "./onboarding-contract.js";

export const IC_ELIMINATION_CONTRACT: DocTypeOnboardingContract = {
  docType: "IC_ELIMINATION",
  label: "IC Elimination",
  description:
    "Intercompany elimination entry for group consolidation — removes internal transactions from consolidated statements",
  contractVersion: "1.0.0",

  statusMappings: [
    { sourceStatus: "DRAFT", canonicalStatus: "DRAFT", description: "IC elimination drafted" },
    { sourceStatus: "PREPARED", canonicalStatus: "IN_REVIEW", description: "Prepared for review" },
    { sourceStatus: "APPROVED", canonicalStatus: "APPROVED", description: "Approved, pending posting" },
    { sourceStatus: "POSTED", canonicalStatus: "POSTED", description: "Posted with JE" },
    { sourceStatus: "REVERSED", canonicalStatus: "REVERSED", description: "Reversed" },
  ],

  syncTrigger: {
    sourceTable: "fin.ic_elimination",
    sourceModule: "finance.consolidation",
    docIdColumn: "id",
    txnIdColumn: "txn_id",
    docNoColumn: "elimination_code",
    entityCodeColumn: "entity_code",
    statusColumn: "status",
    docDateColumn: "elimination_date",
    postingDateColumn: "posting_date",
    currencyCodeColumn: "currency_code",
    totalAmountColumn: "elimination_amount",
    jeIdColumn: "je_id",
    counterpartyType: "INTERCOMPANY",
    counterpartyIdColumn: null,
  },

  approvalEvidence: {
    requiresApproval: true,
    approvalInstanceIdColumn: "approval_instance_id",
    approvalRouteColumn: "approval_route",
    decisionScoreColumn: "decision_score",
    // No ZERO_APPROVAL for IC eliminations — always requires at least STANDARD
    governedRoutes: ["STANDARD", "ENHANCED", "EXECUTIVE"],
  },

  postingBridge: {
    producesJournalEntries: true,
    supportsMultiBook: true,
    targetBooks: ["STAT", "IFRS"],
  },

  compliance: {
    requiresJeLinkage: true,
    requiresReversalCompleteness: true,
    requiresApprovalForPosting: true,
    requiresPostingBridge: true,
    customRules: [
      {
        ruleCode: "IC_ENTITY_MISMATCH",
        description: "IC elimination must involve two different entities",
        severity: "error",
        condition: "entity_code = counterparty_entity_code",
      },
      {
        ruleCode: "IC_UNBALANCED",
        description: "IC elimination lines must balance (total debits = total credits)",
        severity: "error",
        condition: "ABS(SUM(debit_amount) - SUM(credit_amount)) > 0.0001",
      },
      {
        ruleCode: "IC_APPROVAL_MANDATORY",
        description: "IC eliminations must always have approval evidence",
        severity: "error",
        condition: "status IN ('APPROVED','POSTED') AND approval_instance_id IS NULL",
      },
    ],
  },

  testTemplate: {
    statusMappingTests: [
      { sourceStatus: "DRAFT", expectedCanonical: "DRAFT" },
      { sourceStatus: "PREPARED", expectedCanonical: "IN_REVIEW" },
      { sourceStatus: "APPROVED", expectedCanonical: "APPROVED" },
      { sourceStatus: "POSTED", expectedCanonical: "POSTED" },
      { sourceStatus: "REVERSED", expectedCanonical: "REVERSED" },
    ],
    triggerScenarios: [
      {
        description: "New draft IC elimination creates registry row",
        sourceState: { status: "DRAFT", je_id: null },
        expectedRegistryState: { status: "DRAFT", jeId: null },
      },
      {
        description: "Prepared IC elimination maps to IN_REVIEW",
        sourceState: { status: "PREPARED", je_id: null },
        expectedRegistryState: { status: "IN_REVIEW", jeId: null },
      },
      {
        description: "Posted IC elimination populates JE linkage",
        sourceState: { status: "POSTED", je_id: "je-ice-001" },
        expectedRegistryState: { status: "POSTED", jeId: "je-ice-001" },
      },
    ],
  },

  migrationRef: "198k_ic_elimination.sql",
};
