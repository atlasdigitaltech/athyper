/**
 * Legal Hold Service
 *
 * Runtime operations for first-class legal holds:
 *   - Create hold (issue a new legal hold for a scope)
 *   - Release hold (with reason + released_by audit trail)
 *   - Check hold (is_legal_hold_active for a given scope)
 *   - List active holds (for admin dashboards)
 *   - Attach manifests to hold (link affected archive manifests)
 *
 * All mutations are audited via audit.audit_log (standard entity auditing).
 * Immutability enforced by core.prevent_legal_hold_mutation() trigger.
 */

import { sql } from "kysely";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

// ============================================================================
// Types
// ============================================================================

export interface CreateLegalHoldInput {
  tenantId: string;
  holdReference: string;
  holdSource: "LITIGATION" | "REGULATORY" | "INTERNAL" | "PRESERVATION" | "INVESTIGATION";
  reason: string;
  scopeType: "global" | "schema" | "table" | "entity";
  targetSchema?: string;
  targetTable?: string;
  entityId?: string;
  issuedBy: string;
  complianceFramework?: string;
  metadata?: Record<string, unknown>;
}

export interface ReleaseLegalHoldInput {
  tenantId: string;
  holdId: string;
  releasedBy: string;
  releaseReason: string;
}

export interface LegalHold {
  id: string;
  tenantId: string;
  holdReference: string;
  holdSource: string;
  reason: string;
  scopeType: string;
  targetSchema: string | null;
  targetTable: string | null;
  entityId: string | null;
  issuedBy: string;
  issuedAt: Date;
  releasedBy: string | null;
  releasedAt: Date | null;
  releaseReason: string | null;
  complianceFramework: string | null;
  heldManifestCount: number;
}

// ============================================================================
// Service
// ============================================================================

export class LegalHoldService {
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Issue a new legal hold. Freezes retention and tiering for the given scope.
   */
  async createHold(input: CreateLegalHoldInput): Promise<{ holdId: string }> {
    const result = await sql<{ id: string }>`
      INSERT INTO core.legal_hold
        (tenant_id, hold_reference, hold_source, reason,
         scope_type, target_schema, target_table, entity_id,
         issued_by, compliance_framework, metadata)
      VALUES
        (${input.tenantId}::uuid, ${input.holdReference}, ${input.holdSource}, ${input.reason},
         ${input.scopeType}, ${input.targetSchema ?? null}, ${input.targetTable ?? null}, ${input.entityId ? sql`${input.entityId}::uuid` : null},
         ${input.issuedBy}, ${input.complianceFramework ?? null}, ${input.metadata ? sql`${JSON.stringify(input.metadata)}::jsonb` : null})
      RETURNING id
    `.execute(this.db);

    const holdId = result.rows[0]?.id;
    if (!holdId) {
      throw new Error("Failed to create legal hold");
    }

    // Auto-attach existing archive manifests that fall within the hold scope
    await this.attachMatchingManifests(input.tenantId, holdId, input);

    return { holdId };
  }

  /**
   * Release an active legal hold. Cascades release to held manifests via trigger.
   */
  async releaseHold(input: ReleaseLegalHoldInput): Promise<void> {
    const result = await sql`
      UPDATE core.legal_hold
      SET released_by = ${input.releasedBy},
          released_at = now(),
          release_reason = ${input.releaseReason}
      WHERE id = ${input.holdId}::uuid
        AND tenant_id = ${input.tenantId}::uuid
        AND released_at IS NULL
    `.execute(this.db);

    if (result.numAffectedRows === 0n) {
      throw new Error(
        `Legal hold ${input.holdId} not found, already released, or belongs to different tenant`,
      );
    }
  }

  /**
   * Check if a legal hold is active for the given scope.
   * Delegates to core.is_legal_hold_active() SQL function.
   */
  async isHoldActive(
    tenantId: string,
    schema?: string,
    table?: string,
    entityId?: string,
  ): Promise<boolean> {
    const result = await sql<{ is_active: boolean }>`
      SELECT core.is_legal_hold_active(
        ${tenantId}::uuid,
        ${schema ?? null},
        ${table ?? null},
        ${entityId ? sql`${entityId}::uuid` : null}
      ) as is_active
    `.execute(this.db);

    return result.rows[0]?.is_active ?? false;
  }

  /**
   * List active legal holds for a tenant.
   */
  async listActiveHolds(tenantId: string): Promise<LegalHold[]> {
    const result = await sql<{
      id: string;
      tenant_id: string;
      hold_reference: string;
      hold_source: string;
      reason: string;
      scope_type: string;
      target_schema: string | null;
      target_table: string | null;
      entity_id: string | null;
      issued_by: string;
      issued_at: Date;
      compliance_framework: string | null;
      held_manifest_count: number;
    }>`
      SELECT * FROM core.active_legal_holds
      WHERE tenant_id = ${tenantId}::uuid
      ORDER BY issued_at DESC
    `.execute(this.db);

    return result.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      holdReference: r.hold_reference,
      holdSource: r.hold_source,
      reason: r.reason,
      scopeType: r.scope_type,
      targetSchema: r.target_schema,
      targetTable: r.target_table,
      entityId: r.entity_id,
      issuedBy: r.issued_by,
      issuedAt: r.issued_at,
      releasedBy: null,
      releasedAt: null,
      releaseReason: null,
      complianceFramework: r.compliance_framework,
      heldManifestCount: Number(r.held_manifest_count),
    }));
  }

  /**
   * List all active holds covering a specific scope.
   * Uses core.active_holds_for_scope() for overlap visibility.
   */
  async activeHoldsForScope(
    tenantId: string,
    schema?: string,
    table?: string,
    entityId?: string,
  ): Promise<LegalHold[]> {
    const result = await sql<{
      hold_id: string;
      hold_reference: string;
      hold_source: string;
      reason: string;
      scope_type: string;
      target_schema: string | null;
      target_table: string | null;
      entity_id: string | null;
      issued_by: string;
      issued_at: Date;
      compliance_framework: string | null;
      held_manifest_count: string;
    }>`
      SELECT * FROM core.active_holds_for_scope(
        ${tenantId}::uuid,
        ${schema ?? null},
        ${table ?? null},
        ${entityId ? sql`${entityId}::uuid` : null}
      )
    `.execute(this.db);

    return result.rows.map((r) => ({
      id: r.hold_id,
      tenantId,
      holdReference: r.hold_reference,
      holdSource: r.hold_source,
      reason: r.reason,
      scopeType: r.scope_type,
      targetSchema: r.target_schema,
      targetTable: r.target_table,
      entityId: r.entity_id,
      issuedBy: r.issued_by,
      issuedAt: r.issued_at,
      releasedBy: null,
      releasedAt: null,
      releaseReason: null,
      complianceFramework: r.compliance_framework,
      heldManifestCount: Number(r.held_manifest_count),
    }));
  }

  /**
   * Check if a specific manifest is held by any active legal hold.
   */
  async isManifestHeld(manifestId: string): Promise<boolean> {
    const result = await sql<{ is_held: boolean }>`
      SELECT core.is_manifest_held(${manifestId}::uuid) as is_held
    `.execute(this.db);
    return result.rows[0]?.is_held ?? false;
  }

  /**
   * Get full hold history for a tenant (active + released).
   */
  async getHoldHistory(
    tenantId: string,
    limit: number = 50,
  ): Promise<LegalHold[]> {
    const result = await sql<{
      id: string;
      tenant_id: string;
      hold_reference: string;
      hold_source: string;
      reason: string;
      scope_type: string;
      target_schema: string | null;
      target_table: string | null;
      entity_id: string | null;
      issued_by: string;
      issued_at: Date;
      released_by: string | null;
      released_at: Date | null;
      release_reason: string | null;
      compliance_framework: string | null;
    }>`
      SELECT id, tenant_id, hold_reference, hold_source, reason,
             scope_type, target_schema, target_table, entity_id,
             issued_by, issued_at, released_by, released_at, release_reason,
             compliance_framework
      FROM core.legal_hold
      WHERE tenant_id = ${tenantId}::uuid
      ORDER BY issued_at DESC
      LIMIT ${limit}
    `.execute(this.db);

    return result.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      holdReference: r.hold_reference,
      holdSource: r.hold_source,
      reason: r.reason,
      scopeType: r.scope_type,
      targetSchema: r.target_schema,
      targetTable: r.target_table,
      entityId: r.entity_id,
      issuedBy: r.issued_by,
      issuedAt: r.issued_at,
      releasedBy: r.released_by,
      releasedAt: r.released_at,
      releaseReason: r.release_reason,
      complianceFramework: r.compliance_framework,
      heldManifestCount: 0,
    }));
  }

  /**
   * Attach matching archive manifests to a hold based on its scope.
   */
  private async attachMatchingManifests(
    tenantId: string,
    holdId: string,
    input: CreateLegalHoldInput,
  ): Promise<void> {
    // Build scope filter for matching manifests
    let scopeFilter = sql`am.tenant_id = ${tenantId}::uuid`;

    if (input.scopeType === "table" && input.targetSchema && input.targetTable) {
      // For evt.event table holds, match all manifests (they are event partitions)
      if (input.targetSchema === "evt" && input.targetTable === "event") {
        // All manifests belong to evt.event — match all
      } else {
        // For non-event tables, no manifests to attach
        return;
      }
    } else if (input.scopeType === "schema" && input.targetSchema === "evt") {
      // Schema-level hold on evt — match all manifests
    } else if (input.scopeType === "global") {
      // Global hold — match all manifests
    } else {
      // Entity-level or non-evt scope — no manifests to attach
      return;
    }

    await sql`
      INSERT INTO core.legal_hold_manifest (legal_hold_id, manifest_id, tenant_id, held_by)
      SELECT ${holdId}::uuid, am.id, am.tenant_id, ${input.issuedBy}
      FROM evt.archive_manifest am
      WHERE ${scopeFilter}
        AND am.detached_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM core.legal_hold_manifest lhm
          WHERE lhm.legal_hold_id = ${holdId}::uuid AND lhm.manifest_id = am.id
        )
    `.execute(this.db);
  }
}
