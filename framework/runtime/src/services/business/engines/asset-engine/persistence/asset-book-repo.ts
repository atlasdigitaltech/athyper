// ============================================================
// Asset Engine — Asset Book Repository Interface
// Athyper v2.1 Business Operating Platform — Phase 2
// ============================================================

import type {
  AssetBook,
  CreateAssetBookInput,
  UpdateAssetBookInput,
  AssetBookFilter,
  BookType,
  DepreciationRun,
  CreateDepreciationRunInput,
  DepreciationRunFilter,
  DepreciationRunStatus,
} from "../domain/types.js";

/**
 * Repository interface for the fin.asset_book and fin.depreciation_run tables.
 */
export interface AssetBookRepository {
  // ── Asset Book CRUD ────────────────────────────────────────

  /** Create a depreciation book for an asset. */
  create(input: CreateAssetBookInput): Promise<AssetBook>;

  /** Find book by ID. */
  findById(tenantId: string, bookId: string): Promise<AssetBook | null>;

  /** Find the specific book for an asset + book type. */
  findByAssetAndType(
    tenantId: string,
    assetId: string,
    bookType: BookType,
  ): Promise<AssetBook | null>;

  /** List books matching filter criteria. */
  findMany(filter: AssetBookFilter): Promise<AssetBook[]>;

  /** Update mutable fields on a book. */
  update(
    tenantId: string,
    bookId: string,
    input: UpdateAssetBookInput,
  ): Promise<AssetBook>;

  /** Increment accumulated depreciation and update dates. */
  applyDepreciation(
    tenantId: string,
    bookId: string,
    amount: string,
    depreciationDate: string,
    nextDepreciationDate: string | null,
  ): Promise<AssetBook>;

  /** Adjust cost basis (for revaluation). */
  adjustCostBasis(
    tenantId: string,
    bookId: string,
    newCostBasis: string,
    newResidualValue?: string,
  ): Promise<AssetBook>;

  /** List all books due for depreciation on or before a given date. */
  findDueForDepreciation(
    tenantId: string,
    entityCode: string,
    bookType: BookType,
    asOfDate: string,
  ): Promise<AssetBook[]>;

  // ── Depreciation Runs ──────────────────────────────────────

  /** Create a new depreciation run record. */
  createRun(input: CreateDepreciationRunInput): Promise<DepreciationRun>;

  /** Find a depreciation run by ID. */
  findRunById(tenantId: string, runId: string): Promise<DepreciationRun | null>;

  /** List depreciation runs matching filter criteria. */
  findRuns(filter: DepreciationRunFilter): Promise<DepreciationRun[]>;

  /** Update run status, counts, and timestamps. */
  updateRun(
    tenantId: string,
    runId: string,
    update: {
      status?: DepreciationRunStatus;
      assetCount?: number;
      totalAmount?: string;
      startedAt?: string;
      completedAt?: string;
    },
  ): Promise<DepreciationRun>;
}
