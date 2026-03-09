// framework/runtime/src/services/business/engines/document-registry/domain/onboarding-contract.ts
//
// Document-Type Onboarding Contract
//
// Defines the complete contract that any new financial document type must
// fulfil to integrate with the unified document registry. This enforces
// disciplined expansion — each new type must declare its status mappings,
// sync rules, compliance expectations, and test template.
//
// Usage: When adding a new type (e.g., CREDIT_NOTE), implement this contract
// and register it via the DocTypeOnboardingRegistry.

import type { CanonicalDocStatus, FinancialDocType, CounterpartyType } from "./types.js";

// ---------------------------------------------------------------------------
// Status Mapping Contract
// ---------------------------------------------------------------------------

export interface StatusMappingEntry {
  /** Source-table-native status value */
  sourceStatus: string;
  /** Canonical registry status it maps to */
  canonicalStatus: CanonicalDocStatus;
  /** Human-readable description for the governance table */
  description: string;
}

// ---------------------------------------------------------------------------
// Sync Trigger Contract
// ---------------------------------------------------------------------------

export interface SyncTriggerContract {
  /** Source schema.table (e.g., "fin.credit_note") */
  sourceTable: string;
  /** Source module identifier (e.g., "finance.accounting") */
  sourceModule: string;
  /** Column that provides doc_id (usually "id") */
  docIdColumn: string;
  /** Column that provides txn_id */
  txnIdColumn: string;
  /** Column that provides the human-readable document number */
  docNoColumn: string;
  /** Column that provides entity_code */
  entityCodeColumn: string;
  /** Column that provides the source-native status */
  statusColumn: string;
  /** Column for doc_date */
  docDateColumn: string;
  /** Column for posting_date (null if not applicable) */
  postingDateColumn: string | null;
  /** Column for currency_code */
  currencyCodeColumn: string;
  /** Column for total_amount */
  totalAmountColumn: string;
  /** Column for je_id (null if posting is not applicable) */
  jeIdColumn: string | null;
  /** Default counterparty type for this doc type */
  counterpartyType: CounterpartyType | null;
  /** Column for counterparty_id (null if not applicable) */
  counterpartyIdColumn: string | null;
}

// ---------------------------------------------------------------------------
// Approval Evidence Contract
// ---------------------------------------------------------------------------

export interface ApprovalEvidenceContract {
  /** Whether this doc type goes through approval workflow */
  requiresApproval: boolean;
  /** Column for approval_instance_id (null if no approval) */
  approvalInstanceIdColumn: string | null;
  /** Column for approval_route (null if no approval) */
  approvalRouteColumn: string | null;
  /** Column for decision_score (null if no approval) */
  decisionScoreColumn: string | null;
  /** Approval routes that mandate scoring evidence */
  governedRoutes: string[];
}

// ---------------------------------------------------------------------------
// Posting Bridge Contract
// ---------------------------------------------------------------------------

export interface PostingBridgeContract {
  /** Whether this doc type produces journal entries */
  producesJournalEntries: boolean;
  /** Whether multi-book posting is supported */
  supportsMultiBook: boolean;
  /** Book codes that may be targeted */
  targetBooks: string[];
}

// ---------------------------------------------------------------------------
// Compliance Expectations
// ---------------------------------------------------------------------------

export interface ComplianceExpectations {
  /** Terminal statuses that must have JE linkage */
  requiresJeLinkage: boolean;
  /** Whether reversal metadata must be complete when reversed */
  requiresReversalCompleteness: boolean;
  /** Whether approval evidence is mandatory for posted state */
  requiresApprovalForPosting: boolean;
  /** Whether posting bridge rows are expected */
  requiresPostingBridge: boolean;
  /** Custom compliance rules specific to this doc type */
  customRules: Array<{
    ruleCode: string;
    description: string;
    severity: "error" | "warning";
    condition: string;
  }>;
}

// ---------------------------------------------------------------------------
// Test Template
// ---------------------------------------------------------------------------

export interface TestTemplate {
  /** Minimum status mapping test cases */
  statusMappingTests: Array<{
    sourceStatus: string;
    expectedCanonical: CanonicalDocStatus;
  }>;
  /** Trigger idempotency scenarios */
  triggerScenarios: Array<{
    description: string;
    sourceState: Record<string, unknown>;
    expectedRegistryState: Partial<{
      status: CanonicalDocStatus;
      jeId: string | null;
      approvalInstanceId: string | null;
    }>;
  }>;
}

// ---------------------------------------------------------------------------
// Full Onboarding Contract
// ---------------------------------------------------------------------------

export interface DocTypeOnboardingContract {
  /** The doc_type value (must be in the CHECK constraint) */
  docType: FinancialDocType;
  /** Human-readable label */
  label: string;
  /** Description for documentation */
  description: string;
  /** Version of this contract */
  contractVersion: string;

  /** Status mapping: source → canonical */
  statusMappings: StatusMappingEntry[];

  /** Sync trigger definition */
  syncTrigger: SyncTriggerContract;

  /** Approval evidence rules */
  approvalEvidence: ApprovalEvidenceContract;

  /** Multi-book posting rules */
  postingBridge: PostingBridgeContract;

  /** Compliance invariants */
  compliance: ComplianceExpectations;

  /** Test template for validation */
  testTemplate: TestTemplate;

  /** SQL migration reference (e.g., "198e_credit_note_registry.sql") */
  migrationRef: string;
}

// ---------------------------------------------------------------------------
// Registry of onboarded doc types
// ---------------------------------------------------------------------------

const registeredContracts = new Map<FinancialDocType, DocTypeOnboardingContract>();

export class DocTypeOnboardingRegistry {
  /** Register a new doc type contract */
  static register(contract: DocTypeOnboardingContract): void {
    if (registeredContracts.has(contract.docType)) {
      throw new Error(
        `Doc type ${contract.docType} is already registered. Use update() to modify.`,
      );
    }
    this.validateContract(contract);
    registeredContracts.set(contract.docType, contract);
  }

  /** Get a registered contract */
  static get(docType: FinancialDocType): DocTypeOnboardingContract | undefined {
    return registeredContracts.get(docType);
  }

  /** List all registered contracts */
  static listAll(): DocTypeOnboardingContract[] {
    return Array.from(registeredContracts.values());
  }

  /** Validate contract completeness */
  private static validateContract(contract: DocTypeOnboardingContract): void {
    if (contract.statusMappings.length === 0) {
      throw new Error(`${contract.docType}: statusMappings cannot be empty`);
    }
    if (!contract.syncTrigger.sourceTable) {
      throw new Error(`${contract.docType}: syncTrigger.sourceTable is required`);
    }
    if (contract.testTemplate.statusMappingTests.length === 0) {
      throw new Error(`${contract.docType}: testTemplate must have status mapping tests`);
    }
    // Verify every status mapping has a corresponding test
    const testedStatuses = new Set(
      contract.testTemplate.statusMappingTests.map((t) => t.sourceStatus),
    );
    for (const mapping of contract.statusMappings) {
      if (!testedStatuses.has(mapping.sourceStatus)) {
        throw new Error(
          `${contract.docType}: source status "${mapping.sourceStatus}" has no test case`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Reference implementation: Purchase Invoice contract
// ---------------------------------------------------------------------------

export const PURCHASE_INVOICE_CONTRACT: DocTypeOnboardingContract = {
  docType: "PURCHASE_INVOICE",
  label: "Purchase Invoice",
  description: "AP invoice received from a supplier, flows through approval to posting",
  contractVersion: "1.0.0",

  statusMappings: [
    { sourceStatus: "DRAFT", canonicalStatus: "DRAFT", description: "Invoice created, not submitted" },
    { sourceStatus: "SUBMITTED", canonicalStatus: "IN_REVIEW", description: "Submitted for approval" },
    { sourceStatus: "APPROVED", canonicalStatus: "APPROVED", description: "Approved, pending posting" },
    { sourceStatus: "POSTED", canonicalStatus: "POSTED", description: "Posted with JE" },
    { sourceStatus: "PARTIALLY_PAID", canonicalStatus: "PARTIALLY_SETTLED", description: "Partial payment applied" },
    { sourceStatus: "PAID", canonicalStatus: "SETTLED", description: "Fully paid" },
    { sourceStatus: "CANCELLED", canonicalStatus: "CANCELLED", description: "Cancelled" },
  ],

  syncTrigger: {
    sourceTable: "fin.purchase_invoice",
    sourceModule: "finance.accounting",
    docIdColumn: "id",
    txnIdColumn: "txn_id",
    docNoColumn: "invoice_number",
    entityCodeColumn: "entity_code",
    statusColumn: "status",
    docDateColumn: "invoice_date",
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
    targetBooks: ["STAT", "TAX", "MGMT", "IFRS", "LOCAL"],
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
      { sourceStatus: "PARTIALLY_PAID", expectedCanonical: "PARTIALLY_SETTLED" },
      { sourceStatus: "PAID", expectedCanonical: "SETTLED" },
      { sourceStatus: "CANCELLED", expectedCanonical: "CANCELLED" },
    ],
    triggerScenarios: [
      {
        description: "New draft invoice creates registry row",
        sourceState: { status: "DRAFT", je_id: null },
        expectedRegistryState: { status: "DRAFT", jeId: null },
      },
      {
        description: "Posted invoice populates JE linkage",
        sourceState: { status: "POSTED", je_id: "je-001" },
        expectedRegistryState: { status: "POSTED", jeId: "je-001" },
      },
    ],
  },

  migrationRef: "198_financial_document_registry.sql",
};
