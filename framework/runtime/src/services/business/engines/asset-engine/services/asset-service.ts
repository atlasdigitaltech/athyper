// ============================================================
// Asset Engine — Asset Service
// Athyper v2.1 Business Operating Platform — Phase 2
// ============================================================

import { ok, fail } from "../../shared/engine-base.js";
import {
  calculateDepreciation,
  type DepreciationParams,
} from "../domain/depreciation-calculator.js";
import {
  AssetStatus,
  AssetTxnType,
  DepreciationRunStatus,
  type Asset,
  type AssetBook,
  type AssetTransaction,
  type BookType,
  type CreateAssetInput,
  type CreateAssetBookInput,
  type DepreciationRun,
  type DepreciationMethod,
} from "../domain/types.js";
// MC-4 compliance: BigInt arithmetic instead of parseFloat
import { compareAmounts, subtractAmounts, sumAmounts } from "../../shared/money.js";

import type { ServiceResult, OperationContext } from "../../shared/engine-base.js";
import type { AssetBookRepository } from "../persistence/asset-book-repo.js";
import type { AssetRepository } from "../persistence/asset-repo.js";

// ── Service Interface ────────────────────────────────────────

export interface AssetService {
  /** Create a new asset in WIP status with one or more depreciation books. */
  createAsset(
    ctx: OperationContext,
    input: CreateAssetInput,
    books: CreateAssetBookInput[],
  ): Promise<ServiceResult<{ asset: Asset; books: AssetBook[] }>>;

  /** Capitalize a WIP asset — transitions status and records transaction. */
  capitalizeAsset(
    ctx: OperationContext,
    assetId: string,
    referenceJeId?: string,
  ): Promise<ServiceResult<{ asset: Asset; transactions: AssetTransaction[] }>>;

  /**
   * Run depreciation for a single asset book.
   * Records a DEPRECIATE transaction and updates the book.
   */
  depreciateAssetBook(
    ctx: OperationContext,
    assetId: string,
    bookType: BookType,
    depreciationDate: string,
    nextDepreciationDate: string | null,
    overrideParams?: Partial<DepreciationParams>,
  ): Promise<ServiceResult<{ transaction: AssetTransaction; book: AssetBook }>>;

  /**
   * Run batch depreciation for all eligible assets in an entity / book / period.
   */
  runBatchDepreciation(
    ctx: OperationContext,
    entityCode: string,
    bookType: BookType,
    fiscalYear: number,
    periodNumber: number,
    asOfDate: string,
  ): Promise<ServiceResult<{ run: DepreciationRun }>>;

  /** Revalue an asset book (up or down) and record the transaction. */
  revalueAssetBook(
    ctx: OperationContext,
    assetId: string,
    bookType: BookType,
    newCostBasis: string,
    newResidualValue: string | undefined,
    referenceJeId?: string,
  ): Promise<ServiceResult<{ transaction: AssetTransaction; book: AssetBook }>>;

  /** Dispose of an asset — records disposal proceeds and changes status. */
  disposeAsset(
    ctx: OperationContext,
    assetId: string,
    disposalAmount: string,
    referenceJeId?: string,
    notes?: string,
  ): Promise<ServiceResult<{ asset: Asset; transactions: AssetTransaction[] }>>;

  /** Retire an asset — zero remaining value, change status to RETIRED. */
  retireAsset(
    ctx: OperationContext,
    assetId: string,
    referenceJeId?: string,
    notes?: string,
  ): Promise<ServiceResult<{ asset: Asset; transactions: AssetTransaction[] }>>;
}

// ── Default Implementation ───────────────────────────────────

export class DefaultAssetService implements AssetService {
  constructor(
    private readonly assetRepo: AssetRepository,
    private readonly bookRepo: AssetBookRepository,
  ) {}

  // ── Create ─────────────────────────────────────────────────

  async createAsset(
    ctx: OperationContext,
    input: CreateAssetInput,
    bookInputs: CreateAssetBookInput[],
  ): Promise<ServiceResult<{ asset: Asset; books: AssetBook[] }>> {
    // Validate no duplicate book types
    const bookTypes = bookInputs.map((b) => b.bookType);
    const uniqueTypes = new Set(bookTypes);
    if (uniqueTypes.size !== bookTypes.length) {
      return fail("DUPLICATE_BOOK_TYPE", "Each book type must be unique per asset");
    }

    const asset = await this.assetRepo.create(input);

    const books: AssetBook[] = [];
    for (const bi of bookInputs) {
      const book = await this.bookRepo.create({
        ...bi,
        tenantId: asset.tenantId,
        assetId: asset.id,
      });
      books.push(book);
    }

    return ok({ asset, books });
  }

  // ── Capitalize ─────────────────────────────────────────────

  async capitalizeAsset(
    ctx: OperationContext,
    assetId: string,
    referenceJeId?: string,
  ): Promise<ServiceResult<{ asset: Asset; transactions: AssetTransaction[] }>> {
    const tenantId = ctx.tenantId;
    const asset = await this.assetRepo.findById(tenantId, assetId);
    if (!asset) {
      return fail("ASSET_NOT_FOUND", `Asset ${assetId} not found`);
    }
    if (asset.status !== AssetStatus.WIP) {
      return fail(
        "INVALID_STATUS_TRANSITION",
        `Cannot capitalize asset in status ${asset.status}; must be WIP`,
      );
    }

    // Record capitalize transaction for each book
    const books = await this.bookRepo.findMany({ tenantId, assetId });
    const transactions: AssetTransaction[] = [];

    for (const book of books) {
      const txn = await this.assetRepo.recordTransaction({
        tenantId,
        assetId,
        bookType: book.bookType,
        txnType: AssetTxnType.CAPITALIZE,
        amount: book.costBasis,
        currencyCode: book.currencyCode,
        fromValues: { status: AssetStatus.WIP },
        toValues: { status: AssetStatus.CAPITALIZED },
        referenceJeId: referenceJeId ?? null,
        performedBy: ctx.actorId,
      });
      transactions.push(txn);
    }

    const updated = await this.assetRepo.updateStatus(
      tenantId,
      assetId,
      AssetStatus.CAPITALIZED,
    );

    return ok({ asset: updated, transactions });
  }

  // ── Depreciate Single Book ─────────────────────────────────

  async depreciateAssetBook(
    ctx: OperationContext,
    assetId: string,
    bookType: BookType,
    depreciationDate: string,
    nextDepreciationDate: string | null,
    overrideParams?: Partial<DepreciationParams>,
  ): Promise<ServiceResult<{ transaction: AssetTransaction; book: AssetBook }>> {
    const tenantId = ctx.tenantId;

    const asset = await this.assetRepo.findById(tenantId, assetId);
    if (!asset) {
      return fail("ASSET_NOT_FOUND", `Asset ${assetId} not found`);
    }
    if (
      asset.status !== AssetStatus.CAPITALIZED &&
      asset.status !== AssetStatus.ACTIVE
    ) {
      return fail(
        "INVALID_STATUS",
        `Cannot depreciate asset in status ${asset.status}`,
      );
    }

    const book = await this.bookRepo.findByAssetAndType(
      tenantId,
      assetId,
      bookType,
    );
    if (!book) {
      return fail("BOOK_NOT_FOUND", `Book ${bookType} not found for asset ${assetId}`);
    }

    const params: DepreciationParams = {
      costBasis: book.costBasis,
      residualValue: book.residualValue,
      usefulLifeMonths: book.usefulLifeMonths,
      accumulatedDepreciation: book.accumulatedDepreciation,
      ...overrideParams,
    };

    const result = calculateDepreciation(
      book.depreciationMethod as DepreciationMethod,
      params,
    );

    // MC-4 compliance: compareAmounts instead of parseFloat
    if (compareAmounts(result.monthlyAmount, "0") === 0) {
      return fail("FULLY_DEPRECIATED", "Asset book is fully depreciated");
    }

    const fromValues = {
      accumulatedDepreciation: book.accumulatedDepreciation,
      netBookValue: book.netBookValue,
    };

    const updatedBook = await this.bookRepo.applyDepreciation(
      tenantId,
      book.id,
      result.monthlyAmount,
      depreciationDate,
      nextDepreciationDate,
    );

    const toValues = {
      accumulatedDepreciation: updatedBook.accumulatedDepreciation,
      netBookValue: updatedBook.netBookValue,
    };

    const transaction = await this.assetRepo.recordTransaction({
      tenantId,
      assetId,
      bookType,
      txnType: AssetTxnType.DEPRECIATE,
      amount: result.monthlyAmount,
      currencyCode: book.currencyCode,
      fromValues,
      toValues,
      performedBy: ctx.actorId,
    });

    // Transition to ACTIVE after first depreciation if still CAPITALIZED
    if (asset.status === AssetStatus.CAPITALIZED) {
      await this.assetRepo.updateStatus(tenantId, assetId, AssetStatus.ACTIVE);
    }

    return ok({ transaction, book: updatedBook });
  }

  // ── Batch Depreciation ─────────────────────────────────────

  async runBatchDepreciation(
    ctx: OperationContext,
    entityCode: string,
    bookType: BookType,
    fiscalYear: number,
    periodNumber: number,
    asOfDate: string,
  ): Promise<ServiceResult<{ run: DepreciationRun }>> {
    const tenantId = ctx.tenantId;

    // Create the run record
    let run = await this.bookRepo.createRun({
      tenantId,
      entityCode,
      bookType,
      fiscalYear,
      periodNumber,
      runBy: ctx.actorId,
    });

    // Mark as running
    run = await this.bookRepo.updateRun(tenantId, run.id, {
      status: DepreciationRunStatus.RUNNING,
      startedAt: new Date().toISOString(),
    });

    try {
      // Find all books due for depreciation
      const dueBooks = await this.bookRepo.findDueForDepreciation(
        tenantId,
        entityCode,
        bookType,
        asOfDate,
      );

      let assetCount = 0;
      // MC-4 compliance: accumulate amounts as strings via sumAmounts
      const amounts: string[] = [];

      for (const book of dueBooks) {
        // Calculate next depreciation date (one month forward)
        const nextDate = this.addOneMonth(asOfDate);

        const result = await this.depreciateAssetBook(
          ctx,
          book.assetId,
          bookType,
          asOfDate,
          nextDate,
        );

        if (result.ok) {
          assetCount++;
          amounts.push(result.value.transaction.amount);
        }
        // Skip failures silently — individual asset issues should not abort the run
      }

      run = await this.bookRepo.updateRun(tenantId, run.id, {
        status: DepreciationRunStatus.COMPLETED,
        assetCount,
        totalAmount: sumAmounts(amounts),
        completedAt: new Date().toISOString(),
      });

      return ok({ run });
    } catch (error) {
      run = await this.bookRepo.updateRun(tenantId, run.id, {
        status: DepreciationRunStatus.FAILED,
        completedAt: new Date().toISOString(),
      });
      const message =
        error instanceof Error ? error.message : "Unknown error during batch depreciation";
      return fail("BATCH_DEPRECIATION_FAILED", message);
    }
  }

  // ── Revalue ────────────────────────────────────────────────

  async revalueAssetBook(
    ctx: OperationContext,
    assetId: string,
    bookType: BookType,
    newCostBasis: string,
    newResidualValue: string | undefined,
    referenceJeId?: string,
  ): Promise<ServiceResult<{ transaction: AssetTransaction; book: AssetBook }>> {
    const tenantId = ctx.tenantId;

    const asset = await this.assetRepo.findById(tenantId, assetId);
    if (!asset) {
      return fail("ASSET_NOT_FOUND", `Asset ${assetId} not found`);
    }

    const book = await this.bookRepo.findByAssetAndType(
      tenantId,
      assetId,
      bookType,
    );
    if (!book) {
      return fail("BOOK_NOT_FOUND", `Book ${bookType} not found for asset ${assetId}`);
    }

    // MC-4 compliance: compareAmounts / subtractAmounts instead of parseFloat
    const isUpward = compareAmounts(newCostBasis, book.costBasis) > 0;

    const txnType = isUpward ? AssetTxnType.REVALUE_UP : AssetTxnType.REVALUE_DOWN;
    const diff = subtractAmounts(newCostBasis, book.costBasis);
    // Absolute value: if diff is negative, strip the leading "-"
    const amount = diff.startsWith("-") ? diff.slice(1) : diff;

    const fromValues = {
      costBasis: book.costBasis,
      residualValue: book.residualValue,
      netBookValue: book.netBookValue,
    };

    const updatedBook = await this.bookRepo.adjustCostBasis(
      tenantId,
      book.id,
      newCostBasis,
      newResidualValue,
    );

    const toValues = {
      costBasis: updatedBook.costBasis,
      residualValue: updatedBook.residualValue,
      netBookValue: updatedBook.netBookValue,
    };

    const transaction = await this.assetRepo.recordTransaction({
      tenantId,
      assetId,
      bookType,
      txnType,
      amount,
      currencyCode: book.currencyCode,
      fromValues,
      toValues,
      referenceJeId: referenceJeId ?? null,
      performedBy: ctx.actorId,
    });

    return ok({ transaction, book: updatedBook });
  }

  // ── Dispose ────────────────────────────────────────────────

  async disposeAsset(
    ctx: OperationContext,
    assetId: string,
    disposalAmount: string,
    referenceJeId?: string,
    notes?: string,
  ): Promise<ServiceResult<{ asset: Asset; transactions: AssetTransaction[] }>> {
    const tenantId = ctx.tenantId;

    const asset = await this.assetRepo.findById(tenantId, assetId);
    if (!asset) {
      return fail("ASSET_NOT_FOUND", `Asset ${assetId} not found`);
    }
    if (asset.status === AssetStatus.DISPOSED) {
      return fail("ALREADY_DISPOSED", `Asset ${assetId} is already disposed`);
    }
    if (asset.status === AssetStatus.WIP) {
      return fail(
        "INVALID_STATUS_TRANSITION",
        "Cannot dispose a WIP asset; capitalize first",
      );
    }

    const books = await this.bookRepo.findMany({ tenantId, assetId });
    const transactions: AssetTransaction[] = [];

    for (const book of books) {
      const fromValues = {
        costBasis: book.costBasis,
        accumulatedDepreciation: book.accumulatedDepreciation,
        netBookValue: book.netBookValue,
      };

      const txn = await this.assetRepo.recordTransaction({
        tenantId,
        assetId,
        bookType: book.bookType,
        txnType: AssetTxnType.DISPOSE,
        amount: disposalAmount,
        currencyCode: book.currencyCode,
        fromValues,
        toValues: { disposalProceeds: disposalAmount },
        referenceJeId: referenceJeId ?? null,
        performedBy: ctx.actorId,
        notes: notes ?? null,
      });
      transactions.push(txn);
    }

    const updated = await this.assetRepo.updateStatus(
      tenantId,
      assetId,
      AssetStatus.DISPOSED,
    );

    return ok({ asset: updated, transactions });
  }

  // ── Retire ─────────────────────────────────────────────────

  async retireAsset(
    ctx: OperationContext,
    assetId: string,
    referenceJeId?: string,
    notes?: string,
  ): Promise<ServiceResult<{ asset: Asset; transactions: AssetTransaction[] }>> {
    const tenantId = ctx.tenantId;

    const asset = await this.assetRepo.findById(tenantId, assetId);
    if (!asset) {
      return fail("ASSET_NOT_FOUND", `Asset ${assetId} not found`);
    }
    if (asset.status === AssetStatus.RETIRED || asset.status === AssetStatus.DISPOSED) {
      return fail(
        "INVALID_STATUS_TRANSITION",
        `Asset is already ${asset.status}`,
      );
    }
    if (asset.status === AssetStatus.WIP) {
      return fail(
        "INVALID_STATUS_TRANSITION",
        "Cannot retire a WIP asset; capitalize first",
      );
    }

    const books = await this.bookRepo.findMany({ tenantId, assetId });
    const transactions: AssetTransaction[] = [];

    for (const book of books) {
      const fromValues = {
        costBasis: book.costBasis,
        accumulatedDepreciation: book.accumulatedDepreciation,
        netBookValue: book.netBookValue,
      };

      const txn = await this.assetRepo.recordTransaction({
        tenantId,
        assetId,
        bookType: book.bookType,
        txnType: AssetTxnType.RETIRE,
        amount: book.netBookValue, // write-off remaining NBV
        currencyCode: book.currencyCode,
        fromValues,
        toValues: {
          accumulatedDepreciation: book.costBasis, // fully depreciated
          netBookValue: "0.0000",
        },
        referenceJeId: referenceJeId ?? null,
        performedBy: ctx.actorId,
        notes: notes ?? null,
      });
      transactions.push(txn);
    }

    const updated = await this.assetRepo.updateStatus(
      tenantId,
      assetId,
      AssetStatus.RETIRED,
    );

    return ok({ asset: updated, transactions });
  }

  // ── Helpers ────────────────────────────────────────────────

  private addOneMonth(isoDate: string): string {
    const date = new Date(isoDate);
    date.setMonth(date.getMonth() + 1);
    return date.toISOString().split("T")[0]!;
  }
}
