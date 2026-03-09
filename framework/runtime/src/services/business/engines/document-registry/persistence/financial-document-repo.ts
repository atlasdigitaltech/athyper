// framework/runtime/src/services/business/engines/document-registry/persistence/financial-document-repo.ts
//
// Repository interface for the financial document registry.
// Provides unified query access across all finance document types.

import type {
  PaginationParams,
  PaginatedResult,
} from "../../shared/engine-base.js";
import type {
  FinancialDocument,
  FinancialDocumentFilters,
  FinancialDocumentPosting,
  CanonicalStatusMappingRecord,
  PostingInconsistency,
  RegistryStats,
} from "../domain/types.js";

export interface FinancialDocumentRepo {
  /** Get a single registry record by ID */
  getById(tenantId: string, id: string): Promise<FinancialDocument | null>;

  /** Get a registry record by doc_id (stable document identity) */
  getByDocId(tenantId: string, docId: string): Promise<FinancialDocument | null>;

  /** Get a registry record by source table + source ref */
  getBySource(
    tenantId: string,
    sourceTable: string,
    sourceRefId: string,
  ): Promise<FinancialDocument | null>;

  /** List documents with flexible filtering and pagination */
  list(
    tenantId: string,
    filters: FinancialDocumentFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<FinancialDocument>>;

  /**
   * Find documents by transaction chain ID.
   * Returns all docs sharing the same txn_id (e.g., PR→PO→Invoice→Payment).
   */
  listByTxnId(tenantId: string, txnId: string): Promise<FinancialDocument[]>;

  /**
   * Find all documents linked to a specific journal entry.
   * Includes both the source doc (via je_id) and the JE's own registry row.
   */
  listByJeId(tenantId: string, jeId: string): Promise<FinancialDocument[]>;

  /**
   * Compliance: find documents with posting/registry inconsistencies.
   * - POSTED status but no je_id
   * - je_id exists but status not POSTED
   * - JE is REVERSED but source doc not marked REVERSED
   */
  findPostingInconsistencies(
    tenantId: string,
    entityCode: string,
  ): Promise<PostingInconsistency[]>;

  /**
   * Compliance: find approved documents that have not been posted.
   * Useful for month-end review.
   */
  findApprovedNotPosted(
    tenantId: string,
    entityCode: string,
    postingDateTo?: Date,
  ): Promise<FinancialDocument[]>;

  /**
   * Compliance: find documents posted after a given date.
   * Useful for detecting backdated postings after close.
   */
  findPostedAfter(
    tenantId: string,
    entityCode: string,
    afterDate: Date,
    postingDateBefore?: Date,
  ): Promise<FinancialDocument[]>;

  /**
   * Registry statistics for dashboard/overview.
   */
  getStats(
    tenantId: string,
    entityCode: string,
    fiscalYear?: number,
    periodNumber?: number,
  ): Promise<RegistryStats>;

  // -------------------------------------------------------------------------
  // Multi-book posting bridge
  // -------------------------------------------------------------------------

  /** Get all book postings for a document */
  listPostingsByDocId(
    tenantId: string,
    docId: string,
  ): Promise<FinancialDocumentPosting[]>;

  /** Get all documents posted to a specific book */
  listPostingsByBook(
    tenantId: string,
    bookCode: string,
  ): Promise<FinancialDocumentPosting[]>;

  // -------------------------------------------------------------------------
  // Status mapping governance
  // -------------------------------------------------------------------------

  /** List all governed canonical status mappings */
  listStatusMappings(): Promise<CanonicalStatusMappingRecord[]>;

  /** List mappings for a specific doc type */
  listStatusMappingsByDocType(
    docType: string,
  ): Promise<CanonicalStatusMappingRecord[]>;

  // -------------------------------------------------------------------------
  // Extended compliance (Phase 2A)
  // -------------------------------------------------------------------------

  /** Documents posted in a closed fiscal period */
  findPostedInClosedPeriod(
    tenantId: string,
    entityCode: string,
  ): Promise<FinancialDocument[]>;

  /** Documents where registry entity_code mismatches JE entity_code */
  findEntityMismatches(
    tenantId: string,
  ): Promise<Array<FinancialDocument & { jeEntityCode: string }>>;

  /** Documents approved/posted without decision grid scoring */
  findApprovedWithoutScoring(
    tenantId: string,
    entityCode: string,
  ): Promise<FinancialDocument[]>;
}
