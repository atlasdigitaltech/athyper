/**
 * Versioned Document Service
 *
 * Manages governed version lifecycle for meta entities:
 * - reviseVersion: create new draft from approved/effective version
 * - freezeVersion: lock version for review
 * - markApproved: stamp approval on version
 * - promoteToEffective: activate version, supersede previous
 * - archivePreviousEffective: mark old effective as superseded
 *
 * This is the domain command layer for version governance.
 * Hook actions from lifecycle transitions delegate to these methods.
 */

import { createHash } from "node:crypto";

import { now, uuid } from "../data/db-helpers.js";

import type { LifecycleDB_Type } from "../data/db-helpers.js";
import type {
  EntityVersion,
  PromoteVersionResult,
  RequestContext,
  ReviseVersionRequest,
  ReviseVersionResult,
  VersionedDocumentService,
  VersionStatus,
} from "@athyper/core/meta";

export class VersionedDocumentServiceImpl implements VersionedDocumentService {
  constructor(private readonly db: LifecycleDB_Type) {}

  // ============================================================================
  // reviseVersion — Create New Draft from Existing Version
  // ============================================================================

  async reviseVersion(
    request: ReviseVersionRequest,
  ): Promise<ReviseVersionResult> {
    const { entityId, basedOnVersionId, changeSummary, changeType, ctx } =
      request;

    try {
      // 1. Load source version
      const source = await this.db
        .selectFrom("meta.entity_version")
        .selectAll()
        .where("id", "=", basedOnVersionId)
        .where("tenant_id", "=", ctx.tenantId)
        .executeTakeFirst();

      if (!source) {
        return { success: false, error: "Source version not found" };
      }

      // 2. Verify source is approved/effective (not draft)
      if (!["approved", "effective", "published"].includes(source.status)) {
        return {
          success: false,
          error: `Cannot revise version in '${source.status}' status. Must be approved or effective.`,
        };
      }

      // 2b. Enforce revision reason for governed entities
      const entity = await this.db
        .selectFrom("meta.entity")
        .select("feature_flags")
        .where("id", "=", entityId)
        .where("tenant_id", "=", ctx.tenantId)
        .executeTakeFirst();

      const featureFlags = entity?.feature_flags as Record<string, unknown> | null;
      const versioningPolicy = featureFlags?.versioning_policy as Record<string, unknown> | null;
      const isGoverned = versioningPolicy?.mode === "governed";

      if (isGoverned) {
        if (!changeType) {
          return {
            success: false,
            error: "change_type is required for governed entities (minor | major | breaking | editorial).",
          };
        }
        if (!changeSummary || changeSummary.trim().length < 20) {
          return {
            success: false,
            error: "change_summary is required for governed entities and must be at least 20 characters.",
          };
        }
      }

      // 3. Check no existing active draft (enforced by DB unique partial index too)
      const existingDraft = await this.db
        .selectFrom("meta.entity_version")
        .select("id")
        .where("tenant_id", "=", ctx.tenantId)
        .where("entity_id", "=", entityId)
        .where("status", "in", ["draft", "in_review"])
        .executeTakeFirst();

      if (existingDraft) {
        return {
          success: false,
          error: `Active draft already exists (${existingDraft.id}). Complete or withdraw it first.`,
        };
      }

      // 4. Get next version number
      const eps = await this.db
        .selectFrom("meta.entity_publish_state")
        .select("latest_version_no")
        .where("entity_id", "=", entityId)
        .executeTakeFirst();

      const nextVersionNo = (eps?.latest_version_no ?? source.version_no) + 1;

      // 5. Create new draft version
      const newVersionId = uuid();
      await this.db
        .insertInto("meta.entity_version")
        .values({
          id: newVersionId,
          tenant_id: ctx.tenantId,
          entity_id: entityId,
          version_no: nextVersionNo,
          status: "draft",
          label: `v${nextVersionNo} (draft)`,
          behaviors: source.behaviors,
          derived_from_version_id: basedOnVersionId,
          supersedes_version_id: null,
          is_effective: false,
          effective_from: null,
          effective_to: null,
          approved_at: null,
          approved_by: null,
          change_summary: changeSummary ?? null,
          change_type: changeType ?? null,
          is_working_copy: true,
          lock_version: 1,
          lifecycle_instance_id: null,
          published_at: null,
          published_by: null,
          created_at: now(),
          created_by: ctx.userId,
          updated_at: null,
          updated_by: null,
        })
        .execute();

      // 6. Clone fields from source version
      const fields = await this.db
        .selectFrom("meta.field" as any)
        .selectAll()
        .where("entity_version_id", "=", basedOnVersionId)
        .where("tenant_id", "=", ctx.tenantId)
        .execute();

      for (const field of fields) {
        const f = field as Record<string, unknown>;
        await this.db
          .insertInto("meta.field" as any)
          .values({
            ...f,
            id: uuid(),
            entity_version_id: newVersionId,
            created_at: now(),
            created_by: ctx.userId,
            updated_at: null,
            updated_by: null,
          } as any)
          .execute();
      }

      // 7. Clone relations from source version
      const relations = await this.db
        .selectFrom("meta.relation" as any)
        .selectAll()
        .where("entity_version_id", "=", basedOnVersionId)
        .where("tenant_id", "=", ctx.tenantId)
        .execute();

      for (const relation of relations) {
        const r = relation as Record<string, unknown>;
        await this.db
          .insertInto("meta.relation" as any)
          .values({
            ...r,
            id: uuid(),
            entity_version_id: newVersionId,
            created_at: now(),
            created_by: ctx.userId,
          } as any)
          .execute();
      }

      // 8. Clone index definitions from source version
      const indexes = await this.db
        .selectFrom("meta.index_def" as any)
        .selectAll()
        .where("entity_version_id", "=", basedOnVersionId)
        .where("tenant_id", "=", ctx.tenantId)
        .execute();

      for (const idx of indexes) {
        const i = idx as Record<string, unknown>;
        await this.db
          .insertInto("meta.index_def" as any)
          .values({
            ...i,
            id: uuid(),
            entity_version_id: newVersionId,
            created_at: now(),
            created_by: ctx.userId,
          } as any)
          .execute();
      }

      // 9. Update entity_publish_state
      await this.db
        .updateTable("meta.entity_publish_state")
        .set({
          current_draft_version_id: newVersionId,
          latest_version_no: nextVersionNo,
          status_summary: `v${nextVersionNo} draft`,
          updated_at: now(),
        })
        .where("entity_id", "=", entityId)
        .execute();

      console.log(
        JSON.stringify({
          msg: "version_revised",
          entityId,
          sourceVersionId: basedOnVersionId,
          newVersionId,
          newVersionNo: nextVersionNo,
          tenantId: ctx.tenantId,
        }),
      );

      return {
        success: true,
        newVersion: {
          id: newVersionId,
          versionNo: nextVersionNo,
          status: "draft" as VersionStatus,
        },
      };
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "version_revise_error",
          entityId,
          basedOnVersionId,
          error: String(error),
        }),
      );
      return { success: false, error: String(error) };
    }
  }

  // ============================================================================
  // freezeVersion — Lock Version for Review
  // ============================================================================

  async freezeVersion(
    versionId: string,
    reason: string,
    ctx: RequestContext,
  ): Promise<void> {
    await this.db
      .updateTable("meta.entity_version")
      .set({
        is_working_copy: false,
        updated_at: now(),
        updated_by: ctx.userId,
      })
      .where("id", "=", versionId)
      .where("tenant_id", "=", ctx.tenantId)
      .execute();

    console.log(
      JSON.stringify({
        msg: "version_frozen",
        versionId,
        reason,
        tenantId: ctx.tenantId,
      }),
    );
  }

  // ============================================================================
  // markApproved — Stamp Approval
  // ============================================================================

  async markApproved(
    versionId: string,
    ctx: RequestContext,
  ): Promise<void> {
    await this.db
      .updateTable("meta.entity_version")
      .set({
        approved_at: now(),
        approved_by: ctx.userId,
        updated_at: now(),
        updated_by: ctx.userId,
      })
      .where("id", "=", versionId)
      .where("tenant_id", "=", ctx.tenantId)
      .execute();

    console.log(
      JSON.stringify({
        msg: "version_marked_approved",
        versionId,
        approvedBy: ctx.userId,
        tenantId: ctx.tenantId,
      }),
    );
  }

  // ============================================================================
  // promoteToEffective — Activate Version
  // ============================================================================

  async promoteToEffective(
    versionId: string,
    ctx: RequestContext,
    effectiveFrom?: Date,
  ): Promise<PromoteVersionResult> {
    try {
      // 1. Load version
      const version = await this.db
        .selectFrom("meta.entity_version")
        .selectAll()
        .where("id", "=", versionId)
        .where("tenant_id", "=", ctx.tenantId)
        .executeTakeFirst();

      if (!version) {
        return { success: false, error: "Version not found" };
      }

      // 2. Archive previous effective version
      const supersededId = await this.archivePreviousEffective(
        version.entity_id,
        versionId,
        ctx,
      );

      // 3. Promote this version
      const effectiveAt = effectiveFrom ?? new Date();
      await this.db
        .updateTable("meta.entity_version")
        .set({
          is_effective: true,
          effective_from: effectiveAt,
          supersedes_version_id: supersededId ?? null,
          is_working_copy: false,
          updated_at: now(),
          updated_by: ctx.userId,
        })
        .where("id", "=", versionId)
        .where("tenant_id", "=", ctx.tenantId)
        .execute();

      // 4. Update entity_publish_state
      await this.db
        .updateTable("meta.entity_publish_state")
        .set({
          published_version_id: versionId,
          current_draft_version_id: null,
          status_summary: `v${version.version_no} effective`,
          updated_at: now(),
        })
        .where("entity_id", "=", version.entity_id)
        .execute();

      console.log(
        JSON.stringify({
          msg: "version_promoted_to_effective",
          versionId,
          entityId: version.entity_id,
          versionNo: version.version_no,
          supersededVersionId: supersededId,
          effectiveFrom: effectiveAt.toISOString(),
          tenantId: ctx.tenantId,
        }),
      );

      return {
        success: true,
        effectiveVersionId: versionId,
        supersededVersionId: supersededId,
      };
    } catch (error) {
      console.error(
        JSON.stringify({
          msg: "version_promote_error",
          versionId,
          error: String(error),
        }),
      );
      return { success: false, error: String(error) };
    }
  }

  // ============================================================================
  // archivePreviousEffective — Supersede Old Version
  // ============================================================================

  async archivePreviousEffective(
    entityId: string,
    newEffectiveVersionId: string,
    ctx: RequestContext,
  ): Promise<string | undefined> {
    // Find current effective version (if any, and not the new one)
    const current = await this.db
      .selectFrom("meta.entity_version")
      .select(["id", "version_no"])
      .where("tenant_id", "=", ctx.tenantId)
      .where("entity_id", "=", entityId)
      .where("is_effective", "=", true)
      .where("id", "!=", newEffectiveVersionId)
      .executeTakeFirst();

    if (!current) {
      return undefined;
    }

    // Supersede it
    await this.db
      .updateTable("meta.entity_version")
      .set({
        is_effective: false,
        status: "superseded",
        effective_to: now(),
        updated_at: now(),
        updated_by: ctx.userId,
      })
      .where("id", "=", current.id)
      .where("tenant_id", "=", ctx.tenantId)
      .execute();

    console.log(
      JSON.stringify({
        msg: "version_superseded",
        supersededVersionId: current.id,
        supersededVersionNo: current.version_no,
        newEffectiveVersionId,
        entityId,
        tenantId: ctx.tenantId,
      }),
    );

    return current.id;
  }

  // ============================================================================
  // updateVersionStatus — Generic Status Change
  // ============================================================================

  async updateVersionStatus(
    versionId: string,
    targetStatus: VersionStatus,
    ctx: RequestContext,
  ): Promise<void> {
    await this.db
      .updateTable("meta.entity_version")
      .set({
        status: targetStatus,
        updated_at: now(),
        updated_by: ctx.userId,
      })
      .where("id", "=", versionId)
      .where("tenant_id", "=", ctx.tenantId)
      .execute();

    console.log(
      JSON.stringify({
        msg: "version_status_updated",
        versionId,
        targetStatus,
        tenantId: ctx.tenantId,
      }),
    );
  }

  // ============================================================================
  // isFrozen — Check Immutability
  // ============================================================================

  async isFrozen(
    versionId: string,
    tenantId: string,
  ): Promise<boolean> {
    const version = await this.db
      .selectFrom("meta.entity_version")
      .select("status")
      .where("id", "=", versionId)
      .where("tenant_id", "=", tenantId)
      .executeTakeFirst();

    if (!version) {
      return true; // non-existent versions are effectively frozen
    }

    return version.status !== "draft";
  }

  // ============================================================================
  // getEffectiveVersion — Current Live Version
  // ============================================================================

  async getEffectiveVersion(
    entityId: string,
    tenantId: string,
  ): Promise<EntityVersion | undefined> {
    const row = await this.db
      .selectFrom("meta.entity_version")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("entity_id", "=", entityId)
      .where("is_effective", "=", true)
      .executeTakeFirst();

    if (!row) return undefined;
    return this.mapVersionRow(row);
  }

  // ============================================================================
  // getCurrentDraft — Current Working Draft
  // ============================================================================

  async getCurrentDraft(
    entityId: string,
    tenantId: string,
  ): Promise<EntityVersion | undefined> {
    const row = await this.db
      .selectFrom("meta.entity_version")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .where("entity_id", "=", entityId)
      .where("status", "in", ["draft", "in_review"])
      .executeTakeFirst();

    if (!row) return undefined;
    return this.mapVersionRow(row);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private mapVersionRow(row: Record<string, unknown>): EntityVersion {
    return {
      id: row.id as string,
      entityName: row.entity_id as string,
      version: String(row.version_no),
      schema: row.behaviors as any,
      isActive: (row.status as string) === "effective" || (row.is_effective as boolean),
      createdAt: row.created_at as Date,
      createdBy: row.created_by as string,
    };
  }

  /**
   * Compute and store a content-addressable hash for a version.
   * Hash is computed from: fields + relations + indexes + behaviors.
   * Useful for: change detection, equality comparison, cache validation.
   */
  async computeVersionHash(
    versionId: string,
    tenantId: string,
  ): Promise<string> {
    const [version, fields, relations, indexes] = await Promise.all([
      this.db
        .selectFrom("meta.entity_version")
        .select("behaviors")
        .where("id", "=", versionId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst(),
      this.db
        .selectFrom("meta.field" as any)
        .selectAll()
        .where("entity_version_id", "=", versionId)
        .where("tenant_id", "=", tenantId)
        .orderBy("sort_order" as any, "asc")
        .execute(),
      this.db
        .selectFrom("meta.relation" as any)
        .selectAll()
        .where("entity_version_id", "=", versionId)
        .where("tenant_id", "=", tenantId)
        .execute(),
      this.db
        .selectFrom("meta.index_def" as any)
        .selectAll()
        .where("entity_version_id", "=", versionId)
        .where("tenant_id", "=", tenantId)
        .execute(),
    ]);

    const payload = JSON.stringify({
      behaviors: version?.behaviors ?? null,
      fields: this.stripVolatile(fields),
      relations: this.stripVolatile(relations),
      indexes: this.stripVolatile(indexes),
    });

    const hash = createHash("sha256").update(payload).digest("hex");

    // Store the hash
    await this.db
      .updateTable("meta.entity_version")
      .set({ version_hash: hash })
      .where("id", "=", versionId)
      .where("tenant_id", "=", tenantId)
      .execute();

    return hash;
  }

  /**
   * Strip volatile fields (id, timestamps) from rows for deterministic hashing.
   */
  private stripVolatile(rows: Record<string, unknown>[]): unknown[] {
    return rows.map((r) => {
      const { id, created_at, created_by, updated_at, updated_by, entity_version_id, ...rest } = r;
      return rest;
    });
  }
}
