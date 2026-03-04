/**
 * Tenant Context Setter
 *
 * Sets the PostgreSQL session variable `athyper.current_tenant` for
 * Row-Level Security (RLS) enforcement. When RLS is enabled on audit
 * tables, this variable determines which tenant's data is accessible.
 *
 * Also provides wrappers for SECURITY DEFINER functions that replace
 * ad-hoc SET LOCAL bypass patterns.
 *
 * Usage:
 *   await setTenantContext(db, tenantId);
 *   // Subsequent queries on this connection see only this tenant's rows
 *
 * The SET LOCAL variant is transaction-scoped — automatically cleared
 * after COMMIT/ROLLBACK, preventing accidental cross-tenant access.
 */

import { sql } from "kysely";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Tenant context management
// ============================================================================

/**
 * Set the current tenant for RLS-enforced queries.
 * Uses SET LOCAL (transaction-scoped) for safety.
 */
export async function setTenantContext(
  db: Kysely<DB>,
  tenantId: string,
): Promise<void> {
  if (!isValidUUID(tenantId)) {
    throw new Error(`Invalid tenant ID format: ${tenantId}`);
  }

  await sql`SET LOCAL athyper.current_tenant = ${tenantId}`.execute(db);
}

/**
 * Clear the current tenant context.
 * Useful for worker processes that operate across tenants.
 */
export async function clearTenantContext(
  db: Kysely<DB>,
): Promise<void> {
  await sql`RESET athyper.current_tenant`.execute(db);
}

/**
 * @deprecated Use `callKeyRotationUpdate()` or `callRetentionDelete()` instead.
 * These SECURITY DEFINER wrappers are the correct way to bypass immutability.
 *
 * Set the audit retention bypass variable for authorized operations.
 * Requires the caller to have the appropriate DB role (athyper_retention or athyper_admin).
 */
export async function setAuditBypass(
  db: Kysely<DB>,
): Promise<void> {
  await sql`SET LOCAL athyper.audit_retention_bypass = 'true'`.execute(db);
}

// ============================================================================
// SECURITY DEFINER function wrappers
// ============================================================================

export interface KeyRotationUpdateParams {
  tenantId: string;
  rowId: string;
  eventTimestamp: Date;
  ip_address: string | null;
  user_agent: string | null;
  comment: string | null;
  attachments: string | null;
  key_version: number;
}

/**
 * Call the `core.audit_key_rotation_update()` SECURITY DEFINER function
 * to re-encrypt audit event columns during key rotation.
 *
 * This function is owned by `athyper_admin` and internally sets the
 * immutability bypass variable, so the caller does not need to SET LOCAL.
 */
export async function callKeyRotationUpdate(
  db: Kysely<DB>,
  params: KeyRotationUpdateParams,
): Promise<void> {
  if (!isValidUUID(params.tenantId)) {
    throw new Error(`Invalid tenant ID format: ${params.tenantId}`);
  }
  if (!isValidUUID(params.rowId)) {
    throw new Error(`Invalid row ID format: ${params.rowId}`);
  }

  await sql`
    SELECT core.audit_key_rotation_update(
      ${params.tenantId}::uuid,
      ${params.rowId}::uuid,
      ${params.eventTimestamp.toISOString()}::timestamptz,
      ${params.ip_address},
      ${params.user_agent},
      ${params.comment},
      ${params.attachments},
      ${params.key_version}::int
    )
  `.execute(db);
}

/**
 * Call the `core.audit_retention_delete()` SECURITY DEFINER function
 * to delete old audit rows for retention.
 *
 * Table name is validated against an allowlist inside the function.
 * Returns the number of deleted rows.
 */
export async function callRetentionDelete(
  db: Kysely<DB>,
  tableName: string,
  cutoffDate: Date,
  tenantId?: string,
): Promise<number> {
  if (tenantId && !isValidUUID(tenantId)) {
    throw new Error(`Invalid tenant ID format: ${tenantId}`);
  }

  const result = await sql<{ audit_retention_delete: number }>`
    SELECT core.audit_retention_delete(
      ${tableName},
      ${cutoffDate.toISOString()}::timestamptz,
      ${tenantId ? sql`${tenantId}::uuid` : sql`NULL::uuid`}
    )
  `.execute(db);

  return Number(result.rows[0]?.audit_retention_delete ?? 0);
}

// ============================================================================
// Validation
// ============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}
