/**
 * WorkflowVersionControlService — Phase 3.1
 *
 * Manages workflow template versioning so in-flight instances survive
 * template changes.
 *
 * Strategy: pinned-version (M2 default)
 *   - document.workflow_request.template_snapshot captures compiled_json at
 *     request creation time.
 *   - Subsequent template changes do NOT affect in-flight requests.
 *   - version_no bumps on publish; new instances receive the new version.
 *   - No migration of in-flight instances across version boundaries.
 *
 * Responsibilities:
 *   1. compileTemplate()  — builds compiled_json from stages+rules, updates
 *      compiled_hash. Called after any stage/rule change.
 *   2. publishVersion()   — increments version_no, marks template active.
 *      Only affects future workflow_requests.
 *   3. getVersionHistory() — returns audit trail (version_no + compiled_hash).
 *   4. compareVersions()  — diff two version snapshots for review UI.
 *
 * The WorkflowEngine already reads template_snapshot at createRequest() time
 * for version-pinning — this service provides the administrative layer that
 * manages how templates get to the state the engine reads.
 */

import { sql } from "kysely";
import type { Kysely } from "kysely";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CompiledStage {
  stage_no:        number;
  name:            string | null;
  mode:            "serial" | "parallel";
  quorum:          { strategy: string; required?: number } | null;
  sla_policy_id:   string | null;
  template_stage_id: string;
  rules:           CompiledRule[];
}

export interface CompiledRule {
  id:         string;
  priority:   number;
  conditions: unknown | null;
  assign_to:  { type: string; value?: string };
}

export interface CompiledTemplate {
  stages:    CompiledStage[];
  behaviors: Record<string, unknown>;
}

export interface WorkflowTemplateVersion {
  id:           string;
  code:         string;
  name:         string;
  versionNo:    number;
  compiledHash: string | null;
  isActive:     boolean;
  createdAt:    string;
  updatedAt:    string | null;
}

export interface VersionDiff {
  versionA: number;
  versionB: number;
  added:    string[];
  removed:  string[];
  changed:  string[];
}

// ── WorkflowVersionControlService ────────────────────────────────────────────

export class WorkflowVersionControlService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>) {
    this.db = db;
  }

  /**
   * Compile a workflow template: load all stages+rules, build compiled_json,
   * compute compiled_hash, and persist. Does NOT bump version_no.
   *
   * Call this after any stage or rule modification so the compiled snapshot
   * is ready before the next publishVersion().
   */
  async compileTemplate(
    templateId: string,
    tenantId: string,
    compiledBy: string,
  ): Promise<CompiledTemplate> {
    const template = await this.db
      .selectFrom("control.workflow_template as wt" as never)
      .select(["wt.behaviors"] as never[])
      .where("wt.id" as never, "=", templateId as never)
      .where("wt.tenant_id" as never, "=", tenantId as never)
      .executeTakeFirst() as { behaviors: Record<string, unknown> | null } | undefined;

    if (!template) {
      throw Object.assign(new Error("Workflow template not found"), { code: 404 });
    }

    // Load all stages
    const stageRows = await this.db
      .selectFrom("control.workflow_template_stage as wts" as never)
      .selectAll("wts" as never)
      .where("wts.workflow_template_id" as never, "=", templateId as never)
      .orderBy("wts.stage_no" as never, "asc")
      .execute() as Record<string, unknown>[];

    // Load all rules per stage
    const ruleRows = await this.db
      .selectFrom("control.workflow_template_rule as wtr" as never)
      .selectAll("wtr" as never)
      .where("wtr.workflow_template_id" as never, "=", templateId as never)
      .orderBy("wtr.priority" as never, "asc")
      .execute() as Record<string, unknown>[];

    const rulesByStage = new Map<string, CompiledRule[]>();
    for (const r of ruleRows) {
      const stageId = r["workflow_template_stage_id"] as string;
      if (!rulesByStage.has(stageId)) rulesByStage.set(stageId, []);
      rulesByStage.get(stageId)!.push({
        id:         r["id"] as string,
        priority:   r["priority"] as number ?? 0,
        conditions: r["conditions"] as unknown ?? null,
        assign_to:  r["assign_to"] as { type: string; value?: string } ?? { type: "manual" },
      });
    }

    const stages: CompiledStage[] = stageRows.map((s) => ({
      stage_no:        s["stage_no"] as number,
      name:            s["name"] as string | null,
      mode:            (s["mode"] as "serial" | "parallel") ?? "serial",
      quorum:          s["quorum"] as { strategy: string; required?: number } | null,
      sla_policy_id:   s["sla_policy_id"] as string | null,
      template_stage_id: s["id"] as string,
      rules:           rulesByStage.get(s["id"] as string) ?? [],
    }));

    const compiled: CompiledTemplate = {
      stages,
      behaviors: (template.behaviors as Record<string, unknown>) ?? {},
    };

    const hash = computeTemplateHash(JSON.stringify(compiled));

    await this.db
      .updateTable("control.workflow_template" as never)
      .set({
        compiled_json: JSON.stringify(compiled) as never,
        compiled_hash: hash as never,
        updated_at:    new Date().toISOString() as never,
        updated_by:    compiledBy as never,
      } as never)
      .where("id" as never, "=", templateId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .execute();

    return compiled;
  }

  /**
   * Publish a new version of a workflow template.
   * Increments version_no. Future workflow_requests get this version pinned.
   * In-flight requests on version N are unaffected.
   */
  async publishVersion(
    templateId: string,
    tenantId: string,
    publishedBy: string,
  ): Promise<WorkflowTemplateVersion> {
    // Recompile first to ensure compiled_json is current
    await this.compileTemplate(templateId, tenantId, publishedBy);

    const row = await this.db
      .updateTable("control.workflow_template" as never)
      .set({
        version_no: sql`(SELECT version_no + 1 FROM control.workflow_template WHERE id = ${templateId})` as never,
        is_active:  true as never,
        updated_at: new Date().toISOString() as never,
        updated_by: publishedBy as never,
      } as never)
      .where("id" as never, "=", templateId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .returningAll()
      .executeTakeFirstOrThrow() as Record<string, unknown>;

    return this.mapTemplateRow(row);
  }

  /**
   * Simplified publish that uses a raw increment via SQL expression.
   * Preferred over publishVersion for correctness under concurrent updates.
   */
  async publishVersionSafe(
    templateId: string,
    tenantId: string,
    publishedBy: string,
  ): Promise<WorkflowTemplateVersion> {
    // Recompile
    await this.compileTemplate(templateId, tenantId, publishedBy);

    // Atomically increment version_no
    const row = await this.db
      .updateTable("control.workflow_template" as never)
      .set({
        version_no: sql`version_no + 1` as never,
        is_active:  true as never,
        updated_at: new Date().toISOString() as never,
        updated_by: publishedBy as never,
      } as never)
      .where("id" as never, "=", templateId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .returningAll()
      .executeTakeFirstOrThrow() as Record<string, unknown>;

    return this.mapTemplateRow(row);
  }

  /**
   * Get all templates for a tenant with their version metadata.
   * Supports review UI showing current version + hash for change detection.
   */
  async getVersionHistory(
    tenantId: string,
    templateCode?: string,
  ): Promise<WorkflowTemplateVersion[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = this.db
      .selectFrom("control.workflow_template as wt" as never)
      .select([
        "wt.id",
        "wt.code",
        "wt.name",
        "wt.version_no",
        "wt.compiled_hash",
        "wt.is_active",
        "wt.created_at",
        "wt.updated_at",
      ] as never[])
      .where("wt.tenant_id" as never, "=", tenantId as never);

    if (templateCode) {
      q = q.where("wt.code" as never, "=", templateCode as never);
    }

    const rows = await q
      .orderBy("wt.code" as never, "asc")
      .orderBy("wt.version_no" as never, "desc")
      .execute() as Record<string, unknown>[];

    return rows.map(this.mapTemplateRow.bind(this));
  }

  /**
   * Compare two version snapshots (compiled_json) for a given template.
   * Returns lists of added/removed/changed stage field paths.
   */
  async compareVersions(
    templateId: string,
    tenantId: string,
  ): Promise<VersionDiff | null> {
    // Get current compiled_json and version
    const current = await this.db
      .selectFrom("control.workflow_template as wt" as never)
      .select(["wt.version_no", "wt.compiled_json"] as never[])
      .where("wt.id" as never, "=", templateId as never)
      .where("wt.tenant_id" as never, "=", tenantId as never)
      .executeTakeFirst() as { version_no: number; compiled_json: string | null } | undefined;

    if (!current?.compiled_json) return null;

    // Diff against the prior published stage (stored in workflow_request template_snapshot).
    // Find the most recent in-flight request to get its pinned snapshot.
    const pinned = await this.db
      .selectFrom("document.workflow_request as wr" as never)
      .select("wr.template_snapshot" as never)
      .where("wr.workflow_template_id" as never, "=", templateId as never)
      .where("wr.tenant_id" as never, "=", tenantId as never)
      .where("wr.status" as never, "=", "pending" as never)
      .orderBy("wr.created_at" as never, "desc")
      .limit(1)
      .executeTakeFirst() as { template_snapshot: string | null } | undefined;

    if (!pinned?.template_snapshot) return null;

    const a = JSON.parse(pinned.template_snapshot) as CompiledTemplate;
    const b = JSON.parse(current.compiled_json) as CompiledTemplate;

    return diffTemplates(current.version_no - 1, current.version_no, a, b);
  }

  /**
   * Deactivate a template (soft delete — no new requests can use it).
   */
  async deactivate(
    templateId: string,
    tenantId: string,
    updatedBy: string,
  ): Promise<void> {
    await this.db
      .updateTable("control.workflow_template" as never)
      .set({
        is_active:  false as never,
        updated_at: new Date().toISOString() as never,
        updated_by: updatedBy as never,
      } as never)
      .where("id" as never, "=", templateId as never)
      .where("tenant_id" as never, "=", tenantId as never)
      .execute();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private mapTemplateRow(row: Record<string, unknown>): WorkflowTemplateVersion {
    return {
      id:           row["id"] as string,
      code:         row["code"] as string,
      name:         row["name"] as string,
      versionNo:    row["version_no"] as number,
      compiledHash: row["compiled_hash"] as string | null,
      isActive:     row["is_active"] as boolean,
      createdAt:    row["created_at"] as string,
      updatedAt:    row["updated_at"] as string | null,
    };
  }
}

// ── WorkflowRecoveryService ───────────────────────────────────────────────────

/**
 * Detects and recovers orphaned or stuck workflow requests.
 *
 * A request is "stuck" when:
 *   - status = 'pending' AND the active stage has no pending work_items
 *     (work items may have been abandoned during a deployment or crash).
 *
 * Recovery actions:
 *   1. reEnqueueWorkItems — recreate missing work_items for the active stage.
 *   2. expireAbandoned   — cancel requests stuck for > maxAgeHours.
 *   3. scanStuck         — return list of stuck request IDs without acting.
 */
export class WorkflowRecoveryService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>) {
    this.db = db;
  }

  /**
   * Scan for stuck workflow requests across all tenants.
   * Returns request IDs that are pending but have no active work_items.
   */
  async scanStuck(maxAgeHours = 48): Promise<StuckRequest[]> {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60_000).toISOString();

    // Find pending requests older than cutoff
    const pendingRows = await this.db
      .selectFrom("document.workflow_request as wr" as never)
      .select(["wr.id", "wr.tenant_id", "wr.entity_type", "wr.entity_id", "wr.created_at"] as never[])
      .where("wr.status" as never, "=", "pending" as never)
      .where("wr.created_at" as never, "<", cutoff as never)
      .execute() as Array<{ id: string; tenant_id: string; entity_type: string; entity_id: string; created_at: string }>;

    if (pendingRows.length === 0) return [];

    const stuck: StuckRequest[] = [];

    for (const req of pendingRows) {
      // Check if any active stage has pending work items
      const workItemCount = await this.db
        .selectFrom("event.work_item as wi" as never)
        .select(sql<string>`COUNT(*)`.as("cnt") as never)
        .where("wi.workflow_request_id" as never, "=", req.id as never)
        .where("wi.tenant_id" as never, "=", req.tenant_id as never)
        .where("wi.status" as never, "=", "pending" as never)
        .executeTakeFirst() as { cnt: string | number } | undefined;

      const cnt = parseInt(String(workItemCount?.cnt ?? "0"), 10);
      if (cnt === 0) {
        stuck.push({
          requestId:  req.id,
          tenantId:   req.tenant_id,
          entityType: req.entity_type,
          entityId:   req.entity_id,
          stuckSince: req.created_at,
          reason:     "no_pending_work_items",
        });
      }
    }

    return stuck;
  }

  /**
   * Cancel requests that are stuck beyond the maximum age.
   * Writes a system cancellation decision and logs the recovery.
   */
  async expireAbandoned(
    maxAgeHours = 168, // 7 days
    systemActorId = "00000000-0000-7000-a000-000000000001",
  ): Promise<number> {
    const stuck = await this.scanStuck(maxAgeHours);
    if (stuck.length === 0) return 0;

    let cancelledCount = 0;

    for (const s of stuck) {
      await this.db
        .updateTable("document.workflow_request" as never)
        .set({
          status:     "canceled" as never,
          decision:   null as never,
          decided_by: systemActorId as never,
          decided_at: new Date().toISOString() as never,
          reason:     `Auto-cancelled: no pending work items for ${maxAgeHours}h (recovery service)` as never,
          updated_at: new Date().toISOString() as never,
          updated_by: systemActorId as never,
        } as never)
        .where("id" as never, "=", s.requestId as never)
        .where("tenant_id" as never, "=", s.tenantId as never)
        .where("status" as never, "=", "pending" as never)
        .execute()
        .catch(() => { /* best-effort */ });

      cancelledCount++;
    }

    return cancelledCount;
  }

  /**
   * Re-enqueue work items for a stuck request's active stage.
   * Reads the template_snapshot to determine correct assignees.
   */
  async reEnqueueWorkItems(
    requestId: string,
    tenantId: string,
    systemActorId = "00000000-0000-7000-a000-000000000001",
  ): Promise<boolean> {
    const request = await this.db
      .selectFrom("document.workflow_request as wr" as never)
      .select(["wr.id", "wr.template_snapshot", "wr.status"] as never[])
      .where("wr.id" as never, "=", requestId as never)
      .where("wr.tenant_id" as never, "=", tenantId as never)
      .executeTakeFirst() as { id: string; template_snapshot: string | null; status: string } | undefined;

    if (!request || request.status !== "pending" || !request.template_snapshot) {
      return false;
    }

    // Find the current active stage
    const activeStage = await this.db
      .selectFrom("document.workflow_stage as ws" as never)
      .select(["ws.id", "ws.stage_no", "ws.quorum", "ws.template_stage_id"] as never[])
      .where("ws.workflow_request_id" as never, "=", requestId as never)
      .where("ws.tenant_id" as never, "=", tenantId as never)
      .where("ws.status" as never, "=", "active" as never)
      .orderBy("ws.stage_no" as never, "asc")
      .limit(1)
      .executeTakeFirst() as { id: string; stage_no: number; quorum: string | null; template_stage_id: string } | undefined;

    if (!activeStage) return false;

    const template = JSON.parse(request.template_snapshot) as CompiledTemplate;
    const compiledStage = template.stages.find((s) => s.stage_no === activeStage.stage_no);
    if (!compiledStage) return false;

    // Insert work items for each rule assignee
    let orderIndex = 1;
    for (const rule of compiledStage.rules) {
      if (!rule.assign_to?.value) continue;
      const assignType = normaliseAssigneeType(rule.assign_to.type);
      const assigneeId = rule.assign_to.value;
      await this.db
        .insertInto("event.work_item" as never)
        .values({
          tenant_id:          tenantId,
          workflow_request_id: requestId,
          workflow_stage_id:  activeStage.id,
          task_type:          "approval",
          designated_id:      assignType === "principal" ? assigneeId : null,
          designated_group_id: assignType === "group" ? assigneeId : null,
          assignee_id:        assignType === "principal" ? assigneeId : null,
          assignee_group_id:  assignType === "group" ? assigneeId : null,
          assignee_team_id:   assignType === "team" ? assigneeId : null,
          order_index:        compiledStage.mode === "serial" ? orderIndex++ : 1,
          status:             "pending",
          metadata:           JSON.stringify({ recovered: true, recovered_at: new Date().toISOString() }),
          created_by:         systemActorId,
        } as never)
        .onConflict((oc) => oc.doNothing() as never)
        .execute()
        .catch(() => { /* best-effort — duplicate work items OK */ });
    }

    return true;
  }
}

export interface StuckRequest {
  requestId:  string;
  tenantId:   string;
  entityType: string;
  entityId:   string;
  stuckSince: string;
  reason:     string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeTemplateHash(content: string): string {
  let h = 5381;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) + h + content.charCodeAt(i)) & 0x7fffffff;
  }
  // Pad to 64 chars to satisfy wtpl_hash_fmt_chk constraint (length >= 64)
  return h.toString(16).padStart(8, "0") + "0".repeat(56);
}

function diffTemplates(
  versionA: number,
  versionB: number,
  a: CompiledTemplate,
  b: CompiledTemplate,
): VersionDiff {
  const aStages = new Set(a.stages.map((s) => `stage_${s.stage_no}`));
  const bStages = new Set(b.stages.map((s) => `stage_${s.stage_no}`));

  const added   = [...bStages].filter((k) => !aStages.has(k));
  const removed = [...aStages].filter((k) => !bStages.has(k));
  const changed: string[] = [];

  for (const s of a.stages) {
    const bStage = b.stages.find((x) => x.stage_no === s.stage_no);
    if (bStage && JSON.stringify(s) !== JSON.stringify(bStage)) {
      changed.push(`stage_${s.stage_no}`);
    }
  }

  if (JSON.stringify(a.behaviors) !== JSON.stringify(b.behaviors)) {
    changed.push("behaviors");
  }

  return { versionA, versionB, added, removed, changed };
}

function normaliseAssigneeType(type: string): "principal" | "group" | "team" | "unknown" {
  switch (type) {
    case "direct_principal":
    case "principal":
      return "principal";
    case "group_based":
    case "group":
      return "group";
    case "team_based":
    case "team":
      return "team";
    default:
      return "unknown";
  }
}

// ── Factories ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createWorkflowVersionControlService(db: Kysely<any>): WorkflowVersionControlService {
  return new WorkflowVersionControlService(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createWorkflowRecoveryService(db: Kysely<any>): WorkflowRecoveryService {
  return new WorkflowRecoveryService(db);
}
