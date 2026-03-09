// framework/runtime/src/services/business/engines/document-registry/services/financial-document-registry-service.ts
//
// Financial Document Registry Service — the unified query and compliance layer.
// This service provides cross-document queries, compliance checks, and
// workbench-oriented operations against the financial document registry.

import { ok, fail } from "../../shared/engine-base.js";

import type {
  ServiceResult,
  OperationContext,
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
import type { FinancialDocumentRepo } from "../persistence/financial-document-repo.js";

// ---------------------------------------------------------------------------
// Service Interface
// ---------------------------------------------------------------------------

export interface FinancialDocumentRegistryService {
  /** Get a single document by registry ID */
  getById(
    ctx: OperationContext,
    id: string,
  ): Promise<ServiceResult<FinancialDocument>>;

  /** Get a document by stable doc_id */
  getByDocId(
    ctx: OperationContext,
    docId: string,
  ): Promise<ServiceResult<FinancialDocument>>;

  /** List documents with filters — the unified workbench query */
  list(
    ctx: OperationContext,
    filters: FinancialDocumentFilters,
    pagination: PaginationParams,
  ): Promise<ServiceResult<PaginatedResult<FinancialDocument>>>;

  /** Get all documents in a transaction chain */
  getTransactionChain(
    ctx: OperationContext,
    txnId: string,
  ): Promise<ServiceResult<FinancialDocument[]>>;

  /** Get all documents linked to a journal entry */
  getJEDocuments(
    ctx: OperationContext,
    jeId: string,
  ): Promise<ServiceResult<FinancialDocument[]>>;

  /** Compliance: posting consistency check */
  checkPostingConsistency(
    ctx: OperationContext,
    entityCode: string,
  ): Promise<ServiceResult<PostingInconsistency[]>>;

  /** Compliance: approved-but-unposted documents */
  getApprovedNotPosted(
    ctx: OperationContext,
    entityCode: string,
    asOfDate?: Date,
  ): Promise<ServiceResult<FinancialDocument[]>>;

  /** Compliance: documents posted after a control date (e.g., after soft close) */
  getPostedAfterDate(
    ctx: OperationContext,
    entityCode: string,
    controlDate: Date,
    postingDateBefore?: Date,
  ): Promise<ServiceResult<FinancialDocument[]>>;

  /** Dashboard: registry statistics */
  getStats(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear?: number,
    periodNumber?: number,
  ): Promise<ServiceResult<RegistryStats>>;

  /** Multi-book: get all book postings for a document */
  getDocumentPostings(
    ctx: OperationContext,
    docId: string,
  ): Promise<ServiceResult<FinancialDocumentPosting[]>>;

  /** Governance: list canonical status mappings */
  getStatusMappings(
    docType?: string,
  ): Promise<ServiceResult<CanonicalStatusMappingRecord[]>>;

  /** Compliance: documents posted in closed periods */
  getPostedInClosedPeriod(
    ctx: OperationContext,
    entityCode: string,
  ): Promise<ServiceResult<FinancialDocument[]>>;

  /** Compliance: documents approved without decision grid scoring */
  getApprovedWithoutScoring(
    ctx: OperationContext,
    entityCode: string,
  ): Promise<ServiceResult<FinancialDocument[]>>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultFinancialDocumentRegistryService
  implements FinancialDocumentRegistryService
{
  constructor(private readonly repo: FinancialDocumentRepo) {}

  async getById(
    ctx: OperationContext,
    id: string,
  ): Promise<ServiceResult<FinancialDocument>> {
    const doc = await this.repo.getById(ctx.tenantId, id);
    if (!doc) {
      return fail("NOT_FOUND", `Financial document ${id} not found`);
    }
    return ok(doc);
  }

  async getByDocId(
    ctx: OperationContext,
    docId: string,
  ): Promise<ServiceResult<FinancialDocument>> {
    const doc = await this.repo.getByDocId(ctx.tenantId, docId);
    if (!doc) {
      return fail("NOT_FOUND", `Financial document with doc_id ${docId} not found`);
    }
    return ok(doc);
  }

  async list(
    ctx: OperationContext,
    filters: FinancialDocumentFilters,
    pagination: PaginationParams,
  ): Promise<ServiceResult<PaginatedResult<FinancialDocument>>> {
    const result = await this.repo.list(ctx.tenantId, filters, pagination);
    return ok(result);
  }

  async getTransactionChain(
    ctx: OperationContext,
    txnId: string,
  ): Promise<ServiceResult<FinancialDocument[]>> {
    const docs = await this.repo.listByTxnId(ctx.tenantId, txnId);
    return ok(docs);
  }

  async getJEDocuments(
    ctx: OperationContext,
    jeId: string,
  ): Promise<ServiceResult<FinancialDocument[]>> {
    const docs = await this.repo.listByJeId(ctx.tenantId, jeId);
    return ok(docs);
  }

  async checkPostingConsistency(
    ctx: OperationContext,
    entityCode: string,
  ): Promise<ServiceResult<PostingInconsistency[]>> {
    const issues = await this.repo.findPostingInconsistencies(
      ctx.tenantId,
      entityCode,
    );
    return ok(issues);
  }

  async getApprovedNotPosted(
    ctx: OperationContext,
    entityCode: string,
    asOfDate?: Date,
  ): Promise<ServiceResult<FinancialDocument[]>> {
    const docs = await this.repo.findApprovedNotPosted(
      ctx.tenantId,
      entityCode,
      asOfDate,
    );
    return ok(docs);
  }

  async getPostedAfterDate(
    ctx: OperationContext,
    entityCode: string,
    controlDate: Date,
    postingDateBefore?: Date,
  ): Promise<ServiceResult<FinancialDocument[]>> {
    const docs = await this.repo.findPostedAfter(
      ctx.tenantId,
      entityCode,
      controlDate,
      postingDateBefore,
    );
    return ok(docs);
  }

  async getStats(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear?: number,
    periodNumber?: number,
  ): Promise<ServiceResult<RegistryStats>> {
    const stats = await this.repo.getStats(
      ctx.tenantId,
      entityCode,
      fiscalYear,
      periodNumber,
    );
    return ok(stats);
  }

  async getDocumentPostings(
    ctx: OperationContext,
    docId: string,
  ): Promise<ServiceResult<FinancialDocumentPosting[]>> {
    const postings = await this.repo.listPostingsByDocId(ctx.tenantId, docId);
    return ok(postings);
  }

  async getStatusMappings(
    docType?: string,
  ): Promise<ServiceResult<CanonicalStatusMappingRecord[]>> {
    const mappings = docType
      ? await this.repo.listStatusMappingsByDocType(docType)
      : await this.repo.listStatusMappings();
    return ok(mappings);
  }

  async getPostedInClosedPeriod(
    ctx: OperationContext,
    entityCode: string,
  ): Promise<ServiceResult<FinancialDocument[]>> {
    const docs = await this.repo.findPostedInClosedPeriod(
      ctx.tenantId,
      entityCode,
    );
    return ok(docs);
  }

  async getApprovedWithoutScoring(
    ctx: OperationContext,
    entityCode: string,
  ): Promise<ServiceResult<FinancialDocument[]>> {
    const docs = await this.repo.findApprovedWithoutScoring(
      ctx.tenantId,
      entityCode,
    );
    return ok(docs);
  }
}
