// framework/runtime/src/services/business/engines/document-registry/domain/fx-revaluation-contract.ts
//
// Onboarding contract for FX_REVALUATION document type.
// Period-end foreign currency revaluation — recognizes unrealized FX gains/losses.

import type { DocTypeOnboardingContract } from "./onboarding-contract.js";

export const FX_REVALUATION_CONTRACT: DocTypeOnboardingContract = {
  docType: "FX_REVALUATION",
  label: "FX Revaluation",
  description:
    "Period-end foreign currency revaluation recognizing unrealized gains/losses on open balances in foreign currencies",
  contractVersion: "1.0.0",

  statusMappings: [
    { sourceStatus: "DRAFT", canonicalStatus: "DRAFT", description: "FX revaluation run drafted" },
    { sourceStatus: "CALCULATED", canonicalStatus: "IN_REVIEW", description: "Rates applied, gains/losses calculated" },
    { sourceStatus: "APPROVED", canonicalStatus: "APPROVED", description: "Approved, pending posting" },
    { sourceStatus: "POSTED", canonicalStatus: "POSTED", description: "Posted with JE" },
    { sourceStatus: "REVERSED", canonicalStatus: "REVERSED", description: "Reversed" },
  ],

  syncTrigger: {
    sourceTable: "fin.fx_revaluation_run",
    sourceModule: "finance.treasury",
    docIdColumn: "id",
    txnIdColumn: "txn_id",
    docNoColumn: "revaluation_code",
    entityCodeColumn: "entity_code",
    statusColumn: "status",
    docDateColumn: "revaluation_date",
    postingDateColumn: "posting_date",
    currencyCodeColumn: "functional_currency_code",
    totalAmountColumn: "net_amount",
    jeIdColumn: "je_id",
    counterpartyType: "INTERNAL",
    counterpartyIdColumn: null,
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
    customRules: [
      {
        ruleCode: "FX_ZERO_GAIN_LOSS",
        description: "FX revaluation with zero net adjustment — may indicate stale rates",
        severity: "warning",
        condition: "net_amount = 0 AND status IN ('CALCULATED','APPROVED','POSTED')",
      },
      {
        ruleCode: "FX_REVAL_AFTER_CLOSE",
        description: "FX revaluation posted into a closed fiscal period",
        severity: "error",
        condition: "status = 'POSTED' AND period_status IN ('HARD_CLOSE','SOFT_CLOSE')",
      },
    ],
  },

  testTemplate: {
    statusMappingTests: [
      { sourceStatus: "DRAFT", expectedCanonical: "DRAFT" },
      { sourceStatus: "CALCULATED", expectedCanonical: "IN_REVIEW" },
      { sourceStatus: "APPROVED", expectedCanonical: "APPROVED" },
      { sourceStatus: "POSTED", expectedCanonical: "POSTED" },
      { sourceStatus: "REVERSED", expectedCanonical: "REVERSED" },
    ],
    triggerScenarios: [
      {
        description: "New draft FX reval creates registry row",
        sourceState: { status: "DRAFT", je_id: null },
        expectedRegistryState: { status: "DRAFT", jeId: null },
      },
      {
        description: "Calculated FX reval maps to IN_REVIEW",
        sourceState: { status: "CALCULATED", je_id: null },
        expectedRegistryState: { status: "IN_REVIEW", jeId: null },
      },
      {
        description: "Posted FX reval populates JE linkage",
        sourceState: { status: "POSTED", je_id: "je-fxr-001" },
        expectedRegistryState: { status: "POSTED", jeId: "je-fxr-001" },
      },
    ],
  },

  migrationRef: "198j_fx_revaluation.sql",
};
