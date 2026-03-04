// ============================================================
// Asset Engine — Asset Repository Interface
// Athyper v2.1 Business Operating Platform — Phase 2
// ============================================================

import type {
  Asset,
  CreateAssetInput,
  UpdateAssetInput,
  AssetFilter,
  RecordAssetTransactionInput,
  AssetTransaction,
  AssetTransactionFilter,
} from "../domain/types.js";

/**
 * Repository interface for the fin.asset table and fin.asset_transaction table.
 */
export interface AssetRepository {
  // ── Asset CRUD ──────────────────────────────────────────────

  /** Create a new asset in WIP status. */
  create(input: CreateAssetInput): Promise<Asset>;

  /** Find asset by ID within a tenant. */
  findById(tenantId: string, assetId: string): Promise<Asset | null>;

  /** Find asset by asset number within a tenant + entity. */
  findByNumber(
    tenantId: string,
    entityCode: string,
    assetNumber: string,
  ): Promise<Asset | null>;

  /** List assets matching filter criteria. */
  findMany(filter: AssetFilter): Promise<Asset[]>;

  /** Update mutable fields on an asset. */
  update(
    tenantId: string,
    assetId: string,
    input: UpdateAssetInput,
  ): Promise<Asset>;

  /** Update the asset status (state machine transition). */
  updateStatus(
    tenantId: string,
    assetId: string,
    status: Asset["status"],
  ): Promise<Asset>;

  // ── Asset Transactions ─────────────────────────────────────

  /** Record an immutable asset lifecycle transaction. */
  recordTransaction(
    input: RecordAssetTransactionInput,
  ): Promise<AssetTransaction>;

  /** List transactions for an asset, optionally filtered. */
  findTransactions(
    filter: AssetTransactionFilter,
  ): Promise<AssetTransaction[]>;

  /** Find a single transaction by ID. */
  findTransactionById(
    tenantId: string,
    txnId: string,
  ): Promise<AssetTransaction | null>;
}
