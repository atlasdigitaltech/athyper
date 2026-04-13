/**
 * Content Service Routes — versioned CMS content
 *
 * Content CRUD:
 *   GET    /content/items                          — list (filters: kind, status, parent_id, locale_code)
 *   POST   /content/items                          — create item + first version atomically
 *   GET    /content/items/:id                      — header + current version body
 *   PATCH  /content/items/:id                      — update title/slug/summary/metadata
 *   POST   /content/items/:id/submit               — DRAFT → REVIEW
 *   POST   /content/items/:id/publish              — REVIEW → PUBLISHED
 *   POST   /content/items/:id/archive              — → ARCHIVED
 *
 * Versions (snapshot.content_item_version — append-only, immutable by trigger):
 *   GET    /content/items/:id/versions             — version list
 *   POST   /content/items/:id/versions             — save new version (SHA-256 checksum dedup)
 *   GET    /content/items/:id/versions/:versionId  — specific version body
 *   POST   /content/items/:id/versions/:versionId/restore — set current_version_id
 *
 * Links (master.content_item_link — immutable, delete to change):
 *   GET    /content/items/:id/links                — outbound links
 *   POST   /content/items/:id/links                — create link
 *   DELETE /content/links/:id                      — remove link
 *
 * Access grants (master.content_item_access_grant):
 *   GET    /content/items/:id/grants               — list grants
 *   POST   /content/items/:id/grants               — add grant
 *   DELETE /content/grants/:id                     — revoke grant
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { createHash } from "crypto";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  extractOrgHeaders,
  parsePagination,
} from "../../shared/route-helpers.js";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface ContentRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

// ── Shape helpers ─────────────────────────────────────────────────────────────

function toContentItem(r: Record<string, unknown>) {
  return {
    id:               r["id"],
    tenantId:         r["tenant_id"],
    code:             r["code"],
    title:            r["title"],
    kind:             r["kind"],
    parentId:         r["parent_id"] ?? null,
    localeCode:       r["locale_code"],
    slug:             r["slug"],
    summary:          r["summary"] ?? null,
    currentVersionId: r["current_version_id"] ?? null,
    metadata:         r["metadata"],
    status:           r["status"],
    statusChangedAt:  r["status_changed_at"] ?? null,
    createdAt:        r["created_at"],
    updatedAt:        r["updated_at"] ?? null,
  };
}

function toContentVersion(r: Record<string, unknown>) {
  return {
    id:            r["id"],
    tenantId:      r["tenant_id"],
    contentItemId: r["content_item_id"],
    version:       r["version"],
    bodyJson:      r["body_json"],
    bodyFormat:    r["body_format"],
    changeSummary: r["change_summary"] ?? null,
    checksum:      r["checksum"],
    createdAt:     r["created_at"],
    createdBy:     r["created_by"],
  };
}

function toContentLink(r: Record<string, unknown>) {
  return {
    id:                   r["id"],
    tenantId:             r["tenant_id"],
    sourceContentItemId:  r["source_content_item_id"],
    targetContentItemId:  r["target_content_item_id"],
    relationType:         r["relation_type"],
    displayOrder:         r["display_order"],
    metadata:             r["metadata"],
    createdAt:            r["created_at"],
    createdBy:            r["created_by"],
  };
}

function toAccessGrant(r: Record<string, unknown>) {
  return {
    id:            r["id"],
    tenantId:      r["tenant_id"],
    contentItemId: r["content_item_id"],
    subjectType:   r["subject_type"],
    subjectId:     r["subject_id"] ?? null,
    accessLevel:   r["access_level"],
    expiresAt:     r["expires_at"] ?? null,
    createdAt:     r["created_at"],
    createdBy:     r["created_by"],
  };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createContentRoutes(router: Router, deps: ContentRouteDeps): void {
  const { db, auth, logger } = deps;

  async function resolveCtx(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) {
    const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
    if (!claims) return null;
    const { xOrg, xRealm } = extractOrgHeaders(req);
    const tenantId = await resolveTenantId(db, xOrg, xRealm);
    if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return null; }
    const sub = claims["sub"] as string ?? "";
    const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId) ?? sub;
    return { tenantId, principalId };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONTENT CRUD
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /content/items ────────────────────────────────────────────────────

  router.get("/content/items", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const q = req.query as Record<string, unknown>;

      let query = db
        .selectFrom("master.content_item as ci" as never)
        .selectAll("ci" as never)
        .where("ci.tenant_id" as never, "=", c.tenantId as never)
        .orderBy("ci.created_at" as never, "desc")
        .limit(limit + 1).offset(offset);

      if (q["kind"])       query = query.where("ci.kind" as never,        "=", q["kind"] as never);
      if (q["status"])     query = query.where("ci.status" as never,      "=", q["status"] as never);
      if (q["localeCode"]) query = query.where("ci.locale_code" as never, "=", q["localeCode"] as never);
      if (q["parentId"] && isUuid(String(q["parentId"])))
                           query = query.where("ci.parent_id" as never,   "=", q["parentId"] as never);
      if (q["parentId"] === "null")
                           query = query.where("ci.parent_id" as never, "is", null as never);

      const rows = await query.execute() as Record<string, unknown>[];
      const hasMore = rows.length > limit;
      res.json({ ok: true, data: rows.slice(0, limit).map(toContentItem), hasMore });
    } catch (err) {
      logger?.error("content_list_error", { err: String(err) });
      next(err);
    }
  });

  // ── POST /content/items ───────────────────────────────────────────────────
  // Creates item + first snapshot.content_item_version atomically.
  // Deferred FK (current_version_id) resolved within the same transaction.

  router.post("/content/items", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const body = req.body as Record<string, unknown>;
      if (!body["code"] || !body["title"] || !body["slug"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "code, title, slug required" }); return;
      }

      const bodyJson = body["bodyJson"] ?? {};
      const bodyFormat = (body["bodyFormat"] as string) ?? "slate";
      const checksum = createHash("sha256").update(JSON.stringify(bodyJson)).digest("hex");

      const item = await db.transaction().execute(async (trx) => {
        // Insert item without current_version_id (deferred FK allows NULL initially)
        const ci = await trx
          .insertInto("master.content_item" as never)
          .values({
            tenant_id: c.tenantId, code: body["code"], title: body["title"],
            kind: body["kind"] ?? "page", parent_id: body["parentId"] ?? null,
            locale_code: body["localeCode"] ?? "en", slug: body["slug"],
            summary: body["summary"] ?? null, metadata: body["metadata"] ?? "{}",
            status: "DRAFT", created_by: c.principalId,
          } as never)
          .returningAll()
          .executeTakeFirstOrThrow() as Record<string, unknown>;

        // Insert first version
        const ver = await trx
          .insertInto("snapshot.content_item_version" as never)
          .values({
            tenant_id: c.tenantId, content_item_id: ci["id"],
            version: 1, body_json: JSON.stringify(bodyJson), body_format: bodyFormat,
            change_summary: body["changeSummary"] ?? "Initial version",
            checksum, created_by: c.principalId,
          } as never)
          .returningAll()
          .executeTakeFirstOrThrow() as Record<string, unknown>;

        // Update current_version_id — deferred FK is resolved on transaction commit
        const updated = await trx
          .updateTable("master.content_item" as never)
          .set({ current_version_id: ver["id"] } as never)
          .where("id" as never, "=", ci["id"] as never)
          .returningAll()
          .executeTakeFirstOrThrow() as Record<string, unknown>;

        return updated;
      });

      res.status(201).json({ ok: true, data: toContentItem(item) });
    } catch (err) {
      logger?.error("content_create_error", { err: String(err) });
      next(err);
    }
  });

  // ── GET /content/items/:id ────────────────────────────────────────────────
  // Returns header + current version body joined.

  router.get("/content/items/:id", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await (db.selectFrom("master.content_item as ci") as any)
        .leftJoin("snapshot.content_item_version as civ", "civ.id", "ci.current_version_id")
        .select([
          "ci.id", "ci.tenant_id", "ci.code", "ci.title", "ci.kind",
          "ci.parent_id", "ci.locale_code", "ci.slug", "ci.summary",
          "ci.current_version_id", "ci.metadata", "ci.status",
          "ci.status_changed_at", "ci.created_at", "ci.updated_at",
          "civ.body_json", "civ.body_format", "civ.version as current_version",
          "civ.checksum as current_checksum",
        ])
        .where("ci.id", "=", id)
        .where("ci.tenant_id", "=", c.tenantId)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      res.json({
        ok: true,
        data: {
          ...toContentItem(row),
          body: {
            json:     row["body_json"] ?? null,
            format:   row["body_format"] ?? null,
            version:  row["current_version"] ?? null,
            checksum: row["current_checksum"] ?? null,
          },
        },
      });
    } catch (err) {
      logger?.error("content_get_error", { err: String(err) });
      next(err);
    }
  });

  // ── PATCH /content/items/:id ──────────────────────────────────────────────
  // Metadata only — title, slug, summary, metadata. Status via separate actions.

  router.patch("/content/items/:id", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const body = req.body as Record<string, unknown>;

      const updates: Record<string, unknown> = { updated_at: new Date(), updated_by: c.principalId };
      if (body["title"] !== undefined)    updates["title"] = body["title"];
      if (body["slug"] !== undefined)     updates["slug"] = body["slug"];
      if (body["summary"] !== undefined)  updates["summary"] = body["summary"];
      if (body["metadata"] !== undefined) updates["metadata"] = JSON.stringify(body["metadata"]);
      if (body["parentId"] !== undefined) updates["parent_id"] = body["parentId"];

      const row = await db
        .updateTable("master.content_item" as never)
        .set(updates as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", c.tenantId as never)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: toContentItem(row) });
    } catch (err) {
      logger?.error("content_update_error", { err: String(err) });
      next(err);
    }
  });

  // ── Status transition actions ─────────────────────────────────────────────

  const statusTransition = (fromStatuses: string[], toStatus: string) =>
    async (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1], next: Parameters<RequestHandler>[2]) => {
      try {
        const c = await resolveCtx(req, res);
        if (!c) return;
        const id = req.params["id"] as string;
        if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
        const row = await db
          .updateTable("master.content_item" as never)
          .set({ status: toStatus, status_changed_at: new Date(), status_changed_by: c.principalId, updated_at: new Date(), updated_by: c.principalId } as never)
          .where("id" as never, "=", id as never)
          .where("tenant_id" as never, "=", c.tenantId as never)
          .where("status" as never, "in", fromStatuses as never)
          .returningAll()
          .executeTakeFirst() as Record<string, unknown> | undefined;
        if (!row) { res.status(409).json({ error: "INVALID_STATE", message: `Item must be in ${fromStatuses.join(" or ")} status` }); return; }
        res.json({ ok: true, data: toContentItem(row) });
      } catch (err) { logger?.error("content_status_transition_error", { err: String(err) }); next(err); }
    };

  router.post("/content/items/:id/submit",  statusTransition(["DRAFT"],   "REVIEW"));
  router.post("/content/items/:id/publish", statusTransition(["REVIEW"],  "PUBLISHED"));
  router.post("/content/items/:id/archive", statusTransition(["DRAFT", "REVIEW", "PUBLISHED"], "ARCHIVED"));

  // ══════════════════════════════════════════════════════════════════════════
  // VERSIONS
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /content/items/:id/versions ──────────────────────────────────────

  router.get("/content/items/:id/versions", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);

      const rows = await db
        .selectFrom("snapshot.content_item_version as civ" as never)
        .select(["civ.id", "civ.tenant_id", "civ.content_item_id", "civ.version", "civ.body_format", "civ.change_summary", "civ.checksum", "civ.created_at", "civ.created_by"] as never[])
        .where("civ.tenant_id" as never, "=", c.tenantId as never)
        .where("civ.content_item_id" as never, "=", id as never)
        .orderBy("civ.version" as never, "desc")
        .limit(limit + 1).offset(offset)
        .execute() as Record<string, unknown>[];

      const hasMore = rows.length > limit;
      res.json({ ok: true, data: rows.slice(0, limit), hasMore });
    } catch (err) {
      logger?.error("content_list_versions_error", { err: String(err) });
      next(err);
    }
  });

  // ── POST /content/items/:id/versions ─────────────────────────────────────
  // Appends a new version. Rejects if checksum matches an existing version.

  router.post("/content/items/:id/versions", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const body = req.body as Record<string, unknown>;
      if (!body["bodyJson"]) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "bodyJson required" }); return;
      }

      const bodyJson = body["bodyJson"];
      const bodyFormat = (body["bodyFormat"] as string) ?? "slate";
      const checksum = createHash("sha256").update(JSON.stringify(bodyJson)).digest("hex");

      const newVersion = await db.transaction().execute(async (trx) => {
        // Get current max version
        const maxRow = await trx
          .selectFrom("snapshot.content_item_version as civ" as never)
          .select(["civ.version"] as never[])
          .where("civ.tenant_id" as never, "=", c.tenantId as never)
          .where("civ.content_item_id" as never, "=", id as never)
          .orderBy("civ.version" as never, "desc")
          .limit(1)
          .executeTakeFirst() as Record<string, unknown> | undefined;

        const nextVersion = maxRow ? (maxRow["version"] as number) + 1 : 1;

        // Insert new version — DB trigger (trg_content_item_version_immutable) blocks UPDATE/DELETE
        const ver = await trx
          .insertInto("snapshot.content_item_version" as never)
          .values({
            tenant_id: c.tenantId, content_item_id: id,
            version: nextVersion, body_json: JSON.stringify(bodyJson),
            body_format: bodyFormat,
            change_summary: body["changeSummary"] ?? null,
            checksum, created_by: c.principalId,
          } as never)
          .returningAll()
          .executeTakeFirstOrThrow() as Record<string, unknown>;

        // Advance current_version_id on the header
        await trx
          .updateTable("master.content_item" as never)
          .set({ current_version_id: ver["id"], updated_at: new Date(), updated_by: c.principalId } as never)
          .where("id" as never, "=", id as never)
          .where("tenant_id" as never, "=", c.tenantId as never)
          .execute();

        return ver;
      });

      res.status(201).json({ ok: true, data: toContentVersion(newVersion) });
    } catch (err) {
      // Unique constraint on (tenant, content_item, checksum) = duplicate body
      if (String(err).includes("civ_checksum_uq")) {
        res.status(409).json({ error: "DUPLICATE_BODY", message: "A version with identical content already exists" }); return;
      }
      logger?.error("content_create_version_error", { err: String(err) });
      next(err);
    }
  });

  // ── GET /content/items/:id/versions/:versionId ───────────────────────────

  router.get("/content/items/:id/versions/:versionId", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id, versionId } = req.params;
      if (!isUuid(id) || !isUuid(versionId)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const row = await db
        .selectFrom("snapshot.content_item_version as civ" as never)
        .selectAll("civ" as never)
        .where("civ.id" as never, "=", versionId as never)
        .where("civ.tenant_id" as never, "=", c.tenantId as never)
        .where("civ.content_item_id" as never, "=", id as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: toContentVersion(row) });
    } catch (err) {
      logger?.error("content_get_version_error", { err: String(err) });
      next(err);
    }
  });

  // ── POST /content/items/:id/versions/:versionId/restore ──────────────────
  // Moves current_version_id back to an older version without creating a new row.

  router.post("/content/items/:id/versions/:versionId/restore", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id, versionId } = req.params;
      if (!isUuid(id) || !isUuid(versionId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      // Confirm version belongs to this item before updating
      const ver = await db
        .selectFrom("snapshot.content_item_version as civ" as never)
        .select(["civ.id"] as never[])
        .where("civ.id" as never, "=", versionId as never)
        .where("civ.tenant_id" as never, "=", c.tenantId as never)
        .where("civ.content_item_id" as never, "=", id as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!ver) { res.status(404).json({ error: "VERSION_NOT_FOUND" }); return; }

      const row = await db
        .updateTable("master.content_item" as never)
        .set({ current_version_id: versionId, updated_at: new Date(), updated_by: c.principalId } as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", c.tenantId as never)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: toContentItem(row) });
    } catch (err) {
      logger?.error("content_restore_version_error", { err: String(err) });
      next(err);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // LINKS
  // ══════════════════════════════════════════════════════════════════════════

  router.get("/content/items/:id/links", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const relationType = req.query["relationType"] as string | undefined;

      let q = db
        .selectFrom("master.content_item_link as cil" as never)
        .selectAll("cil" as never)
        .where("cil.tenant_id" as never, "=", c.tenantId as never)
        .where("cil.source_content_item_id" as never, "=", id as never)
        .orderBy("cil.display_order" as never)
        .limit(limit + 1).offset(offset);

      if (relationType) q = q.where("cil.relation_type" as never, "=", relationType as never);

      const rows = await q.execute() as Record<string, unknown>[];
      const hasMore = rows.length > limit;
      res.json({ ok: true, data: rows.slice(0, limit).map(toContentLink), hasMore });
    } catch (err) { logger?.error("content_list_links_error", { err: String(err) }); next(err); }
  });

  router.post("/content/items/:id/links", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const { targetContentItemId, relationType, displayOrder, metadata } = req.body as Record<string, unknown>;
      if (!targetContentItemId || !isUuid(String(targetContentItemId))) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "targetContentItemId (UUID) required" }); return;
      }
      const row = await db
        .insertInto("master.content_item_link" as never)
        .values({
          tenant_id: c.tenantId, source_content_item_id: id,
          target_content_item_id: targetContentItemId,
          relation_type: relationType ?? "related",
          display_order: displayOrder ?? 0,
          metadata: metadata ? JSON.stringify(metadata) : "{}",
          created_by: c.principalId,
        } as never)
        .returningAll().executeTakeFirstOrThrow() as Record<string, unknown>;
      res.status(201).json({ ok: true, data: toContentLink(row) });
    } catch (err) { logger?.error("content_create_link_error", { err: String(err) }); next(err); }
  });

  router.delete("/content/links/:id", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const deleted = await db
        .deleteFrom("master.content_item_link" as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", c.tenantId as never)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!deleted) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true });
    } catch (err) { logger?.error("content_delete_link_error", { err: String(err) }); next(err); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESS GRANTS
  // ══════════════════════════════════════════════════════════════════════════

  router.get("/content/items/:id/grants", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const rows = await db
        .selectFrom("master.content_item_access_grant as ciag" as never)
        .selectAll("ciag" as never)
        .where("ciag.tenant_id" as never, "=", c.tenantId as never)
        .where("ciag.content_item_id" as never, "=", id as never)
        .execute() as Record<string, unknown>[];
      res.json({ ok: true, data: rows.map(toAccessGrant) });
    } catch (err) { logger?.error("content_list_grants_error", { err: String(err) }); next(err); }
  });

  router.post("/content/items/:id/grants", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const { subjectType, subjectId, accessLevel, expiresAt } = req.body as Record<string, unknown>;
      if (!subjectType || !accessLevel) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "subjectType, accessLevel required" }); return;
      }
      const row = await db
        .insertInto("master.content_item_access_grant" as never)
        .values({
          tenant_id: c.tenantId, content_item_id: id,
          subject_type: subjectType, subject_id: subjectId ?? null,
          access_level: accessLevel, expires_at: expiresAt ?? null,
          created_by: c.principalId,
        } as never)
        .returningAll().executeTakeFirstOrThrow() as Record<string, unknown>;
      res.status(201).json({ ok: true, data: toAccessGrant(row) });
    } catch (err) { logger?.error("content_create_grant_error", { err: String(err) }); next(err); }
  });

  router.delete("/content/grants/:id", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const deleted = await db
        .deleteFrom("master.content_item_access_grant" as never)
        .where("id" as never, "=", id as never)
        .where("tenant_id" as never, "=", c.tenantId as never)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;
      if (!deleted) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true });
    } catch (err) { logger?.error("content_delete_grant_error", { err: String(err) }); next(err); }
  });
}
