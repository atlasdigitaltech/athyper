// framework/runtime/src/services/business/engines/document-registry/domain/accrual-contract.ts
//
// Onboarding contract for ACCRUAL document type.

import type { DocTypeOnboardingContract } from "./onboarding-contract.js";

export const ACCRUAL_CONTRACT: DocTypeOnboardingContract = {
  docType: "ACCRUAL",
  label: "Accrual",
  description:
    "Period-end accrual with optional auto-reversal in the next period",
  contractVersion: "1.0.0",

  statusMappings: [
    { sourceStatus: "DRAFT", canonicalStatus: "DRAFT", description: "Accrual drafted" },
    { sourceStatus: "APPROVED", canonicalStatus: "APPROVED", description: "Approved, pending posting" },
    { sourceStatus: "POSTED", canonicalStatus: "POSTED", description: "Posted with JE" },
    { sourceStatus: "REVERSED", canonicalStatus: "REVERSED", description: "Reversed (manual or auto)" },
    { sourceStatus: "CANCELLED", canonicalStatus: "CANCELLED", description: "Cancelled" },
  ],

  syncTrigger: {
    sourceTable: "fin.accrual_document",
    sourceModule: "finance.accounting",
    docIdColumn: "id",
    txnIdColumn: "txn_id",
    docNoColumn: "accrual_code",
    entityCodeColumn: "entity_code",
    statusColumn: "status",
    docDateColumn: "accrual_date",
    postingDateColumn: "posting_date",
    currencyCodeColumn: "currency_code",
    totalAmountColumn: "accrual_amount",
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
        ruleCode: "ACR_REVERSAL_DATE",
        description: "Auto-reverse accruals must have reversal_date set",
        severity: "error",
        condition: "auto_reverse = true AND reversal_date IS NULL",
      },
      {
        ruleCode: "ACR_REVERSAL_JE",
        description: "Posted auto-reverse accruals past reversal_date must have reversal_je_id",
        severity: "error",
        condition:
          "auto_reverse = true AND status = 'POSTED' AND reversal_date <= CURRENT_DATE AND reversal_je_id IS NULL",
      },
      {
        ruleCode: "ACR_CLOSED_PERIOD",
        description: "Accruals cannot be posted into a HARD_CLOSE period",
        severity: "error",
        condition: "status = 'POSTED' AND period_status = 'HARD_CLOSE'",
      },
    ],
  },

  testTemplate: {
    statusMappingTests: [
      { sourceStatus: "DRAFT", expectedCanonical: "DRAFT" },
      { sourceStatus: "APPROVED", expectedCanonical: "APPROVED" },
      { sourceStatus: "POSTED", expectedCanonical: "POSTED" },
      { sourceStatus: "REVERSED", expectedCanonical: "REVERSED" },
      { sourceStatus: "CANCELLED", expectedCanonical: "CANCELLED" },
    ],
    triggerScenarios: [
      {
        description: "New draft accrual creates registry row",
        sourceState: { status: "DRAFT", je_id: null },
        expectedRegistryState: { status: "DRAFT", jeId: null },
      },
      {
        description: "Posted accrual populates JE linkage",
        sourceState: { status: "POSTED", je_id: "je-acr-001" },
        expectedRegistryState: { status: "POSTED", jeId: "je-acr-001" },
      },
      {
        description: "Reversed accrual maps to REVERSED",
        sourceState: { status: "REVERSED", je_id: "je-acr-001" },
        expectedRegistryState: { status: "REVERSED", jeId: "je-acr-001" },
      },
    ],
  },

  migrationRef: "198f_accrual_document.sql",
};
