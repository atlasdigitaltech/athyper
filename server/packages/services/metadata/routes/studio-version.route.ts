/**
 * Studio Version Routes — Admin plane CRUD over control.entity_version.
 *
 * Phase 4 of the three-plane permission stack. These routes implement the
 * write-side of Studio: list meta-entities, walk versions, create DRAFT rows,
 * transition them through IN_REVIEW → APPROVED → EFFECTIVE, preview a draft's
 * resolved shape, and (under CAB control) emergency-override an EFFECTIVE row.
 *
 * Scope this file deliberately stays inside:
 *   - Direct lifecycle transitions (DRAFT → IN_REVIEW → EFFECTIVE) without
 *     going through the workflow engine. Phase 5+ can layer the workflow
 *     engine on top once admin-plane personas + approver chains are seeded.
 *   - Status-only updates on EFFECTIVE rows for the supersede dance (the
 *     trg_ev_block_mutation Phase 1 trigger allows status→SUPERSEDED when
 *     payload is unchanged).
 *   - Emergency override sets all four override fields atomically so the
 *     Phase 1 trigger permits the mutation and writes the audit row.
 *
 * Not in scope here:
 *   - Compiling DRAFT rows for descriptor preview — EntityCompilerService
 *     filters to EFFECTIVE only. Preview returns the raw fields + display
 *     config; descriptor preview is a follow-up.
 *   - Mutating entity_field rows directly — those go through
 *     metadata-admin.route.ts (existing).
 *
 * Routes:
 *   GET    /metadata/studio/entities                            list admin-plane entities
 *   GET    /metadata/studio/entities/:code/versions             list versions for an entity
 *   POST   /metadata/studio/entities/:code/versions             create DRAFT (next version_no)
 *   PATCH  /metadata/studio/entity-versions/:id                 update DRAFT (rejected otherwise)
 *   POST   /metadata/studio/entity-versions/:id/submit          DRAFT → IN_REVIEW
 *   POST   /metadata/studio/entity-versions/:id/approve         IN_REVIEW → EFFECTIVE (supersede prior)
 *   POST   /metadata/studio/entity-versions/:id/emergency-override   EFFECTIVE with CAB ticket
 *   GET    /metadata/studio/entity-versions/:id/preview         read-back of the row + fields
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { RequestHandler, Router } from "express";

import { readEffectivePermissionContext } from "@athyper/svc-iam";
import { verifyBearer } from "@athyper/svc-shared";
import { ExecutionDescriptorActivationError } from "../src/execution-descriptor/validation.js";
import { publishStagedContractV2 } from "./studio-contract-v2.route.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export interface StudioVersionRoutesDeps {
  db: AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn?(event: string, fields?: Record<string, unknown>): void;
  };
  validateEntityVersionActivation?: (versionId: string) => Promise<unknown>;
}

// ─── Helpers (mirror metadata-admin.route.ts conventions) ──────────────────────

function principalId(claims: Record<string, unknown>): string | null {
  const s = claims["sub"] ?? claims["principal_id"];
  return typeof s === "string" && s ? s : null;
}

function notFound(res: any, msg: string) {
  res.status(404).json({ error: "NOT_FOUND", message: msg });
}

function badRequest(res: any, msg: string) {
  res.status(400).json({ error: "BAD_REQUEST", message: msg });
}

function conflict(res: any, msg: string, extra?: Record<string, unknown>) {
  res.status(409).json({ error: "CONFLICT", message: msg, ...(extra ?? {}) });
}

const VALID_STATUSES = new Set([
  "DRAFT", "IN_REVIEW", "APPROVED", "EFFECTIVE", "SUPERSEDED", "ARCHIVED", "REJECTED", "WITHDRAWN",
]);

// ─── Factory ───────────────────────────────────────────────────────────────────

export function createStudioVersionRoutes(router: Router, deps: StudioVersionRoutesDeps): Router {
  const { db, auth, logger } = deps;

  async function guard(
    req: any,
    res: any,
    required: string | readonly string[],
  ): Promise<{ pId: string } | null> {
    const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
    if (!claims) return null;
    const pId = principalId(claims);
    if (!pId) {
      res.status(400).json({ error: "MISSING_PRINCIPAL" });
      return null;
    }
    const permissionContext = readEffectivePermissionContext(res);
    const requiredCodes = typeof required === "string" ? [required] : required;
    const permitted = permissionContext?.planeKey === "admin"
      && permissionContext.principalId === pId
      && requiredCodes.every((code) =>
        permissionContext.allowed.has(code)
        && !permissionContext.denied.has(code)
        && !permissionContext.planLocked.has(code)
        && !permissionContext.planeExcluded.has(code));
    if (!permitted) {
      res.status(403).json({
        error: "METADATA_CONTRACT_FORBIDDEN",
        message: "Admin-plane metadata contract permission is required.",
        required_permissions: requiredCodes,
      });
      return null;
    }
    return { pId };
  }

  // ── GET /metadata/studio/entities ────────────────────────────────────────────
  const listEntitiesHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!(await guard(req, res, "metadata.contract.view"))) return;

      const rows = await sql<{
        id: string;
        entity_code: string;
        name: string;
        entity_class: string | null;
        mutability: string | null;
        plane_eligibility: string[];
      }>`
        SELECT
            id::text AS id, entity_code, name, entity_class, mutability, plane_eligibility
          FROM control.entity
         WHERE tenant_id IS NULL
           AND plane_eligibility @> ARRAY['admin']::text[]
         ORDER BY entity_code
      `.execute(db);

      res.json(rows.rows);
    } catch (err) {
      logger?.error("studio_list_entities_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /metadata/studio/entities/:code/versions ─────────────────────────────
  const listVersionsHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!(await guard(req, res, "metadata.contract.view"))) return;
      const entityCode = (req.params["code"] as string).replace(/-/g, "_");

      const rows = await sql<{
        id: string;
        version_no: number;
        status: string;
        label: string | null;
        change_type: string | null;
        change_summary: string | null;
        is_effective: boolean;
        locked_after_effective: boolean;
        emergency_override_at: Date | null;
        emergency_override_ticket: string | null;
        created_at: Date;
        created_by: string | null;
      }>`
        SELECT
            ev.id::text AS id, ev.version_no, ev.status,
            ev.label, ev.change_type, ev.change_summary, ev.is_effective,
            ev.locked_after_effective, ev.emergency_override_at,
            ev.emergency_override_ticket,
            ev.created_at, ev.created_by::text AS created_by
          FROM control.entity_version ev
          JOIN control.entity e ON e.id = ev.entity_id
         WHERE e.tenant_id IS NULL
           AND (e.entity_code = ${entityCode} OR e.name = ${entityCode} OR e.slug = ${entityCode.replace(/_/g, "-")})
         ORDER BY ev.version_no DESC
      `.execute(db);

      res.json(rows.rows);
    } catch (err) {
      logger?.error("studio_list_versions_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /metadata/studio/entities/:code/versions ────────────────────────────
  // Body: { change_type?, change_summary?, label?, derived_from_version_id? }
  const createDraftHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res, "metadata.contract.draft.create");
      if (!ctx) return;
      const entityCode = (req.params["code"] as string).replace(/-/g, "_");
      const body = (req.body ?? {}) as Record<string, unknown>;

      const entityRow = await sql<{ id: string }>`
        SELECT id::text AS id FROM control.entity
         WHERE tenant_id IS NULL
           AND (entity_code = ${entityCode} OR name = ${entityCode} OR slug = ${entityCode.replace(/_/g, "-")})
         LIMIT 1
      `.execute(db);
      const entityId = entityRow.rows[0]?.id;
      if (!entityId) return notFound(res as never, `Platform entity '${entityCode}' not found`);

      // Reject when another DRAFT already exists for this entity — one DRAFT
      // at a time so Studio doesn't accumulate competing edits.
      const existingDraft = await sql<{ id: string }>`
        SELECT id::text AS id FROM control.entity_version
         WHERE entity_id = ${entityId}::uuid AND status = 'DRAFT'
         LIMIT 1
      `.execute(db);
      if (existingDraft.rows[0]) {
        return conflict(res as never, "An existing DRAFT version blocks new draft creation.", {
          existing_draft_id: existingDraft.rows[0].id,
        });
      }

      const inserted = await sql<{
        id: string;
        version_no: number;
        status: string;
      }>`
        INSERT INTO control.entity_version
            (entity_id, tenant_id, version_no, status,
             label, change_type, change_summary, derived_from_version_id, base_version_id,
             contract_schema_version, contract_document, contract_hash,
             validation_status, validation_diagnostics, validated_at, validated_by,
             created_by)
        VALUES (
            ${entityId}::uuid, NULL,
            COALESCE(
              (SELECT max(version_no) + 1 FROM control.entity_version WHERE entity_id = ${entityId}::uuid),
              1
            ),
            'DRAFT',
            ${body["label"] ?? null}::text,
            ${body["change_type"] ?? "structural"}::text,
            ${body["change_summary"] ?? null}::text,
            COALESCE(
              ${body["derived_from_version_id"] ?? null}::uuid,
              (SELECT id FROM control.entity_version
                WHERE entity_id = ${entityId}::uuid AND status = 'EFFECTIVE'
                ORDER BY version_no DESC LIMIT 1)
            ),
            COALESCE(
              ${body["derived_from_version_id"] ?? null}::uuid,
              (SELECT id FROM control.entity_version
                WHERE entity_id = ${entityId}::uuid AND status = 'EFFECTIVE'
                ORDER BY version_no DESC LIMIT 1)
            ),
            (SELECT contract_schema_version FROM control.entity_version
              WHERE entity_id = ${entityId}::uuid AND status = 'EFFECTIVE'
              ORDER BY version_no DESC LIMIT 1),
            (SELECT contract_document FROM control.entity_version
              WHERE entity_id = ${entityId}::uuid AND status = 'EFFECTIVE'
              ORDER BY version_no DESC LIMIT 1),
            (SELECT contract_hash FROM control.entity_version
              WHERE entity_id = ${entityId}::uuid AND status = 'EFFECTIVE'
              ORDER BY version_no DESC LIMIT 1),
            COALESCE(
              (SELECT validation_status FROM control.entity_version
                WHERE entity_id = ${entityId}::uuid AND status = 'EFFECTIVE'
                ORDER BY version_no DESC LIMIT 1),
              'NOT_VALIDATED'
            ),
            COALESCE(
              (SELECT validation_diagnostics FROM control.entity_version
                WHERE entity_id = ${entityId}::uuid AND status = 'EFFECTIVE'
                ORDER BY version_no DESC LIMIT 1),
              '[]'::jsonb
            ),
            (SELECT validated_at FROM control.entity_version
              WHERE entity_id = ${entityId}::uuid AND status = 'EFFECTIVE'
              ORDER BY version_no DESC LIMIT 1),
            (SELECT validated_by FROM control.entity_version
              WHERE entity_id = ${entityId}::uuid AND status = 'EFFECTIVE'
              ORDER BY version_no DESC LIMIT 1),
            ${ctx.pId}::uuid
        )
        RETURNING id::text AS id, version_no, status
      `.execute(db);

      res.status(201).json(inserted.rows[0]);
    } catch (err) {
      logger?.error("studio_create_draft_error", { err: String(err) });
      next(err);
    }
  };

  // ── PATCH /metadata/studio/entity-versions/:id ───────────────────────────────
  // Allowed only when status = 'DRAFT'. Updates label / change_type / change_summary / behaviors.
  const updateDraftHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res, "metadata.contract.edit");
      if (!ctx) return;
      const id = req.params["id"] as string;
      const body = (req.body ?? {}) as Record<string, unknown>;

      const current = await sql<{ status: string }>`
        SELECT status FROM control.entity_version WHERE id = ${id}::uuid LIMIT 1
      `.execute(db);
      const status = current.rows[0]?.status;
      if (!status) return notFound(res as never, `Version '${id}' not found`);
      if (status !== "DRAFT") {
        return conflict(res as never, `Version is in status '${status}'; only DRAFT versions can be patched.`);
      }

      const updated = await sql<{ id: string }>`
        UPDATE control.entity_version
           SET label          = COALESCE(${body["label"] ?? null}::text, label),
               change_type    = COALESCE(${body["change_type"] ?? null}::text, change_type),
               change_summary = COALESCE(${body["change_summary"] ?? null}::text, change_summary),
               behaviors      = COALESCE(${body["behaviors"] ? JSON.stringify(body["behaviors"]) : null}::jsonb, behaviors),
               updated_by     = ${ctx.pId}::uuid,
               updated_at     = now()
         WHERE id = ${id}::uuid AND status = 'DRAFT'
         RETURNING id::text AS id
      `.execute(db);

      if (!updated.rows[0]) {
        return conflict(res as never, "Version raced out of DRAFT during the update.");
      }
      res.json(updated.rows[0]);
    } catch (err) {
      logger?.error("studio_update_draft_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /metadata/studio/entity-versions/:id/submit ─────────────────────────
  // DRAFT → IN_REVIEW.
  const submitHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res, "metadata.contract.submit");
      if (!ctx) return;
      const id = req.params["id"] as string;

      const updated = await sql<{ id: string; status: string }>`
        UPDATE control.entity_version
           SET status     = 'IN_REVIEW',
               submitted_at = now(),
               submitted_by = ${ctx.pId}::uuid,
               updated_by = ${ctx.pId}::uuid,
               updated_at = now()
         WHERE id = ${id}::uuid
           AND status = 'DRAFT'
           AND contract_schema_version IS DISTINCT FROM '2.1'
           AND contract_document IS NOT NULL
           AND contract_hash IS NOT NULL
           AND validation_status = 'VALID'
         RETURNING id::text AS id, status
      `.execute(db);

      if (!updated.rows[0]) {
        return conflict(
          res as never,
          "Version must be DRAFT with a valid canonical contract before submission.",
        );
      }
      res.json(updated.rows[0]);
    } catch (err) {
      logger?.error("studio_submit_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /metadata/studio/entity-versions/:id/approve ────────────────────────
  // IN_REVIEW → EFFECTIVE. Simultaneously supersedes the previous EFFECTIVE.
  // Phase 1 trg_ev_block_mutation allows EFFECTIVE → SUPERSEDED with no payload
  // change, which is exactly what we issue here.
  const approveHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res, [
        "metadata.contract.review",
        "metadata.contract.publish",
      ]);
      if (!ctx) return;
      const id = req.params["id"] as string;
      const body = (req.body ?? {}) as Record<string, unknown>;

      const current = await sql<{
        entity_id: string;
        status: string;
        submitted_by: string | null;
        validation_status: string;
        contract_schema_version: string | null;
      }>`
        SELECT entity_id::text AS entity_id, status,
               submitted_by::text AS submitted_by, validation_status,
               contract_schema_version
          FROM control.entity_version
         WHERE id = ${id}::uuid
         LIMIT 1
      `.execute(db);
      const row = current.rows[0];
      if (!row) return notFound(res as never, `Version '${id}' not found`);
      if (row.contract_schema_version === "2.1") {
        return conflict(
          res as never,
          "Contract v2.1 approval must use the atomic /contract-v2.1/approve endpoint.",
        );
      }
      if (row.status !== "IN_REVIEW") {
        return conflict(res as never, `Version is in '${row.status}'; only IN_REVIEW can be approved.`);
      }
      if (row.validation_status !== "VALID") {
        return conflict(res as never, "Canonical Contract JSON must be valid before approval.");
      }
      const sameActor = row.submitted_by === ctx.pId;
      const breakGlassReason = typeof body["reason"] === "string" ? body["reason"].trim() : "";
      const breakGlassTicket = typeof body["ticket_reference"] === "string"
        ? body["ticket_reference"].trim()
        : "";
      if (sameActor) {
        const permissionContext = readEffectivePermissionContext(res);
        const canBreakGlass = permissionContext?.allowed.has("metadata.contract.break_glass")
          && !permissionContext.denied.has("metadata.contract.break_glass")
          && !permissionContext.planLocked.has("metadata.contract.break_glass")
          && !permissionContext.planeExcluded.has("metadata.contract.break_glass");
        if (!canBreakGlass || !breakGlassReason || !breakGlassTicket) {
          res.status(403).json({
            error: "METADATA_SEPARATION_OF_DUTIES",
            message: "The submitter cannot approve their own contract without break-glass permission, reason, and ticket_reference.",
          });
          return;
        }
      }

      try {
        await deps.validateEntityVersionActivation?.(id);
      } catch (error) {
        if (error instanceof ExecutionDescriptorActivationError) {
          res.status(422).json({
            error: "METADATA_ACTIVATION_INVALID",
            message: "Execution descriptor validation failed; activation was not applied.",
            diagnostics: error.diagnostics,
          });
          return;
        }
        throw error;
      }

      // Run the supersede + promote inside a single transaction so the
      // (entity_id, EFFECTIVE) invariant is never violated mid-flight.
      // Phase 5 (R-P4-1): we also write a `version_publish` row into
      // event.descriptor_invalidation_outbox so the cache listener (worker.ts
      // → createDescriptorCacheListener) picks it up via the 30s poller and
      // purges Redis. We can't pg_notify directly here because the api
      // process runs on PgBouncer transaction mode; the listener subscribes
      // on a dedicated session client.
      await db.transaction().execute(async (trx) => {
        await publishStagedContractV2(trx as AnyDb, id, ctx.pId);

        await sql`
          UPDATE control.entity_version
             SET status     = 'SUPERSEDED',
                 updated_by = ${ctx.pId}::uuid,
                 updated_at = now(),
                 effective_to = now()
           WHERE entity_id = ${row.entity_id}::uuid
             AND status    = 'EFFECTIVE'
             AND id        <> ${id}::uuid
        `.execute(trx);

        await sql`
          UPDATE control.entity_version
             SET status         = 'EFFECTIVE',
                 effective_from = COALESCE(effective_from, now()),
                 reviewed_at = now(),
                 reviewed_by = ${ctx.pId}::uuid,
                 published_at = now(),
                 published_by = ${ctx.pId}::uuid,
                 approval_break_glass = ${sameActor},
                 approval_break_glass_reason = ${sameActor ? breakGlassReason : null},
                 approval_break_glass_ticket = ${sameActor ? breakGlassTicket : null},
                 updated_by     = ${ctx.pId}::uuid,
                 updated_at     = now()
           WHERE id = ${id}::uuid
        `.execute(trx);

        await sql`
          WITH queued AS (
            INSERT INTO event.descriptor_invalidation_outbox
                (tenant_id, entity_code, plane_key, reason,
                 source_table, source_id, event_key, created_by)
            VALUES (
                NULL,
                (SELECT entity_code FROM control.entity WHERE id = ${row.entity_id}::uuid),
                NULL,
                'version_publish',
                'control.entity_version',
                ${id}::uuid,
                ${`metadata.entity_version:${id}`},
                ${ctx.pId}::uuid
            )
            ON CONFLICT (event_key) DO UPDATE
              SET status = 'pending', available_at = now(), last_error = NULL,
                  attempts = 0, locked_at = NULL, locked_by = NULL, locked_until = NULL,
                  processed_at = NULL, processed_by = NULL
            RETURNING id
          )
          SELECT pg_notify(
            'desc_invalidate',
            json_build_object(
              'outbox_id', queued.id,
              'tenant_id', NULL,
              'entity_code', (SELECT entity_code FROM control.entity WHERE id = ${row.entity_id}::uuid),
              'reason', 'version_publish',
              'source', 'control.entity_version',
              'at', extract(epoch from clock_timestamp())
            )::text
          )
          FROM queued
        `.execute(trx);
      });

      res.json({ id, status: "EFFECTIVE" });
    } catch (err) {
      logger?.error("studio_approve_error", { err: String(err) });
      next(err);
    }
  };

  // ── POST /metadata/studio/entity-versions/:id/emergency-override ─────────────
  // Requires { cab_ticket, reason, behaviors } body. Sets all four override
  // fields so the Phase 1 trigger permits the mutation.
  const emergencyOverrideHandler: RequestHandler = async (req, res, next) => {
    try {
      const ctx = await guard(req, res, "metadata.contract.break_glass");
      if (!ctx) return;
      const id = req.params["id"] as string;
      const body = (req.body ?? {}) as Record<string, unknown>;

      const cabTicket = typeof body["cab_ticket"] === "string" ? body["cab_ticket"].trim() : "";
      const reason = typeof body["reason"] === "string" ? body["reason"].trim() : "";
      const behaviors = body["behaviors"];
      if (!cabTicket || !reason || behaviors === undefined) {
        return badRequest(res as never,
          "Emergency override requires { cab_ticket, reason, behaviors } in the body.");
      }

      const current = await sql<{ status: string }>`
        SELECT status FROM control.entity_version WHERE id = ${id}::uuid LIMIT 1
      `.execute(db);
      const status = current.rows[0]?.status;
      if (!status) return notFound(res as never, `Version '${id}' not found`);
      if (status !== "EFFECTIVE") {
        return conflict(res as never,
          `Override path is only valid on EFFECTIVE rows. This row is '${status}'.`);
      }

      const updated = await sql<{ id: string }>`
        UPDATE control.entity_version
           SET behaviors                = ${JSON.stringify(behaviors)}::jsonb,
               emergency_override_at    = now(),
               emergency_override_by    = ${ctx.pId}::uuid,
               emergency_override_reason = ${reason},
               emergency_override_ticket = ${cabTicket},
               updated_by               = ${ctx.pId}::uuid,
               updated_at               = now()
         WHERE id = ${id}::uuid
         RETURNING id::text AS id
      `.execute(db);

      if (!updated.rows[0]) {
        return conflict(res as never, "Override failed; check version state.");
      }
      res.json({ id, status: "EFFECTIVE", overridden_at: new Date().toISOString() });
    } catch (err) {
      logger?.error("studio_emergency_override_error", { err: String(err) });
      next(err);
    }
  };

  // ── GET /metadata/studio/entity-versions/:id/preview ─────────────────────────
  // Returns the version row + its registered fields. Full descriptor compile
  // for DRAFT rows is a follow-up — EntityCompilerService.fullCompile filters
  // to EFFECTIVE today, so a DRAFT compile would return null silently.
  const previewHandler: RequestHandler = async (req, res, next) => {
    try {
      if (!(await guard(req, res, "metadata.contract.view"))) return;
      const id = req.params["id"] as string;

      const version = await sql<Record<string, unknown>>`
        SELECT
            ev.id::text AS id, ev.entity_id::text AS entity_id,
            ev.version_no, ev.status, ev.label, ev.change_type, ev.change_summary,
            ev.behaviors, ev.effective_from, ev.effective_to,
            ev.is_effective, ev.locked_after_effective,
            ev.emergency_override_at, ev.emergency_override_ticket, ev.emergency_override_reason,
            e.entity_code, e.name AS entity_name, e.slug, e.plane_eligibility
          FROM control.entity_version ev
          JOIN control.entity e ON e.id = ev.entity_id
         WHERE ev.id = ${id}::uuid
         LIMIT 1
      `.execute(db);

      if (!version.rows[0]) return notFound(res as never, `Version '${id}' not found`);

      const fields = await sql<Record<string, unknown>>`
        SELECT id::text AS id, name, column_name, label, data_type, ui_type,
               is_required, is_unique, is_searchable, is_filterable, is_sortable,
               sort_order, group_key
          FROM control.entity_field
         WHERE entity_version_id = ${id}::uuid
         ORDER BY sort_order, name
      `.execute(db);

      res.json({ version: version.rows[0], fields: fields.rows });
    } catch (err) {
      logger?.error("studio_preview_error", { err: String(err) });
      next(err);
    }
  };

  // ── Route registrations ──────────────────────────────────────────────────────
  router.get   ("/metadata/studio/entities",                            listEntitiesHandler);
  router.get   ("/metadata/studio/entities/:code/versions",             listVersionsHandler);
  router.post  ("/metadata/studio/entities/:code/versions",             createDraftHandler);
  router.patch ("/metadata/studio/entity-versions/:id",                 updateDraftHandler);
  router.post  ("/metadata/studio/entity-versions/:id/submit",          submitHandler);
  router.post  ("/metadata/studio/entity-versions/:id/approve",         approveHandler);
  router.post  ("/metadata/studio/entity-versions/:id/emergency-override", emergencyOverrideHandler);
  router.get   ("/metadata/studio/entity-versions/:id/preview",         previewHandler);

  return router;
}

// Exported so a Phase 4 / 5 verify script can sanity-check the enum without
// importing the whole module.
export { VALID_STATUSES };
