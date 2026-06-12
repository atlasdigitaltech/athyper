/**
 * Content Service Routes — versioned CMS content + S3-backed attachments
 *
 * Content CRUD (master.content_item):
 *   GET    /content/items                          — list (filters: kind, status, parent_id, locale_code)
 *   POST   /content/items                          — create item + first version atomically
 *   GET    /content/items/:id                      — header + current version body
 *   PATCH  /content/items/:id                      — update title/slug/summary/metadata
 *   POST   /content/items/:id/submit               — DRAFT → REVIEW
 *   POST   /content/items/:id/publish              — REVIEW → PUBLISHED
 *   POST   /content/items/:id/archive              — → ARCHIVED
 *
 * Content Versions (snapshot.content_item_version — append-only, immutable by trigger):
 *   GET    /content/items/:id/versions             — version list
 *   POST   /content/items/:id/versions             — save new version (SHA-256 checksum dedup)
 *   GET    /content/items/:id/versions/:versionId  — specific version body
 *   POST   /content/items/:id/versions/:versionId/restore — set current_version_id
 *
 * Content Links (master.content_item_link — immutable, delete to change):
 *   GET    /content/items/:id/links                — outbound links
 *   POST   /content/items/:id/links                — create link
 *   DELETE /content/links/:id                      — remove link
 *
 * Content Access Grants (master.content_item_access_grant):
 *   GET    /content/items/:id/grants               — list grants
 *   POST   /content/items/:id/grants               — add grant
 *   DELETE /content/grants/:id                     — revoke grant
 *
 * Attachment CRUD (master.attachment + master.entity_document_link):
 *   GET    /content/items/:id/attachments                              — list for content item
 *   POST   /content/items/:id/attachments                              — upload (JSON base64 body from relay)
 *   GET    /content/attachments/:id                                    — metadata
 *   GET    /content/attachments/:id/download                           — stream file from S3
 *   DELETE /content/items/:id/attachments/:attachmentId                — unlink / soft-delete
 *
 * Entity Links (master.entity_document_link — polymorphic):
 *   GET    /content/attachments/:id/links                              — list entity links for attachment
 *   POST   /content/attachments/:id/links                              — add cross-entity link
 *   DELETE /content/attachments/links/:linkId                          — remove specific link
 *   GET    /content/entities/:entityType/:entityId/attachments         — reverse: list attachments for entity
 *
 * Attachment ACL (master.attachment_acl):
 *   GET    /content/attachments/:id/access                             — list grants
 *   POST   /content/attachments/:id/access                             — add grant (principal XOR role)
 *   DELETE /content/attachments/:id/access/:grantId                    — revoke grant
 *
 * Attachment Versioning (master.attachment — parent_attachment_id chain):
 *   GET    /content/attachments/:id/versions                           — list version chain (CTE)
 *   POST   /content/items/:id/attachments/:attachmentId/versions       — upload new version + relink
 *
 * All attachment routes return 503 STORAGE_UNAVAILABLE when objectStorage is not configured.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { createHash, randomUUID } from "crypto";
import { sql } from "kysely";
import type { ObjectStorageAdapter } from "@athyper/adapter-objectstorage";
import { ContentAttachmentService } from "@athyper/svc-documents";
import {
  verifyBearer,
  isUuid,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  extractOrgHeaders,
  parsePagination,
} from "@athyper/svc-shared";

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface ContentRouteDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  objectStorage?: {
    adapter: ObjectStorageAdapter;
    bucket: string;
    /** Max upload allowed in MiB. Default: 100. */
    maxUploadMb?: number;
  };
  /** CMS preview queue — when provided, a preview job is enqueued after each new version */
  previewQueue?: {
    add(name: string, data: { contentItemId: string; versionId: string; tenantId: string }): Promise<unknown>;
  };
  /**
   * Virus scanner — when provided, every attachment upload is scanned via ClamAV
   * INSTREAM before the file is persisted as active. Infected files are stored as
   * status=quarantined and the route returns 422 VIRUS_DETECTED.
   */
  virusScanner?: {
    scan(buffer: Buffer): Promise<{ clean: boolean; threat?: string; skipped?: boolean }>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn?(event: string, fields?: Record<string, unknown>): void;
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

// ── Attachment shape helpers ───────────────────────────────────────────────────

function toAttachment(r: Record<string, unknown>) {
  return {
    id:                        r["id"],
    tenantId:                  r["tenant_id"],
    fileName:                  r["file_name"],
    originalFilename:          r["original_filename"] ?? null,
    contentType:               r["content_type"] ?? null,
    sizeBytes:                 r["size_bytes"] !== null ? Number(r["size_bytes"]) : null,
    sha256:                    r["sha256"] ?? null,
    kind:                      r["kind"],
    thumbnailKey:              r["thumbnail_key"] ?? null,
    previewKey:                r["preview_key"] ?? null,
    previewGeneratedAt:        r["preview_generated_at"] ?? null,
    isPreviewGenerationFailed: Boolean(r["is_preview_generation_failed"]),
    isVirusScanned:            Boolean(r["is_virus_scanned"]),
    versionNo:                 r["version_no"],
    parentAttachmentId:        r["parent_attachment_id"] ?? null,
    isCurrent:                 Boolean(r["is_current"]),
    status:                    r["status"],
    statusChangedAt:           r["status_changed_at"] ?? null,
    uploadedBy:                r["uploaded_by"] ?? null,
    metadata:                  r["metadata"],
    createdAt:                 r["created_at"],
    updatedAt:                 r["updated_at"] ?? null,
  };
}

function toEntityLink(r: Record<string, unknown>) {
  return {
    id:           r["id"],
    tenantId:     r["tenant_id"],
    entityType:   r["entity_type"],
    entityId:     r["entity_id"],
    attachmentId: r["attachment_id"],
    linkKind:     r["link_kind"],
    displayOrder: r["display_order"],
    metadata:     r["metadata"],
    createdAt:    r["created_at"],
    createdBy:    r["created_by"],
  };
}

function toAclGrant(r: Record<string, unknown>) {
  return {
    id:           r["id"],
    tenantId:     r["tenant_id"],
    attachmentId: r["attachment_id"],
    principalId:  r["principal_id"] ?? null,
    roleId:       r["role_id"] ?? null,
    permission:   r["permission"],
    isGranted:    Boolean(r["is_granted"]),
    grantedBy:    r["granted_by"],
    grantedAt:    r["granted_at"],
    expiresAt:    r["expires_at"] ?? null,
    createdAt:    r["created_at"],
  };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createContentRoutes(router: Router, deps: ContentRouteDeps): void {
  const { db, auth, objectStorage, previewQueue, virusScanner, logger } = deps;

  // ── Attachment service (S3-backed; optional — returns 503 when absent) ─────
  const attachSvc = objectStorage
    ? new ContentAttachmentService(db, objectStorage.adapter, objectStorage.bucket)
    : null;
  const maxUploadBytes = (objectStorage?.maxUploadMb ?? 100) * 1024 * 1024;

  /** Canonical entity-type string used in master.entity_document_link for CMS content items. */
  const CONTENT_ENTITY_TYPE = "master.content_item";

  async function resolveCtx(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) {
    const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
    if (!claims) return null;
    const { xOrg, xRealm } = extractOrgHeaders(req);
    const tenantId = await resolveTenantId(db, xOrg, xRealm);
    if (!tenantId) { res.status(400).json({ error: "MISSING_TENANT" }); return null; }
    const sub = claims["sub"] as string ?? "";
    const principalId = await resolvePrincipalIdOrNull(db, sub, tenantId, xRealm) ?? sub;
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

      // ── Quota check ─────────────────────────────────────────────────────────
      const itemKind = (body["kind"] as string) ?? "page";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const quotaRow = await (db as any)
        .selectFrom("control.content_quota as cq")
        .select(["cq.max_items", "cq.warn_at_pct"])
        .where("cq.tenant_id", "=", c.tenantId)
        .where("cq.is_active", "=", true)
        .where((eb: any) =>
          eb.or([
            eb("cq.kind", "=", itemKind),
            eb("cq.kind", "=", "*"),
          ])
        )
        .orderBy(
          sql`CASE WHEN cq.kind = ${itemKind} THEN 0 ELSE 1 END`
        )
        .limit(1)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      let quotaWarning: Record<string, unknown> | undefined;
      if (quotaRow?.["max_items"] != null) {
        const maxItems = Number(quotaRow["max_items"]);
        const countRow = await db
          .selectFrom("master.content_item as ci" as never)
          .select(db.fn.count("ci.id" as never).as("cnt") as never)
          .where("ci.tenant_id" as never, "=", c.tenantId as never)
          .where("ci.kind" as never, "=", itemKind as never)
          .executeTakeFirst() as Record<string, unknown>;
        const currentCount = Number(countRow["cnt"] ?? 0);
        if (currentCount >= maxItems) {
          res.status(429).json({
            error: "QUOTA_EXCEEDED",
            message: `Content quota for kind '${itemKind}' reached (${currentCount}/${maxItems})`,
            current: currentCount, max: maxItems,
          });
          return;
        }
        const warnPct = Number(quotaRow["warn_at_pct"] ?? 80);
        if ((currentCount / maxItems) * 100 >= warnPct) {
          quotaWarning = { current: currentCount, max: maxItems, pct: Math.round((currentCount / maxItems) * 100) };
        }
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

      res.status(201).json({
        ok: true,
        data: toContentItem(item),
        ...(quotaWarning ? { quotaWarning } : {}),
      });
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

      // Enqueue async preview generation (fire-and-forget; non-blocking)
      if (previewQueue) {
        void previewQueue.add("preview", {
          contentItemId: id,
          versionId:     newVersion["id"] as string,
          tenantId:      c.tenantId,
        }).catch((e: unknown) => {
          logger?.error("cms_preview_enqueue_error", { contentItemId: id, err: String(e) });
        });
      }
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

  // ══════════════════════════════════════════════════════════════════════════
  // ATTACHMENT CRUD
  //
  // Attachments are stored in master.attachment (S3-backed) and linked to
  // content items via master.entity_document_link (entity_type = CONTENT_ENTITY_TYPE).
  //
  // Upload path (JSON base64, converted by /api/relay BFF from multipart):
  //   POST /content/items/:id/attachments   body: { filename, content_type?, size_bytes?, data_base64 }
  //
  // All routes return 503 STORAGE_UNAVAILABLE when objectStorage is absent.
  // ══════════════════════════════════════════════════════════════════════════

  const storageGuard: RequestHandler = (_req, res) => {
    res.status(503).json({ error: "STORAGE_UNAVAILABLE", message: "Object storage is not configured" });
  };

  if (!attachSvc) {
    // Register 503 stubs so unknown routes don't fall through
    router.get(    "/content/items/:id/attachments",                     storageGuard);
    router.post(   "/content/items/:id/attachments",                     storageGuard);
    router.get(    "/content/attachments/:id",                           storageGuard);
    router.get(    "/content/attachments/:id/download",                  storageGuard);
    router.delete( "/content/items/:id/attachments/:attachmentId",       storageGuard);
    router.get(    "/content/attachments/:id/links",                     storageGuard);
    router.post(   "/content/attachments/:id/links",                     storageGuard);
    router.delete( "/content/attachments/links/:linkId",                 storageGuard);
    router.get(    "/content/entities/:entityType/:entityId/attachments", storageGuard);
    router.get(    "/content/attachments/:id/access",                    storageGuard);
    router.post(   "/content/attachments/:id/access",                    storageGuard);
    router.delete( "/content/attachments/:id/access/:grantId",           storageGuard);
    router.get(    "/content/attachments/:id/versions",                  storageGuard);
    router.post(   "/content/items/:id/attachments/:attachmentId/versions", storageGuard);
    return;
  }

  // ── GET /content/items/:id/attachments ───────────────────────────────────
  // Lists all active attachments linked to a content item.

  router.get("/content/items/:id/attachments", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const items = await attachSvc.list({
        tenantId:   c.tenantId,
        entityType: CONTENT_ENTITY_TYPE,
        entityId:   id,
      });

      res.json({
        ok: true,
        data: items.map((item) => ({
          id:           item.id,
          fileName:     item.fileName,
          contentType:  item.contentType,
          sizeBytes:    item.sizeBytes,
          createdAt:    item.createdAt,
          status:       item.status,
          versionNo:    item.versionNo,
          linkKind:     item.linkKind,
          displayOrder: item.displayOrder,
          uploadedByName: item.uploadedByName,
          downloadUrl:  `/api/relay/content/attachments/${encodeURIComponent(item.id)}/download`,
        })),
      });
    } catch (err) {
      logger?.error("content_list_attachments_error", { err: String(err) });
      next(err);
    }
  });

  // ── POST /content/items/:id/attachments ──────────────────────────────────
  // Accepts JSON base64 body (produced by /api/relay BFF multipart conversion).
  // Body: { filename, content_type?, size_bytes?, data_base64 }

  router.post("/content/items/:id/attachments", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const xOrgHdr      = (req.headers["x-org"] as string) ?? "";
      const tenantCode   = (xOrgHdr.split("--")[0] ?? "").trim() || undefined;
      const companyCode  = (xOrgHdr.split("--")[1] ?? "").trim() || undefined;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const body = req.body as {
        filename?:     string;
        content_type?: string;
        size_bytes?:   number;
        data_base64?:  string;
        link_kind?:    string;
      };

      if (!body.filename || !body.data_base64) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "filename and data_base64 are required" }); return;
      }
      if (!/^[A-Za-z0-9+/\r\n]*={0,2}$/.test(body.data_base64.replace(/[\r\n]/g, ""))) {
        res.status(400).json({ error: "INVALID_BASE64", message: "data_base64 must be valid base64" }); return;
      }

      const fileBuffer = Buffer.from(body.data_base64.replace(/[\r\n]/g, ""), "base64");
      if (fileBuffer.length > maxUploadBytes) {
        res.status(413).json({ error: "FILE_TOO_LARGE", message: `File exceeds the ${objectStorage!.maxUploadMb ?? 100} MB limit` }); return;
      }

      const linkKind = (["primary","related","supporting","compliance","audit"].includes(body.link_kind ?? ""))
        ? (body.link_kind as "primary" | "related" | "supporting" | "compliance" | "audit")
        : "related";

      // ── Virus scan (when ClamAV is configured) ────────────────────────────
      let initialStatus: "active" | "quarantined" = "active";
      let isVirusScanned = false;
      let scanMeta: Record<string, unknown> | undefined;

      if (virusScanner) {
        const scanResult = await virusScanner.scan(fileBuffer);
        const scannedAt  = new Date().toISOString();
        isVirusScanned   = !scanResult.skipped;

        if (!scanResult.clean) {
          // Threat detected — store quarantined and return 422
          initialStatus = "quarantined";
          scanMeta = { scanner: "clamav", scannedAt, result: "FOUND", threat: scanResult.threat };

          const quarantined = await attachSvc.upload({
            tenantId:    c.tenantId,
            tenantCode,
            companyCode,
            entityType:  CONTENT_ENTITY_TYPE,
            entityId:    id,
            fileBuffer,
            fileName:    body.filename.slice(0, 500),
            contentType: (body.content_type ?? "application/octet-stream").slice(0, 200),
            sizeBytes:   body.size_bytes ?? fileBuffer.length,
            principalId: c.principalId,
            linkKind,
            initialStatus: "quarantined",
            isVirusScanned: true,
            scanMeta,
          });

          logger?.error("content_virus_detected", {
            attachmentId: quarantined.id,
            threat:       scanResult.threat,
            fileName:     body.filename,
            tenantId:     c.tenantId,
          });

          res.status(422).json({
            error:  "VIRUS_DETECTED",
            detail: scanResult.threat ?? "UNKNOWN_THREAT",
          });
          return;
        }

        // Clean scan
        if (!scanResult.skipped) {
          scanMeta = { scanner: "clamav", scannedAt, result: "OK" };
        } else {
          logger?.warn?.("content_virus_scan_skipped", { fileName: body.filename, tenantId: c.tenantId });
        }
      }

      const result = await attachSvc.upload({
        tenantId:    c.tenantId,
        tenantCode,
        companyCode,
        entityType:  CONTENT_ENTITY_TYPE,
        entityId:    id,
        fileBuffer,
        fileName:    body.filename.slice(0, 500),
        contentType: (body.content_type ?? "application/octet-stream").slice(0, 200),
        sizeBytes:   body.size_bytes ?? fileBuffer.length,
        principalId: c.principalId,
        linkKind,
        initialStatus,
        isVirusScanned,
        scanMeta,
      });

      res.status(201).json({
        ok: true,
        data: {
          id:          result.id,
          fileName:    result.fileName,
          contentType: result.contentType,
          sizeBytes:   result.sizeBytes,
          status:      result.status,
          versionNo:   result.versionNo,
          createdAt:   result.createdAt,
          downloadUrl: `/api/relay/content/attachments/${encodeURIComponent(result.id)}/download`,
        },
      });
    } catch (err) {
      logger?.error("content_upload_attachment_error", { err: String(err) });
      next(err);
    }
  });

  // ── GET /content/attachments/:id ─────────────────────────────────────────
  // Returns metadata for a single attachment (tenant-scoped, no entity join).

  router.get("/content/attachments/:id", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const row = await db
        .selectFrom("master.attachment as a" as never)
        .selectAll("a" as never)
        .where("a.id" as never, "=", id as never)
        .where("a.tenant_id" as never, "=", c.tenantId as never)
        .where("a.status" as never, "!=", "deleted" as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true, data: toAttachment(row) });
    } catch (err) {
      logger?.error("content_get_attachment_error", { err: String(err) });
      next(err);
    }
  });

  // ── GET /content/attachments/:id/download ────────────────────────────────
  // Streams file bytes directly from S3 to the HTTP response.
  // The /api/relay BFF forwards the full binary response to the browser.

  router.get("/content/attachments/:id/download", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      // Resolve attachment directly (not via entity join) — tenant-scoped is sufficient
      const row = await db
        .selectFrom("master.attachment as a" as never)
        .select(["a.id", "a.file_name", "a.content_type", "a.size_bytes", "a.storage_key", "a.status"] as never[])
        .where("a.id" as never, "=", id as never)
        .where("a.tenant_id" as never, "=", c.tenantId as never)
        .where("a.status" as never, "=", "active" as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      const stream = await objectStorage!.adapter.getStream(row["storage_key"] as string);

      const safeFileName = (row["file_name"] as string).replace(/"/g, '\\"');
      res.setHeader("Content-Type", (row["content_type"] as string) ?? "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}"`);
      const sizeBytes = Number(row["size_bytes"] ?? 0);
      if (sizeBytes > 0) res.setHeader("Content-Length", sizeBytes);

      (stream as NodeJS.ReadableStream).on("error", (streamErr: Error) => {
        logger?.error("content_download_stream_error", { err: streamErr.message });
        if (!res.headersSent) next(streamErr); else res.destroy(streamErr);
      });
      (stream as NodeJS.ReadableStream).pipe(res);
    } catch (err) {
      logger?.error("content_download_attachment_error", { err: String(err) });
      next(err);
    }
  });

  // ── DELETE /content/items/:id/attachments/:attachmentId ──────────────────
  // Removes the entity→attachment link. If no links remain, marks as deleted.

  router.delete("/content/items/:id/attachments/:attachmentId", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id, attachmentId } = req.params;
      if (!isUuid(id) || !isUuid(attachmentId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      await attachSvc.unlink({
        tenantId:     c.tenantId,
        entityType:   CONTENT_ENTITY_TYPE,
        entityId:     id,
        attachmentId,
        principalId:  c.principalId,
      });

      res.status(204).end();
    } catch (err) {
      logger?.error("content_delete_attachment_error", { err: String(err) });
      next(err);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ENTITY LINKS  (master.entity_document_link)
  //
  // An attachment may be linked to multiple entities (polymorphic many-to-many).
  // These routes expose the link graph for a given attachment.
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /content/attachments/:id/links ───────────────────────────────────

  router.get("/content/attachments/:id/links", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);

      const rows = await db
        .selectFrom("master.entity_document_link as edl" as never)
        .selectAll("edl" as never)
        .where("edl.tenant_id" as never, "=", c.tenantId as never)
        .where("edl.attachment_id" as never, "=", id as never)
        .orderBy("edl.display_order" as never)
        .limit(limit + 1).offset(offset)
        .execute() as Record<string, unknown>[];

      const hasMore = rows.length > limit;
      res.json({ ok: true, data: rows.slice(0, limit).map(toEntityLink), hasMore });
    } catch (err) {
      logger?.error("content_list_links_error", { err: String(err) });
      next(err);
    }
  });

  // ── POST /content/attachments/:id/links ──────────────────────────────────
  // Creates a new link from this attachment to any entity.
  // Body: { entityType, entityId, linkKind?, displayOrder?, metadata? }

  router.post("/content/attachments/:id/links", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const { entityType, entityId, linkKind, displayOrder, metadata } = req.body as Record<string, unknown>;
      if (!entityType || !entityId) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "entityType and entityId are required" }); return;
      }

      const validKinds = ["primary", "related", "supporting", "compliance", "audit"];
      const kind = validKinds.includes(String(linkKind)) ? String(linkKind) : "related";

      const row = await db
        .insertInto("master.entity_document_link" as never)
        .values({
          tenant_id:     c.tenantId,
          entity_type:   String(entityType),
          entity_id:     String(entityId),
          attachment_id: id,
          link_kind:     kind,
          display_order: Number(displayOrder ?? 0),
          metadata:      metadata ? JSON.stringify(metadata) : "{}",
          created_by:    c.principalId,
        } as never)
        .returningAll()
        .executeTakeFirstOrThrow() as Record<string, unknown>;

      res.status(201).json({ ok: true, data: toEntityLink(row) });
    } catch (err) {
      logger?.error("content_create_link_error", { err: String(err) });
      next(err);
    }
  });

  // ── DELETE /content/attachments/links/:linkId ─────────────────────────────
  // Removes a specific entity_document_link row by ID.
  // Must appear before /:id/links to avoid param collision.

  router.delete("/content/attachments/links/:linkId", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { linkId } = req.params;
      if (!isUuid(linkId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const deleted = await db
        .deleteFrom("master.entity_document_link" as never)
        .where("id" as never, "=", linkId as never)
        .where("tenant_id" as never, "=", c.tenantId as never)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!deleted) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true });
    } catch (err) {
      logger?.error("content_delete_link_error", { err: String(err) });
      next(err);
    }
  });

  // ── GET /content/entities/:entityType/:entityId/attachments ──────────────
  // Reverse lookup — list all active attachments linked to an entity.

  router.get("/content/entities/:entityType/:entityId/attachments", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { entityType, entityId } = req.params;
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await (db as any)
        .selectFrom("master.entity_document_link as edl")
        .innerJoin("master.attachment as a", "a.id", "edl.attachment_id")
        .select([
          "edl.id as link_id",
          "edl.link_kind",
          "edl.display_order",
          "edl.created_at as linked_at",
          "a.id",
          "a.file_name",
          "a.content_type",
          "a.size_bytes",
          "a.version_no",
          "a.is_current",
          "a.status",
          "a.created_at",
          "a.uploaded_by",
        ])
        .where("edl.tenant_id", "=", c.tenantId)
        .where("edl.entity_type", "=", decodeURIComponent(entityType))
        .where("edl.entity_id", "=", decodeURIComponent(entityId))
        .where("a.status", "=", "active")
        .orderBy("edl.display_order")
        .orderBy("a.created_at", "asc")
        .limit(limit + 1).offset(offset)
        .execute() as Record<string, unknown>[];

      const hasMore = rows.length > limit;
      res.json({
        ok: true,
        data: rows.slice(0, limit).map((r) => ({
          linkId:      r["link_id"],
          linkKind:    r["link_kind"],
          displayOrder: r["display_order"],
          linkedAt:    r["linked_at"],
          id:          r["id"],
          fileName:    r["file_name"],
          contentType: r["content_type"],
          sizeBytes:   r["size_bytes"] !== null ? Number(r["size_bytes"]) : null,
          versionNo:   r["version_no"],
          isCurrent:   Boolean(r["is_current"]),
          status:      r["status"],
          createdAt:   r["created_at"],
          uploadedBy:  r["uploaded_by"] ?? null,
          downloadUrl: `/api/relay/content/attachments/${encodeURIComponent(r["id"] as string)}/download`,
        })),
        hasMore,
      });
    } catch (err) {
      logger?.error("content_list_entity_attachments_error", { err: String(err) });
      next(err);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ATTACHMENT ACL  (master.attachment_acl)
  //
  // File-level access grants: principal XOR role, sealed permission set.
  // Permission values: 'read' | 'download' | 'delete' | 'share'
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /content/attachments/:id/access ──────────────────────────────────

  router.get("/content/attachments/:id/access", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const rows = await db
        .selectFrom("master.attachment_acl as acl" as never)
        .selectAll("acl" as never)
        .where("acl.tenant_id" as never, "=", c.tenantId as never)
        .where("acl.attachment_id" as never, "=", id as never)
        .orderBy("acl.granted_at" as never, "desc")
        .execute() as Record<string, unknown>[];

      res.json({ ok: true, data: rows.map(toAclGrant) });
    } catch (err) {
      logger?.error("content_list_acl_error", { err: String(err) });
      next(err);
    }
  });

  // ── POST /content/attachments/:id/access ─────────────────────────────────
  // Body: { principalId?, roleId?, permission, isGranted?, expiresAt? }
  // Exactly one of principalId or roleId must be provided.

  router.post("/content/attachments/:id/access", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const { principalId, roleId, permission, isGranted, expiresAt } = req.body as Record<string, unknown>;
      const validPermissions = ["read", "download", "delete", "share"];
      if (!permission || !validPermissions.includes(String(permission))) {
        res.status(400).json({ error: "INVALID_PERMISSION", message: "permission must be one of: read, download, delete, share" }); return;
      }

      const hasPrincipal = principalId && isUuid(String(principalId));
      const hasRole      = roleId      && isUuid(String(roleId));

      if (!hasPrincipal && !hasRole) {
        res.status(400).json({ error: "MISSING_SUBJECT", message: "Exactly one of principalId or roleId (UUID) is required" }); return;
      }
      if (hasPrincipal && hasRole) {
        res.status(400).json({ error: "AMBIGUOUS_SUBJECT", message: "Provide principalId OR roleId, not both" }); return;
      }

      const row = await db
        .insertInto("master.attachment_acl" as never)
        .values({
          tenant_id:     c.tenantId,
          attachment_id: id,
          ...(hasPrincipal ? { principal_id: String(principalId) } : {}),
          ...(hasRole      ? { role_id:      String(roleId)      } : {}),
          permission:    String(permission),
          is_granted:    isGranted !== false,
          granted_by:    c.principalId,
          granted_at:    new Date(),
          ...(expiresAt ? { expires_at: expiresAt } : {}),
          created_by:    c.principalId,
        } as never)
        .returningAll()
        .executeTakeFirstOrThrow() as Record<string, unknown>;

      res.status(201).json({ ok: true, data: toAclGrant(row) });
    } catch (err) {
      logger?.error("content_create_acl_error", { err: String(err) });
      next(err);
    }
  });

  // ── DELETE /content/attachments/:id/access/:grantId ──────────────────────

  router.delete("/content/attachments/:id/access/:grantId", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id, grantId } = req.params;
      if (!isUuid(id) || !isUuid(grantId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const deleted = await db
        .deleteFrom("master.attachment_acl" as never)
        .where("id" as never, "=", grantId as never)
        .where("tenant_id" as never, "=", c.tenantId as never)
        .where("attachment_id" as never, "=", id as never)
        .returningAll()
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!deleted) { res.status(404).json({ error: "NOT_FOUND" }); return; }
      res.json({ ok: true });
    } catch (err) {
      logger?.error("content_delete_acl_error", { err: String(err) });
      next(err);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ATTACHMENT VERSIONING  (master.attachment — parent_attachment_id chain)
  //
  // Version history is stored as a linked list: each new version row points
  // to its predecessor via parent_attachment_id; is_current marks the head.
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /content/attachments/:id/versions ────────────────────────────────
  // Walks the parent chain from the given attachment back to v1 using a CTE.

  router.get("/content/attachments/:id/versions", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      type VersionRow = {
        id: string;
        file_name: string;
        content_type: string | null;
        size_bytes: string | null;
        sha256: string | null;
        version_no: number;
        parent_attachment_id: string | null;
        is_current: boolean;
        created_at: unknown;
        created_by: string;
      };

      const result = await sql<VersionRow>`
        WITH RECURSIVE ver AS (
          SELECT id, file_name, content_type, size_bytes, sha256,
                 version_no, parent_attachment_id, is_current, created_at, created_by
          FROM master.attachment
          WHERE id = ${id}::uuid
            AND tenant_id = ${c.tenantId}::uuid
            AND status != 'deleted'
          UNION ALL
          SELECT a.id, a.file_name, a.content_type, a.size_bytes, a.sha256,
                 a.version_no, a.parent_attachment_id, a.is_current, a.created_at, a.created_by
          FROM master.attachment a
          JOIN ver ON a.id = ver.parent_attachment_id
          WHERE a.tenant_id = ${c.tenantId}::uuid
            AND a.status != 'deleted'
        )
        SELECT * FROM ver ORDER BY version_no DESC
      `.execute(db);

      if (result.rows.length === 0) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      res.json({
        ok: true,
        data: result.rows.map((r) => ({
          id:                  r.id,
          fileName:            r.file_name,
          contentType:         r.content_type ?? null,
          sizeBytes:           r.size_bytes !== null ? Number(r.size_bytes) : null,
          sha256:              r.sha256 ?? null,
          versionNo:           r.version_no,
          parentAttachmentId:  r.parent_attachment_id ?? null,
          isCurrent:           Boolean(r.is_current),
          createdAt:           r.created_at,
          createdBy:           r.created_by,
          downloadUrl:         `/api/relay/content/attachments/${encodeURIComponent(r.id)}/download`,
        })),
      });
    } catch (err) {
      logger?.error("content_list_attachment_versions_error", { err: String(err) });
      next(err);
    }
  });

  // ── POST /content/items/:id/attachments/:attachmentId/versions ───────────
  // Uploads a new version of an attachment.
  // Creates a new master.attachment row (version_no + 1, parent_attachment_id = current),
  // marks the old row is_current = false, and relinks the entity_document_link.
  // Body: { filename, content_type?, size_bytes?, data_base64, changeSummary? }

  router.post("/content/items/:id/attachments/:attachmentId/versions", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const xOrgVer     = (req.headers["x-org"] as string) ?? "";
      const tCodeVer    = (xOrgVer.split("--")[0] ?? "").trim() || c.tenantId;
      const cCodeVer    = (xOrgVer.split("--")[1] ?? "").trim() || c.tenantId;
      const { id: itemId, attachmentId } = req.params;
      if (!isUuid(itemId) || !isUuid(attachmentId)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      const body = req.body as {
        filename?:     string;
        content_type?: string;
        size_bytes?:   number;
        data_base64?:  string;
        changeSummary?: string;
      };

      if (!body.filename || !body.data_base64) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "filename and data_base64 are required" }); return;
      }
      if (!/^[A-Za-z0-9+/\r\n]*={0,2}$/.test(body.data_base64.replace(/[\r\n]/g, ""))) {
        res.status(400).json({ error: "INVALID_BASE64", message: "data_base64 must be valid base64" }); return;
      }
      // Capture validated fields as consts so TypeScript preserves the non-null
      // narrowing across the async transaction callback boundary.
      const filename = body.filename;

      const fileBuffer = Buffer.from(body.data_base64.replace(/[\r\n]/g, ""), "base64");
      if (fileBuffer.length > maxUploadBytes) {
        res.status(413).json({ error: "FILE_TOO_LARGE", message: `File exceeds the ${objectStorage!.maxUploadMb ?? 100} MB limit` }); return;
      }

      // Confirm current attachment belongs to this tenant and content item
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const current = await (db as any)
        .selectFrom("master.entity_document_link as edl")
        .innerJoin("master.attachment as a", "a.id", "edl.attachment_id")
        .select(["a.id", "a.version_no", "a.storage_bucket", "edl.link_kind", "edl.display_order"])
        .where("edl.tenant_id", "=", c.tenantId)
        .where("edl.entity_type", "=", CONTENT_ENTITY_TYPE)
        .where("edl.entity_id", "=", itemId)
        .where("a.id", "=", attachmentId)
        .where("a.status", "=", "active")
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!current) { res.status(404).json({ error: "ATTACHMENT_NOT_FOUND", message: "Attachment not found or not linked to this content item" }); return; }

      const newAttachmentId = randomUUID();
      const nextVersionNo   = Number(current["version_no"]) + 1;
      const contentType     = (body.content_type ?? "application/octet-stream").slice(0, 200);
      const sha256          = createHash("sha256").update(fileBuffer).digest("hex");

      const safeFileName = filename.replace(/[/\\]/g, "_").replace(/[^\w.\-]/g, "_").slice(0, 200);
      const storageKey   = `${tCodeVer}/${cCodeVer}/content/content_item/${itemId}/${newAttachmentId}/v${nextVersionNo}/${safeFileName}`;

      // Step 1: upload bytes to S3
      await objectStorage!.adapter.put(storageKey, fileBuffer, { contentType });

      // Step 2: DB transaction — compensating S3 delete on failure
      try {
        const newRow = await db.transaction().execute(async (trx) => {
          // Create new version row
          const inserted = await trx
            .insertInto("master.attachment" as never)
            .values({
              id:                           newAttachmentId,
              tenant_id:                    c.tenantId,
              file_name:                    filename.slice(0, 500),
              original_filename:            filename.slice(0, 500),
              content_type:                 contentType,
              size_bytes:                   body.size_bytes ?? fileBuffer.length,
              sha256,
              kind:                         "attachment",
              storage_bucket:               objectStorage!.bucket,
              storage_key:                  storageKey,
              version_no:                   nextVersionNo,
              parent_attachment_id:         attachmentId,
              reference_count:              1,
              is_current:                   true,
              is_active:                    true,
              is_virus_scanned:             false,
              is_preview_generation_failed: false,
              is_auto_delete_on_expiry:     false,
              status:                       "active",
              uploaded_by:                  c.principalId,
              created_by:                   c.principalId,
              metadata:                     { changeSummary: body.changeSummary ?? null },
            } as never)
            .returningAll()
            .executeTakeFirstOrThrow() as Record<string, unknown>;

          // Mark old version as not current
          await trx
            .updateTable("master.attachment" as never)
            .set({ is_current: false, updated_at: new Date(), updated_by: c.principalId } as never)
            .where("id" as never, "=", attachmentId as never)
            .where("tenant_id" as never, "=", c.tenantId as never)
            .execute();

          // Relink entity to new attachment: remove old link, insert new one
          await trx
            .deleteFrom("master.entity_document_link" as never)
            .where("tenant_id" as never, "=", c.tenantId as never)
            .where("entity_type" as never, "=", CONTENT_ENTITY_TYPE as never)
            .where("entity_id" as never, "=", itemId as never)
            .where("attachment_id" as never, "=", attachmentId as never)
            .execute();

          await trx
            .insertInto("master.entity_document_link" as never)
            .values({
              tenant_id:     c.tenantId,
              entity_type:   CONTENT_ENTITY_TYPE,
              entity_id:     itemId,
              attachment_id: newAttachmentId,
              link_kind:     current["link_kind"] ?? "related",
              display_order: Number(current["display_order"] ?? 0),
              created_by:    c.principalId,
            } as never)
            .execute();

          return inserted;
        });

        res.status(201).json({
          ok: true,
          data: {
            ...toAttachment(newRow),
            downloadUrl: `/api/relay/content/attachments/${encodeURIComponent(newAttachmentId)}/download`,
          },
        });
      } catch (err) {
        // Compensating S3 delete
        await objectStorage!.adapter.delete(storageKey).catch(() => {});
        throw err;
      }
    } catch (err) {
      logger?.error("content_version_attachment_error", { err: String(err) });
      next(err);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // FULL-TEXT SEARCH
  // GET /content/search?q=...&kind=...&status=...&locale=...&limit=50&after=<cursor>
  //
  // Uses PostgreSQL plainto_tsquery + ts_rank for relevance-ranked results.
  // The content_item_fts_idx GIN index (patch 004) makes this O(log n).
  // ══════════════════════════════════════════════════════════════════════════

  router.get("/content/search", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;

      const q      = req.query as Record<string, string | undefined>;
      const query  = (q["q"] ?? "").trim();
      const limit  = Math.min(Number(q["limit"] ?? 50), 200);
      const after  = q["after"] ?? null;

      if (!query) {
        res.status(400).json({ error: "MISSING_QUERY", message: "q is required" });
        return;
      }

      // Build base query with FTS rank
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let stmt: any = (db as any)
        .selectFrom("master.content_item as ci")
        .select([
          "ci.id",
          "ci.code",
          "ci.title",
          "ci.kind",
          "ci.slug",
          "ci.summary",
          "ci.status",
          "ci.locale_code",
          "ci.parent_id",
          "ci.current_version_id",
          "ci.created_at",
          "ci.updated_at",
          sql`ts_rank(
            to_tsvector('english', coalesce(ci.title,'') || ' ' || coalesce(ci.summary,'')),
            plainto_tsquery('english', ${query})
          )`.as("rank"),
        ])
        .where("ci.tenant_id", "=", c.tenantId)
        .where(
          sql`to_tsvector('english', coalesce(ci.title,'') || ' ' || coalesce(ci.summary,''))
              @@ plainto_tsquery('english', ${query})`,
          "=",
          true
        );

      // Optional filters
      if (q["kind"])   stmt = stmt.where("ci.kind",        "=", q["kind"]);
      if (q["status"]) stmt = stmt.where("ci.status",      "=", q["status"]);
      if (q["locale"]) stmt = stmt.where("ci.locale_code",  "=", q["locale"]);

      // Cursor: encode as "<rank_hex>:<id>" for stable pagination
      if (after) {
        const [rankHex, cursorId] = after.split(":");
        if (rankHex && cursorId) {
          const rankVal = Number("0x" + rankHex) / 1e9;
          stmt = stmt.where((eb: any) =>
            eb.or([
              eb(
                sql`ts_rank(
                  to_tsvector('english', coalesce(ci.title,'') || ' ' || coalesce(ci.summary,'')),
                  plainto_tsquery('english', ${query})
                )`,
                "<",
                rankVal
              ),
              eb.and([
                eb(
                  sql`ts_rank(
                    to_tsvector('english', coalesce(ci.title,'') || ' ' || coalesce(ci.summary,'')),
                    plainto_tsquery('english', ${query})
                  )`,
                  "=",
                  rankVal
                ),
                eb("ci.id", ">", cursorId),
              ]),
            ])
          );
        }
      }

      const rows = await stmt
        .orderBy(sql`rank` as never, "desc")
        .orderBy("ci.id" as never, "asc")
        .limit(limit + 1)
        .execute() as Record<string, unknown>[];

      const hasMore = rows.length > limit;
      const items   = rows.slice(0, limit);

      // Build next cursor from last item
      let nextCursor: string | null = null;
      if (hasMore && items.length > 0) {
        const last = items[items.length - 1]!;
        const rankNum = Math.round(Number(last["rank"]) * 1e9);
        nextCursor = `${rankNum.toString(16)}:${last["id"]}`;
      }

      res.json({
        ok: true,
        data: items.map(toContentItem),
        hasMore,
        nextCursor,
        query,
      });
    } catch (err) {
      logger?.error("content_search_error", { err: String(err) });
      next(err);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CONTENT QUOTA MANAGEMENT (control.content_quota)
  //
  // GET  /content/quota/usage           — current usage vs quota per kind
  // GET  /content/quota/config          — list quota configs for tenant
  // POST /content/quota/config          — create or update quota for a kind
  // DELETE /content/quota/config/:kind  — remove quota (resets to unlimited)
  // ══════════════════════════════════════════════════════════════════════════

  // GET /content/quota/usage
  router.get("/content/quota/usage", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;

      // Aggregate current item counts per kind
      const counts = await db
        .selectFrom("master.content_item as ci" as never)
        .select([
          "ci.kind" as never,
          db.fn.count("ci.id" as never).as("item_count") as never,
        ])
        .where("ci.tenant_id" as never, "=", c.tenantId as never)
        .groupBy("ci.kind" as never)
        .execute() as Record<string, unknown>[];

      // Load all active quotas for tenant
      const quotas = await db
        .selectFrom("control.content_quota as cq" as never)
        .selectAll("cq" as never)
        .where("cq.tenant_id" as never, "=", c.tenantId as never)
        .where("cq.is_active" as never, "=", true as never)
        .execute() as Record<string, unknown>[];

      const quotaByKind = new Map(quotas.map((q) => [q["kind"] as string, q]));
      const countByKind = new Map(counts.map((r) => [r["kind"] as string, Number(r["item_count"])]));

      // Merge: all kinds that have items OR quotas
      const allKinds = new Set([...countByKind.keys(), ...quotaByKind.keys()].filter((k) => k !== "*"));

      const usage = [...allKinds].map((kind) => {
        const current = countByKind.get(kind) ?? 0;
        const quota   = quotaByKind.get(kind) ?? quotaByKind.get("*");
        const maxItems = quota ? (quota["max_items"] != null ? Number(quota["max_items"]) : null) : null;
        const warnPct  = quota ? Number(quota["warn_at_pct"] ?? 80) : 80;
        const pct      = maxItems != null && maxItems > 0 ? Math.round((current / maxItems) * 100) : null;

        return {
          kind,
          currentItems: current,
          maxItems,
          usagePct: pct,
          isWarning: pct != null && pct >= warnPct,
          isExceeded: maxItems != null && current >= maxItems,
        };
      });

      res.json({ ok: true, data: usage });
    } catch (err) {
      logger?.error("content_quota_usage_error", { err: String(err) });
      next(err);
    }
  });

  // GET /content/quota/config
  router.get("/content/quota/config", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;

      const rows = await db
        .selectFrom("control.content_quota as cq" as never)
        .selectAll("cq" as never)
        .where("cq.tenant_id" as never, "=", c.tenantId as never)
        .orderBy("cq.kind" as never, "asc")
        .execute() as Record<string, unknown>[];

      res.json({ ok: true, data: rows });
    } catch (err) {
      logger?.error("content_quota_config_list_error", { err: String(err) });
      next(err);
    }
  });

  // POST /content/quota/config — upsert quota for a kind
  router.post("/content/quota/config", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const body = req.body as Record<string, unknown>;
      const kind = (body["kind"] as string | undefined)?.trim();
      if (!kind) {
        res.status(400).json({ error: "MISSING_FIELDS", message: "kind is required" });
        return;
      }
      if (!/^[a-z_*][a-z0-9_*]*$/.test(kind) || kind.length > 64) {
        res.status(400).json({ error: "INVALID_KIND", message: "kind must match ^[a-z_*][a-z0-9_*]*$ and be ≤64 chars" });
        return;
      }

      const values: Record<string, unknown> = {
        tenant_id:         c.tenantId,
        kind,
        max_items:         body["maxItems"]        != null ? Number(body["maxItems"])        : null,
        max_storage_bytes: body["maxStorageBytes"] != null ? Number(body["maxStorageBytes"]) : null,
        warn_at_pct:       body["warnAtPct"]       != null ? Number(body["warnAtPct"])       : 80,
        is_active:         body["isActive"]        != null ? Boolean(body["isActive"])       : true,
        created_by:        c.principalId,
      };

      const row = await db
        .insertInto("control.content_quota" as never)
        .values(values as never)
        .onConflict((oc) =>
          (oc as ReturnType<typeof oc.columns>).columns(["tenant_id", "kind"] as never[]).doUpdateSet({
            max_items:         values["max_items"],
            max_storage_bytes: values["max_storage_bytes"],
            warn_at_pct:       values["warn_at_pct"],
            is_active:         values["is_active"],
            updated_at:        new Date(),
            updated_by:        c.principalId,
          } as never)
        )
        .returningAll()
        .executeTakeFirstOrThrow() as Record<string, unknown>;

      res.status(201).json({ ok: true, data: row });
    } catch (err) {
      logger?.error("content_quota_config_upsert_error", { err: String(err) });
      next(err);
    }
  });

  // DELETE /content/quota/config/:kind — remove quota (resets to unlimited)
  router.delete("/content/quota/config/:kind", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const kind = req.params["kind"];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db.deleteFrom("control.content_quota") as any)
        .where("tenant_id", "=", c.tenantId)
        .where("kind", "=", kind)
        .execute();

      res.json({ ok: true });
    } catch (err) {
      logger?.error("content_quota_config_delete_error", { err: String(err) });
      next(err);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // QUARANTINE ADMIN  (master.attachment WHERE status = 'quarantined')
  //
  // Admin-only routes for managing attachments flagged by ClamAV.
  // All routes require a valid bearer token (resolveCtx enforces auth).
  // Release and delete actions write status_changed_by so there is a
  // principal audit trail even without a dedicated audit event.
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /content/admin/quarantined ───────────────────────────────────────
  // Lists all quarantined attachments for the tenant, most recent first.
  // Includes the first entity link (entity_type + entity_id) for context.

  router.get("/content/admin/quarantined", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { limit, offset } = parsePagination(req.query as Record<string, unknown>);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await (db as any)
        .selectFrom("master.attachment as a")
        .leftJoin("master.entity_document_link as edl", (join: any) =>
          join
            .onRef("edl.attachment_id", "=", "a.id")
            .on("edl.tenant_id",        "=", c.tenantId),
        )
        .leftJoin("master.principal as p", "p.id", "a.uploaded_by")
        .select([
          "a.id",
          "a.file_name",
          "a.content_type",
          "a.size_bytes",
          "a.status",
          "a.status_changed_at",
          "a.metadata",
          "a.created_at",
          "edl.entity_type",
          "edl.entity_id",
          "p.name as uploaded_by_name",
        ])
        .where("a.tenant_id", "=", c.tenantId)
        .where("a.status",    "=", "quarantined")
        .orderBy("a.created_at", "desc")
        .limit(limit + 1)
        .offset(offset)
        .execute() as Record<string, unknown>[];

      const hasMore = rows.length > limit;
      res.json({
        ok: true,
        data: rows.slice(0, limit).map((r) => ({
          id:             r["id"],
          fileName:       r["file_name"],
          contentType:    r["content_type"],
          sizeBytes:      r["size_bytes"] !== null ? Number(r["size_bytes"]) : null,
          status:         r["status"],
          quarantinedAt:  r["status_changed_at"] ?? r["created_at"],
          scanResult:     (r["metadata"] as Record<string, unknown> | null)?.["scan"] ?? null,
          entityType:     r["entity_type"] ?? null,
          entityId:       r["entity_id"]   ?? null,
          uploadedByName: r["uploaded_by_name"] ?? null,
        })),
        hasMore,
      });
    } catch (err) {
      logger?.error("content_admin_quarantine_list_error", { err: String(err) });
      next(err);
    }
  });

  // ── POST /content/admin/attachments/:id/release ──────────────────────────
  // Releases a quarantined attachment back to active status.
  // Records the releasing principal in status_changed_by for audit purposes.

  router.post("/content/admin/attachments/:id/release", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updated = await (db as any)
        .updateTable("master.attachment")
        .set({
          status:            "active",
          is_active:         true,
          status_changed_at: new Date(),
          status_changed_by: c.principalId,
          updated_at:        new Date(),
          updated_by:        c.principalId,
        })
        .where("id",        "=", id)
        .where("tenant_id", "=", c.tenantId)
        .where("status",    "=", "quarantined")
        .returning(["id", "status"])
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!updated) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      logger?.warn?.("content_quarantine_released", {
        attachmentId: id,
        releasedBy:   c.principalId,
        tenantId:     c.tenantId,
      });

      res.json({ ok: true, data: { id, status: "active" } });
    } catch (err) {
      logger?.error("content_admin_quarantine_release_error", { err: String(err) });
      next(err);
    }
  });

  // ── DELETE /content/admin/attachments/:id ────────────────────────────────
  // Permanently removes a quarantined attachment: logical-deletes the DB row,
  // removes all entity_document_link rows, and deletes the S3 object.

  router.delete("/content/admin/attachments/:id", async (req, res, next) => {
    try {
      const c = await resolveCtx(req, res);
      if (!c) return;
      const { id } = req.params;
      if (!isUuid(id)) { res.status(400).json({ error: "INVALID_ID" }); return; }

      // Fetch storage key before deletion (needed for S3 cleanup)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await (db as any)
        .selectFrom("master.attachment")
        .select(["id", "storage_key", "status"])
        .where("id",        "=", id)
        .where("tenant_id", "=", c.tenantId)
        .where("status",    "=", "quarantined")
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      // Remove all entity links
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .deleteFrom("master.entity_document_link")
        .where("attachment_id", "=", id)
        .where("tenant_id",     "=", c.tenantId)
        .execute();

      // Logical-delete in DB
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .updateTable("master.attachment")
        .set({
          status:            "deleted",
          is_active:         false,
          reference_count:   0,
          status_changed_at: new Date(),
          status_changed_by: c.principalId,
          updated_at:        new Date(),
          updated_by:        c.principalId,
        })
        .where("id",        "=", id)
        .where("tenant_id", "=", c.tenantId)
        .execute();

      // Physical S3 delete (best-effort — don't block the response)
      if (objectStorage && row["storage_key"]) {
        void objectStorage.adapter.delete(row["storage_key"] as string).catch((e: unknown) => {
          logger?.error("content_admin_quarantine_s3_delete_error", {
            attachmentId: id,
            err: String(e),
          });
        });
      }

      logger?.warn?.("content_quarantine_deleted", {
        attachmentId: id,
        deletedBy:    c.principalId,
        tenantId:     c.tenantId,
      });

      res.status(204).end();
    } catch (err) {
      logger?.error("content_admin_quarantine_delete_error", { err: String(err) });
      next(err);
    }
  });
}
