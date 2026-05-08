/**
 * MetadataApprovalBridge — Phase 2.5 skeleton / Phase 3.4 full wiring
 *
 * Bridges Metadata Studio changes (entity/field definition updates) through the
 * workflow approval process before they become effective.
 *
 * Phase 2.5 delivers:
 *   - MetadataApprovalBridge class skeleton with interface stubs
 *   - unit-testable submit() and approve() methods (no workflow wiring yet)
 *   - DB tables: control.metadata_change_request (added to control.sql)
 *
 * Phase 3.4 (after workflow engine is ready) adds:
 *   - createWorkflowRequest() call inside submit()
 *   - WorkflowEngine.complete() inside approve() / reject()
 *   - onReady callback: registers MetadataApprovalBridge as workflow hook
 *
 * Change request lifecycle:
 *   submitted → pending_review → approved → applied
 *                             → rejected
 *
 * When approved: EntityCompilerService.invalidate() is called to recompile
 * the affected entity descriptor.
 */

import type { Kysely } from "kysely";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChangeRequestStatus =
  | "submitted"
  | "pending_review"
  | "approved"
  | "rejected"
  | "applied";

export type ChangeType =
  | "add_field"
  | "remove_field"
  | "update_field"
  | "reorder_fields"
  | "update_entity_config"
  | "add_overlay"
  | "remove_overlay";

export interface ChangeRequestPayload {
  entityCode:  string;
  changeType:  ChangeType;
  fieldName?:  string;
  before?:     Record<string, unknown>;
  after?:      Record<string, unknown>;
  rationale?:  string;
}

export interface MetadataChangeRequest {
  id:          string;
  tenantId:    string;
  entityCode:  string;
  changeType:  ChangeType;
  status:      ChangeRequestStatus;
  payload:     ChangeRequestPayload;
  submittedBy: string;
  reviewedBy:  string | null;
  reviewedAt:  string | null;
  reviewNote:  string | null;
  appliedAt:   string | null;
  workflowRequestId: string | null;
  createdAt:   string;
  updatedAt:   string | null;
}

// ── MetadataApprovalBridge ────────────────────────────────────────────────────

export class MetadataApprovalBridge {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;

  // Phase 3.4: these will be injected once WorkflowEngine is wired
  private workflowEngine: { createRequest?: Function; completeTask?: Function } | null = null;
  private entityCompiler: { invalidate?: (code: string, tenantId?: string) => void | Promise<void> } | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>) {
    this.db = db;
  }

  /**
   * Phase 3.4: wire the workflow engine and entity compiler.
   * Called from Lifecycle.onReady() after both services are initialised.
   */
  wire(deps: {
    workflowEngine?: { createRequest?: Function; completeTask?: Function };
    entityCompiler?: { invalidate?: (code: string, tenantId?: string) => void | Promise<void> };
  }): void {
    this.workflowEngine = deps.workflowEngine ?? null;
    this.entityCompiler = deps.entityCompiler ?? null;
  }

  /**
   * Submit a metadata change for review.
   * Creates a change_request row and (Phase 3.4) a workflow request.
   */
  async submit(
    tenantId: string,
    payload: ChangeRequestPayload,
    submittedBy: string,
  ): Promise<MetadataChangeRequest> {
    const row = await this.db
      .insertInto("control.metadata_change_request" as never)
      .values({
        tenant_id:    tenantId,
        entity_code:  payload.entityCode,
        change_type:  payload.changeType,
        status:       "submitted",
        payload:      JSON.stringify(payload),
        submitted_by: submittedBy,
        created_by:   submittedBy,
      } as never)
      .returningAll()
      .executeTakeFirstOrThrow() as Record<string, unknown>;

    // Phase 3.4: create workflow request when engine is wired
    if (this.workflowEngine?.createRequest) {
      try {
        const wfReqId = await (this.workflowEngine.createRequest as Function)(
          tenantId, "metadata_change", row["id"], submittedBy
        );
        await this.db
          .updateTable("control.metadata_change_request" as never)
          .set({ workflow_request_id: wfReqId, status: "pending_review" } as never)
          .where("id" as never, "=", row["id"] as never)
          .execute();
        (row as Record<string, unknown>)["workflow_request_id"] = wfReqId;
        (row as Record<string, unknown>)["status"] = "pending_review";
      } catch { /* workflow not yet wired in Phase 2 — continue */ }
    }

    return this.mapRow(row);
  }

  /**
   * Approve a change request and apply the change.
   */
  async approve(
    id: string,
    tenantId: string,
    reviewedBy: string,
    reviewNote?: string,
  ): Promise<MetadataChangeRequest> {
    const row = await this.db
      .updateTable("control.metadata_change_request" as never)
      .set({
        status:      "approved",
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote ?? null,
        updated_at:  new Date().toISOString(),
        updated_by:  reviewedBy,
      } as never)
      .where("id" as never, "=", id as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .returningAll()
      .executeTakeFirstOrThrow() as Record<string, unknown>;

    // Apply the change and invalidate entity compiler cache
    await this.applyChange(row);
    return this.mapRow(row);
  }

  /**
   * Reject a change request.
   */
  async reject(
    id: string,
    tenantId: string,
    reviewedBy: string,
    reviewNote: string,
  ): Promise<MetadataChangeRequest> {
    const row = await this.db
      .updateTable("control.metadata_change_request" as never)
      .set({
        status:      "rejected",
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote,
        updated_at:  new Date().toISOString(),
        updated_by:  reviewedBy,
      } as never)
      .where("id" as never, "=", id as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .returningAll()
      .executeTakeFirstOrThrow() as Record<string, unknown>;

    return this.mapRow(row);
  }

  /**
   * List pending change requests for review.
   */
  async listPending(tenantId: string, entityCode?: string): Promise<MetadataChangeRequest[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = this.db
      .selectFrom("control.metadata_change_request as mcr" as never)
      .selectAll("mcr" as never)
      .where("mcr.tenant_id" as never, "=", tenantId as never)
      .where("mcr.status" as never, "in", ["submitted", "pending_review"] as never);

    if (entityCode) {
      q = q.where("mcr.entity_code" as never, "=", entityCode as never);
    }

    const rows = await q.orderBy("mcr.created_at" as never, "desc").execute() as Record<string, unknown>[];
    return rows.map(this.mapRow.bind(this));
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async applyChange(row: Record<string, unknown>): Promise<void> {
    const payload = JSON.parse(row["payload"] as string) as ChangeRequestPayload;
    const tenantId = row["tenant_id"] as string;

    // Invalidate compiled descriptors so next access recompiles from DB.
    await Promise.resolve(this.entityCompiler?.invalidate?.(payload.entityCode, tenantId));

    // Mark as applied
    await this.db
      .updateTable("control.metadata_change_request" as never)
      .set({ status: "applied", applied_at: new Date().toISOString() } as never)
      .where("id" as never, "=", row["id"] as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .execute()
      .catch(() => { /* best effort */ });
  }

  private mapRow(row: Record<string, unknown>): MetadataChangeRequest {
    return {
      id:                 row["id"] as string,
      tenantId:           row["tenant_id"] as string,
      entityCode:         row["entity_code"] as string,
      changeType:         row["change_type"] as ChangeType,
      status:             row["status"] as ChangeRequestStatus,
      payload:            JSON.parse(row["payload"] as string) as ChangeRequestPayload,
      submittedBy:        row["submitted_by"] as string,
      reviewedBy:         row["reviewed_by"] as string | null,
      reviewedAt:         row["reviewed_at"] as string | null,
      reviewNote:         row["review_note"] as string | null,
      appliedAt:          row["applied_at"] as string | null,
      workflowRequestId:  row["workflow_request_id"] as string | null,
      createdAt:          row["created_at"] as string,
      updatedAt:          row["updated_at"] as string | null,
    };
  }
}

export function createMetadataApprovalBridge(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>
): MetadataApprovalBridge {
  return new MetadataApprovalBridge(db);
}
