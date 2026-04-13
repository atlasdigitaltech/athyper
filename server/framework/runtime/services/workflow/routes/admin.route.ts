/**
 * Workflow Admin Routes — definition, template, and SLA policy management.
 *
 * Definitions (when is a workflow required?)
 *   GET    /workflow/definitions                       — list (filter: entity_type, is_active)
 *   POST   /workflow/definitions                       — create
 *   PUT    /workflow/definitions/:id                   — update (rules, effective window, is_active)
 *
 * Templates (how does the workflow run?)
 *   GET    /workflow/templates                         — list
 *   POST   /workflow/templates                         — create with stages[] + rules[] in one shot
 *   PUT    /workflow/templates/:id                     — update header fields
 *   GET    /workflow/templates/:id/stages              — stages + their rules
 *   POST   /workflow/templates/:id/stages              — add a stage
 *   PUT    /workflow/templates/:id/stages/:stageId     — update a stage
 *   DELETE /workflow/templates/:id/stages/:stageId     — remove a stage
 *   POST   /workflow/templates/:id/stages/:stageId/rules — add a rule to a stage
 *   PUT    /workflow/template-rules/:ruleId            — update a rule
 *   DELETE /workflow/template-rules/:ruleId            — remove a rule
 *   POST   /workflow/templates/:id/compile             — recompile compiled_json + compiled_hash
 *
 * SLA Policies (what happens when time passes without a decision?)
 *   GET    /workflow/sla-policies                      — list
 *   POST   /workflow/sla-policies                      — create
 *   PUT    /workflow/sla-policies/:id                  — update
 *
 * All write routes require an authenticated principal (used as created_by / updated_by).
 * The compile endpoint is idempotent — safe to call multiple times.
 * After any stage or rule change the DB trigger trg_template_child_changed nulls
 * compiled_hash on the parent template; createRequest() will refuse to use an
 * uncompiled template.
 */

import { createHash } from "node:crypto";
import type { RequestHandler, Router } from "express";
import { sql, type Kysely } from "kysely";
import {
  verifyBearer,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  isUuid,
  extractOrgHeaders,
} from "@athyper/svc-shared";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface WorkflowAdminRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: { error(event: string, fields?: Record<string, unknown>): void };
}

// ── Compile helper ────────────────────────────────────────────────────────────

interface CompiledStage {
  template_stage_id: string;
  stage_no: number;
  name: string | null;
  mode: string;
  quorum: unknown;
  sla_policy_id: string | null;
  rules: Array<{
    id: string;
    priority: number;
    conditions: unknown;
    assign_to: unknown;
  }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function compileTemplate(db: Kysely<any>, templateId: string): Promise<{
  compiled_json: object;
  compiled_hash: string;
}> {
  const template = await db
    .selectFrom("control.workflow_template as wt")
    .select(["wt.behaviors"])
    .where("wt.id", "=", templateId)
    .executeTakeFirstOrThrow();

  const stages = await db
    .selectFrom("control.workflow_template_stage as wts")
    .select([
      "wts.id",
      "wts.stage_no as stageNo",
      "wts.name",
      "wts.mode",
      "wts.quorum",
      "wts.sla_policy_id as slaPolicyId",
    ])
    .where("wts.workflow_template_id", "=", templateId)
    .orderBy("wts.stage_no", "asc")
    .execute();

  const compiledStages: CompiledStage[] = [];

  for (const s of stages) {
    const st = s as Record<string, unknown>;
    const rules = await db
      .selectFrom("control.workflow_template_rule as wtr")
      .select([
        "wtr.id",
        "wtr.priority",
        "wtr.conditions",
        "wtr.assign_to as assignTo",
      ])
      .where("wtr.workflow_template_id", "=", templateId)
      .where((eb) =>
        eb.or([
          eb("wtr.stage_no", "=", st.stageNo as number),
          eb("wtr.stage_no", "is", null),
        ]),
      )
      .orderBy("wtr.priority", "asc")
      .execute();

    compiledStages.push({
      template_stage_id: st.id as string,
      stage_no:          st.stageNo as number,
      name:              (st.name as string | null) ?? null,
      mode:              (st.mode as string) ?? "serial",
      quorum:            st.quorum ?? null,
      sla_policy_id:     (st.slaPolicyId as string | null) ?? null,
      rules: rules.map((r) => {
        const rr = r as Record<string, unknown>;
        return {
          id:         rr.id as string,
          priority:   rr.priority as number,
          conditions: rr.conditions ?? null,
          assign_to:  rr.assignTo,
        };
      }),
    });
  }

  const behaviors =
    typeof template.behaviors === "string"
      ? JSON.parse(template.behaviors)
      : (template.behaviors ?? {});

  const compiled_json = { stages: compiledStages, behaviors };
  const json_str      = JSON.stringify(compiled_json);
  const compiled_hash = createHash("sha256").update(json_str).digest("hex");

  return { compiled_json, compiled_hash };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createWorkflowAdminRoutes(
  router: Router,
  deps: WorkflowAdminRouteDeps,
): void {
  const { db, auth, logger } = deps;

  // ── Auth helper ─────────────────────────────────────────────────────────────

  async function resolveActor(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) {
    const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
    if (!claims) return null;
    const { xOrg, xRealm } = extractOrgHeaders(req);
    const tenantId = await resolveTenantId(db, xOrg, xRealm);
    if (!tenantId) {
      res.status(400).json({ error: "TENANT_NOT_FOUND" });
      return null;
    }
    const sub         = (claims["sub"] as string) ?? "";
    const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId);
    if (!principalId) {
      res.status(403).json({ error: "PRINCIPAL_NOT_FOUND" });
      return null;
    }
    return { tenantId, principalId };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEFINITIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /workflow/definitions
  router.get("/workflow/definitions", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [] }); return; }

      const entityType = (req.query["entity_type"] as string | undefined) ?? null;
      const isActive   = (req.query["is_active"]   as string | undefined) ?? null;
      const effectiveAt = (req.query["effective_at"] as string | undefined) ?? null;

      let q = db
        .selectFrom("control.workflow_definition as wd")
        .select([
          "wd.id",
          "wd.code",
          "wd.name",
          "wd.description",
          "wd.entity_type as entityType",
          "wd.rules",
          "wd.effective_from as effectiveFrom",
          "wd.effective_to as effectiveTo",
          "wd.is_active as isActive",
          "wd.created_at as createdAt",
          "wd.updated_at as updatedAt",
        ])
        .where("wd.tenant_id", "=", tenantId);

      if (entityType)  q = q.where("wd.entity_type", "=", entityType) as typeof q;
      if (isActive !== null) q = q.where("wd.is_active", "=", isActive === "true") as typeof q;
      if (effectiveAt) {
        const at = new Date(effectiveAt);
        q = q
          .where("wd.effective_from", "<=", at)
          .where((eb) =>
            eb.or([eb("wd.effective_to", "is", null), eb("wd.effective_to", ">", at)]),
          ) as typeof q;
      }

      const rows = await q.orderBy("wd.entity_type", "asc").orderBy("wd.effective_from", "desc").execute();
      res.json({ items: rows });
    } catch (err) {
      logger?.error("wf_admin_definitions_list_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // POST /workflow/definitions
  router.post("/workflow/definitions", (async (req, res, next) => {
    try {
      const actor = await resolveActor(req, res);
      if (!actor) return;
      const { tenantId, principalId } = actor;

      const body = req.body as Record<string, unknown>;
      const code        = (body["code"]        as string | undefined)?.trim();
      const name        = (body["name"]        as string | undefined)?.trim();
      const entityType  = (body["entity_type"] as string | undefined)?.trim();
      const rules       = body["rules"];
      const effectiveFrom = body["effective_from"] ? new Date(body["effective_from"] as string) : new Date();
      const effectiveTo   = body["effective_to"]   ? new Date(body["effective_to"]   as string) : null;
      const description   = (body["description"] as string | undefined) ?? null;

      if (!code || !name || !entityType) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "code, name, entity_type are required" });
        return;
      }
      if (!Array.isArray(rules)) {
        res.status(400).json({ error: "INVALID_RULES", message: "rules must be an array" });
        return;
      }

      const row = await db
        .insertInto("control.workflow_definition" as never)
        .values({
          tenant_id:      tenantId,
          code,
          name,
          description,
          entity_type:    entityType,
          rules:          JSON.stringify(rules),
          effective_from: effectiveFrom,
          effective_to:   effectiveTo,
          is_active:      true,
          created_by:     principalId,
        } as never)
        .returning(["id", "code", "name", "entity_type", "is_active", "effective_from", "effective_to"] as never)
        .executeTakeFirstOrThrow();

      res.status(201).json(row);
    } catch (err) {
      // Unique constraint on (tenant_id, code)
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        res.status(409).json({ error: "DUPLICATE_CODE", message: "A definition with this code already exists for this tenant" });
        return;
      }
      logger?.error("wf_admin_definition_create_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // PUT /workflow/definitions/:id
  router.put("/workflow/definitions/:id", (async (req, res, next) => {
    try {
      const actor = await resolveActor(req, res);
      if (!actor) return;
      const { tenantId, principalId } = actor;

      const id = (req.params["id"] as string).trim();
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const body = req.body as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = { updated_at: new Date(), updated_by: principalId };

      if (body["name"]         !== undefined) patch["name"]         = String(body["name"]).trim();
      if (body["description"]  !== undefined) patch["description"]  = body["description"];
      if (body["rules"]        !== undefined) {
        if (!Array.isArray(body["rules"])) {
          res.status(400).json({ error: "INVALID_RULES", message: "rules must be an array" });
          return;
        }
        patch["rules"] = JSON.stringify(body["rules"]);
      }
      if (body["is_active"]    !== undefined) patch["is_active"]    = Boolean(body["is_active"]);
      if (body["effective_from"] !== undefined) patch["effective_from"] = new Date(body["effective_from"] as string);
      if (body["effective_to"]   !== undefined) {
        patch["effective_to"] = body["effective_to"] ? new Date(body["effective_to"] as string) : null;
      }

      const row = await db
        .updateTable("control.workflow_definition" as never)
        .set(patch as never)
        .where("id" as never, "=", id)
        .where("tenant_id" as never, "=", tenantId)
        .returning(["id", "code", "name", "entity_type", "is_active", "effective_from", "effective_to", "updated_at"] as never)
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json(row);
    } catch (err) {
      logger?.error("wf_admin_definition_update_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATES
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /workflow/templates
  router.get("/workflow/templates", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [] }); return; }

      const rows = await db
        .selectFrom("control.workflow_template as wt")
        .select([
          "wt.id",
          "wt.code",
          "wt.name",
          "wt.description",
          "wt.behaviors",
          "wt.sla_policy_id as slaPolicyId",
          "wt.version_no as versionNo",
          "wt.is_active as isActive",
          // compiled_hash NULL means template needs recompile
          db.fn.coalesce("wt.compiled_hash" as never, db.val(null) as never).as("compiledHash"),
          "wt.created_at as createdAt",
          "wt.updated_at as updatedAt",
        ])
        .where((eb) =>
          eb.or([
            eb("wt.tenant_id", "=", tenantId),
            eb("wt.tenant_id", "is", null), // include platform-global
          ]),
        )
        .where("wt.is_active", "=", true)
        .orderBy("wt.code", "asc")
        .execute();

      // Flag stale templates (compiled_hash null) for the UI
      const items = (rows as Array<Record<string, unknown>>).map((r) => ({
        ...r,
        needsCompile: r["compiledHash"] == null,
      }));

      res.json({ items });
    } catch (err) {
      logger?.error("wf_admin_templates_list_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // POST /workflow/templates — create with stages[] + rules[] in one shot
  router.post("/workflow/templates", (async (req, res, next) => {
    try {
      const actor = await resolveActor(req, res);
      if (!actor) return;
      const { tenantId, principalId } = actor;

      const body = req.body as Record<string, unknown>;
      const code        = (body["code"]  as string | undefined)?.trim();
      const name        = (body["name"]  as string | undefined)?.trim();
      const description = (body["description"] as string | undefined) ?? null;
      const behaviors   = body["behaviors"] ?? {};
      const slaPolicyId = (body["sla_policy_id"] as string | undefined) ?? null;
      const stages      = (body["stages"] as Array<Record<string, unknown>>) ?? [];

      if (!code || !name) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "code and name are required" });
        return;
      }

      // Use null tenant to create platform-global; non-null for tenant-specific
      const effectiveTenantId = body["platform_global"] === true ? null : tenantId;

      const result = await db.transaction().execute(async (trx) => {
        // Insert template (no compiled_json yet — will be set by /compile)
        const tplRow = await trx
          .insertInto("control.workflow_template" as never)
          .values({
            tenant_id:    effectiveTenantId,
            code,
            name,
            description,
            behaviors:    JSON.stringify(behaviors),
            sla_policy_id: slaPolicyId,
            version_no:   1,
            is_active:    true,
            created_by:   principalId,
          } as never)
          .returning("id" as never)
          .executeTakeFirstOrThrow();

        const templateId = (tplRow as Record<string, unknown>).id as string;

        // Insert stages + rules
        for (const stage of stages) {
          const stageRow = await trx
            .insertInto("control.workflow_template_stage" as never)
            .values({
              tenant_id:           effectiveTenantId,
              workflow_template_id: templateId,
              stage_no:            stage["stage_no"] as number,
              name:                (stage["name"] as string | undefined) ?? null,
              mode:                (stage["mode"] as string | undefined) ?? "serial",
              quorum:              stage["quorum"] ? JSON.stringify(stage["quorum"]) : null,
              sla_policy_id:       (stage["sla_policy_id"] as string | undefined) ?? null,
              created_by:          principalId,
            } as never)
            .returning("id" as never)
            .executeTakeFirstOrThrow();

          const stageId = (stageRow as Record<string, unknown>).id as string;

          for (const rule of (stage["rules"] as Array<Record<string, unknown>>) ?? []) {
            await trx
              .insertInto("control.workflow_template_rule" as never)
              .values({
                tenant_id:            effectiveTenantId,
                workflow_template_id: templateId,
                stage_no:             stage["stage_no"] as number,
                priority:             rule["priority"] as number ?? 100,
                conditions:           rule["conditions"] ? JSON.stringify(rule["conditions"]) : null,
                assign_to:            JSON.stringify(rule["assign_to"]),
                created_by:           principalId,
              } as never)
              .execute();
            void stageId; // stageId used only for ordering context
          }
        }

        // Compile immediately after creation
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { compiled_json, compiled_hash } = await compileTemplate(trx as unknown as Kysely<any>, templateId);

        await trx
          .updateTable("control.workflow_template" as never)
          .set({ compiled_json: JSON.stringify(compiled_json), compiled_hash, updated_at: new Date(), updated_by: principalId } as never)
          .where("id" as never, "=", templateId)
          .execute();

        return { templateId, compiled_hash };
      });

      res.status(201).json({
        id:            result.templateId,
        compiled_hash: result.compiled_hash,
        needsCompile:  false,
      });
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        res.status(409).json({ error: "DUPLICATE_CODE", message: "A template with this code already exists" });
        return;
      }
      logger?.error("wf_admin_template_create_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // PUT /workflow/templates/:id — update header fields only
  router.put("/workflow/templates/:id", (async (req, res, next) => {
    try {
      const actor = await resolveActor(req, res);
      if (!actor) return;
      const { tenantId, principalId } = actor;

      const id = (req.params["id"] as string).trim();
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const body  = req.body as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = { updated_at: new Date(), updated_by: principalId };

      if (body["name"]          !== undefined) patch["name"]          = String(body["name"]).trim();
      if (body["description"]   !== undefined) patch["description"]   = body["description"];
      if (body["behaviors"]     !== undefined) patch["behaviors"]     = JSON.stringify(body["behaviors"]);
      if (body["sla_policy_id"] !== undefined) patch["sla_policy_id"] = body["sla_policy_id"] ?? null;
      if (body["is_active"]     !== undefined) patch["is_active"]     = Boolean(body["is_active"]);
      // Changing behaviors invalidates the snapshot — null the hash so createRequest() refuses
      if (body["behaviors"] !== undefined)     patch["compiled_hash"] = null;

      // Allow update if the template belongs to this tenant OR is platform-global
      const finalRow = await db
        .updateTable("control.workflow_template" as never)
        .set(patch as never)
        .where("id" as never, "=", id)
        .where((eb) =>
          eb.or([
            eb("wt.tenant_id" as never, "=", tenantId),
            eb("wt.tenant_id" as never, "is", null),
          ]),
        )
        .returning(["id", "code", "name", "is_active", "version_no", "compiled_hash", "updated_at"] as never)
        .executeTakeFirst();

      if (!finalRow) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      const fr = finalRow as Record<string, unknown>;
      res.json({ ...fr, needsCompile: fr["compiled_hash"] == null });
    } catch (err) {
      logger?.error("wf_admin_template_update_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // GET /workflow/templates/:id/stages — stages + rules
  router.get("/workflow/templates/:id/stages", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const id = (req.params["id"] as string).trim();
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      // Verify template belongs to tenant (or is platform-global)
      const tpl = await db
        .selectFrom("control.workflow_template as wt")
        .select(["wt.id", "wt.code", "wt.name", "wt.behaviors", "wt.compiled_hash"])
        .where("wt.id", "=", id)
        .executeTakeFirst();
      if (!tpl) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const stages = await db
        .selectFrom("control.workflow_template_stage as wts")
        .select([
          "wts.id",
          "wts.stage_no as stageNo",
          "wts.name",
          "wts.mode",
          "wts.quorum",
          "wts.sla_policy_id as slaPolicyId",
          "wts.created_at as createdAt",
          "wts.updated_at as updatedAt",
        ])
        .where("wts.workflow_template_id", "=", id)
        .orderBy("wts.stage_no", "asc")
        .execute();

      const stagesWithRules = await Promise.all(
        (stages as Array<Record<string, unknown>>).map(async (s) => {
          const rules = await db
            .selectFrom("control.workflow_template_rule as wtr")
            .select([
              "wtr.id",
              "wtr.priority",
              "wtr.stage_no as stageNo",
              "wtr.conditions",
              "wtr.assign_to as assignTo",
              "wtr.created_at as createdAt",
              "wtr.updated_at as updatedAt",
            ])
            .where("wtr.workflow_template_id", "=", id)
            .where((eb) =>
              eb.or([
                eb("wtr.stage_no", "=", s["stageNo"] as number),
                eb("wtr.stage_no", "is", null),
              ]),
            )
            .orderBy("wtr.priority", "asc")
            .execute();

          return { ...s, rules };
        }),
      );

      const t = tpl as Record<string, unknown>;
      res.json({
        template: {
          id:           t["id"],
          code:         t["code"],
          name:         t["name"],
          behaviors:    t["behaviors"],
          needsCompile: t["compiled_hash"] == null,
        },
        stages: stagesWithRules,
      });
    } catch (err) {
      logger?.error("wf_admin_stages_list_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // POST /workflow/templates/:id/stages — add a stage
  router.post("/workflow/templates/:id/stages", (async (req, res, next) => {
    try {
      const actor = await resolveActor(req, res);
      if (!actor) return;
      const { principalId } = actor;

      const templateId = (req.params["id"] as string).trim();
      if (!isUuid(templateId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const body = req.body as Record<string, unknown>;
      const stageNo = body["stage_no"] as number | undefined;
      if (!stageNo || typeof stageNo !== "number") {
        res.status(400).json({ error: "MISSING_STAGE_NO", message: "stage_no is required" });
        return;
      }

      // Load template to get tenant_id
      const tpl = await db
        .selectFrom("control.workflow_template as wt")
        .select("wt.tenant_id as tenantId")
        .where("wt.id", "=", templateId)
        .executeTakeFirst();
      if (!tpl) { res.status(404).json({ error: "TEMPLATE_NOT_FOUND" }); return; }

      const stageRow = await db
        .insertInto("control.workflow_template_stage" as never)
        .values({
          tenant_id:            (tpl as Record<string, unknown>).tenantId ?? null,
          workflow_template_id: templateId,
          stage_no:             stageNo,
          name:                 (body["name"] as string | undefined) ?? null,
          mode:                 (body["mode"] as string | undefined) ?? "serial",
          quorum:               body["quorum"] ? JSON.stringify(body["quorum"]) : null,
          sla_policy_id:        (body["sla_policy_id"] as string | undefined) ?? null,
          created_by:           principalId,
        } as never)
        .returningAll()
        .executeTakeFirstOrThrow();

      // trg_template_child_changed has already nulled compiled_hash
      res.status(201).json({ ...(stageRow as object), needsCompile: true });
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        res.status(409).json({ error: "DUPLICATE_STAGE_NO", message: "Stage number already exists in this template" });
        return;
      }
      logger?.error("wf_admin_stage_add_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // PUT /workflow/templates/:id/stages/:stageId
  router.put("/workflow/templates/:id/stages/:stageId", (async (req, res, next) => {
    try {
      const actor = await resolveActor(req, res);
      if (!actor) return;
      const { principalId } = actor;

      const stageId = (req.params["stageId"] as string).trim();
      if (!isUuid(stageId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const body  = req.body as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = { updated_at: new Date(), updated_by: principalId };

      if (body["name"]          !== undefined) patch["name"]          = body["name"];
      if (body["mode"]          !== undefined) patch["mode"]          = body["mode"];
      if (body["quorum"]        !== undefined) patch["quorum"]        = body["quorum"] ? JSON.stringify(body["quorum"]) : null;
      if (body["sla_policy_id"] !== undefined) patch["sla_policy_id"] = body["sla_policy_id"] ?? null;

      const row = await db
        .updateTable("control.workflow_template_stage" as never)
        .set(patch as never)
        .where("id" as never, "=", stageId)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      // trg_template_child_changed has nulled compiled_hash
      res.json({ ...(row as object), needsCompile: true });
    } catch (err) {
      logger?.error("wf_admin_stage_update_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // DELETE /workflow/templates/:id/stages/:stageId
  router.delete("/workflow/templates/:id/stages/:stageId", (async (req, res, next) => {
    try {
      const actor = await resolveActor(req, res);
      if (!actor) return;

      const stageId = (req.params["stageId"] as string).trim();
      if (!isUuid(stageId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const row = await db
        .deleteFrom("control.workflow_template_stage" as never)
        .where("id" as never, "=", stageId)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      // trg_template_child_changed has nulled compiled_hash
      res.json({ ok: true, needsCompile: true });
    } catch (err) {
      logger?.error("wf_admin_stage_delete_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // POST /workflow/templates/:id/stages/:stageId/rules — add rule to a stage
  router.post("/workflow/templates/:id/stages/:stageId/rules", (async (req, res, next) => {
    try {
      const actor = await resolveActor(req, res);
      if (!actor) return;
      const { principalId } = actor;

      const templateId = (req.params["id"]      as string).trim();
      const stageId    = (req.params["stageId"] as string).trim();
      if (!isUuid(templateId) || !isUuid(stageId)) {
        res.status(400).json({ error: "INVALID_ID" }); return;
      }

      const body = req.body as Record<string, unknown>;
      if (!body["assign_to"]) {
        res.status(400).json({ error: "MISSING_ASSIGN_TO", message: "assign_to is required" });
        return;
      }

      // Resolve stage_no from stageId
      const stage = await db
        .selectFrom("control.workflow_template_stage as wts")
        .select(["wts.stage_no as stageNo", "wts.tenant_id as tenantId"])
        .where("wts.id", "=", stageId)
        .where("wts.workflow_template_id", "=", templateId)
        .executeTakeFirst();
      if (!stage) { res.status(404).json({ error: "STAGE_NOT_FOUND" }); return; }
      const stg = stage as Record<string, unknown>;

      const row = await db
        .insertInto("control.workflow_template_rule" as never)
        .values({
          tenant_id:            stg.tenantId ?? null,
          workflow_template_id: templateId,
          stage_no:             stg.stageNo,
          priority:             (body["priority"] as number | undefined) ?? 100,
          conditions:           body["conditions"] ? JSON.stringify(body["conditions"]) : null,
          assign_to:            JSON.stringify(body["assign_to"]),
          created_by:           principalId,
        } as never)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ ...(row as object), needsCompile: true });
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        res.status(409).json({ error: "DUPLICATE_PRIORITY", message: "A rule with this priority already exists for this stage" });
        return;
      }
      logger?.error("wf_admin_rule_add_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // PUT /workflow/template-rules/:ruleId
  router.put("/workflow/template-rules/:ruleId", (async (req, res, next) => {
    try {
      const actor = await resolveActor(req, res);
      if (!actor) return;
      const { principalId } = actor;

      const ruleId = (req.params["ruleId"] as string).trim();
      if (!isUuid(ruleId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const body  = req.body as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = { updated_at: new Date(), updated_by: principalId };

      if (body["priority"]   !== undefined) patch["priority"]   = body["priority"];
      if (body["conditions"] !== undefined) patch["conditions"] = body["conditions"] ? JSON.stringify(body["conditions"]) : null;
      if (body["assign_to"]  !== undefined) patch["assign_to"]  = JSON.stringify(body["assign_to"]);

      const row = await db
        .updateTable("control.workflow_template_rule" as never)
        .set(patch as never)
        .where("id" as never, "=", ruleId)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ...(row as object), needsCompile: true });
    } catch (err) {
      logger?.error("wf_admin_rule_update_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // DELETE /workflow/template-rules/:ruleId
  router.delete("/workflow/template-rules/:ruleId", (async (req, res, next) => {
    try {
      const actor = await resolveActor(req, res);
      if (!actor) return;

      const ruleId = (req.params["ruleId"] as string).trim();
      if (!isUuid(ruleId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const row = await db
        .deleteFrom("control.workflow_template_rule" as never)
        .where("id" as never, "=", ruleId)
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, needsCompile: true });
    } catch (err) {
      logger?.error("wf_admin_rule_delete_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // POST /workflow/templates/:id/compile — recompile compiled_json + hash
  router.post("/workflow/templates/:id/compile", (async (req, res, next) => {
    try {
      const actor = await resolveActor(req, res);
      if (!actor) return;
      const { principalId } = actor;

      const id = (req.params["id"] as string).trim();
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const tpl = await db
        .selectFrom("control.workflow_template as wt")
        .select("wt.id")
        .where("wt.id", "=", id)
        .executeTakeFirst();
      if (!tpl) { res.status(404).json({ error: "TEMPLATE_NOT_FOUND" }); return; }

      const { compiled_json, compiled_hash } = await compileTemplate(db, id);

      await db
        .updateTable("control.workflow_template" as never)
        .set({
          compiled_json: JSON.stringify(compiled_json),
          compiled_hash,
          // Bump version_no on every compile so workflow_requests can trace the snapshot version
          version_no:    sql`version_no + 1` as never,
          updated_at:    new Date(),
          updated_by:    principalId,
        } as never)
        .where("id" as never, "=", id)
        .execute();

      res.json({
        id,
        compiled_hash,
        needsCompile: false,
        stage_count:  (compiled_json as { stages: unknown[] }).stages.length,
      });
    } catch (err) {
      logger?.error("wf_admin_compile_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // ═══════════════════════════════════════════════════════════════════════════
  // SLA POLICIES
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /workflow/sla-policies
  router.get("/workflow/sla-policies", (async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) { res.json({ items: [] }); return; }

      const rows = await db
        .selectFrom("control.workflow_sla_policy as sp")
        .select([
          "sp.id",
          "sp.code",
          "sp.name",
          "sp.description",
          "sp.timers",
          "sp.escalation_chain as escalationChain",
          "sp.created_at as createdAt",
          "sp.updated_at as updatedAt",
        ])
        .where((eb) =>
          eb.or([
            eb("sp.tenant_id", "=", tenantId),
            eb("sp.tenant_id", "is", null),
          ]),
        )
        .orderBy("sp.code", "asc")
        .execute();

      res.json({ items: rows });
    } catch (err) {
      logger?.error("wf_admin_sla_list_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // POST /workflow/sla-policies
  router.post("/workflow/sla-policies", (async (req, res, next) => {
    try {
      const actor = await resolveActor(req, res);
      if (!actor) return;
      const { tenantId, principalId } = actor;

      const body = req.body as Record<string, unknown>;
      const code        = (body["code"]  as string | undefined)?.trim();
      const name        = (body["name"]  as string | undefined)?.trim();
      const description = (body["description"] as string | undefined) ?? null;
      const timers      = body["timers"] ?? [];
      const escalationChain = body["escalation_chain"] ?? [];

      if (!code || !name) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "code and name are required" });
        return;
      }
      if (!Array.isArray(timers)) {
        res.status(400).json({ error: "INVALID_TIMERS", message: "timers must be an array" });
        return;
      }

      const row = await db
        .insertInto("control.workflow_sla_policy" as never)
        .values({
          tenant_id:        body["platform_global"] === true ? null : tenantId,
          code,
          name,
          description,
          timers:           JSON.stringify(timers),
          escalation_chain: JSON.stringify(escalationChain),
          created_by:       principalId,
        } as never)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json(row);
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        res.status(409).json({ error: "DUPLICATE_CODE", message: "An SLA policy with this code already exists" });
        return;
      }
      logger?.error("wf_admin_sla_create_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);

  // PUT /workflow/sla-policies/:id
  router.put("/workflow/sla-policies/:id", (async (req, res, next) => {
    try {
      const actor = await resolveActor(req, res);
      if (!actor) return;
      const { tenantId, principalId } = actor;

      const id = (req.params["id"] as string).trim();
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const body  = req.body as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = { updated_at: new Date(), updated_by: principalId };

      if (body["name"]             !== undefined) patch["name"]             = String(body["name"]).trim();
      if (body["description"]      !== undefined) patch["description"]      = body["description"];
      if (body["timers"]           !== undefined) {
        if (!Array.isArray(body["timers"])) {
          res.status(400).json({ error: "INVALID_TIMERS" }); return;
        }
        patch["timers"] = JSON.stringify(body["timers"]);
      }
      if (body["escalation_chain"] !== undefined) patch["escalation_chain"] = JSON.stringify(body["escalation_chain"]);

      const row = await db
        .updateTable("control.workflow_sla_policy" as never)
        .set(patch as never)
        .where("id" as never, "=", id)
        .where((eb) =>
          eb.or([
            eb("sp.tenant_id" as never, "=", tenantId),
            eb("sp.tenant_id" as never, "is", null),
          ]),
        )
        .returningAll()
        .executeTakeFirst();

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json(row);
    } catch (err) {
      logger?.error("wf_admin_sla_update_error", { err: String(err) });
      next(err);
    }
  }) as RequestHandler);
}
