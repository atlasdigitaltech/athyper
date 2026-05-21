/**
 * Platform Classification Routes
 *
 * CRUD for master.commodity_classification — the unified M:N bridge mapping
 * any tenant entity to commodity/industry codes in any domain (UNSPSC, HS, NAICS …).
 *
 * Auth: bearer + tenant context (x-org / x-realm headers → tenant_id).
 * Principal is resolved for audit columns; falls back to SYSTEM_PRINCIPAL_UUID.
 *
 * Final URLs (apiRouter mounted at /api):
 *   GET    /api/platform/classifications/:ownerType/:ownerId
 *   POST   /api/platform/classifications/:ownerType/:ownerId/bulk
 *   DELETE /api/platform/classifications/:ownerType/:ownerId/:classificationId
 *   DELETE /api/platform/classifications/:ownerType/:ownerId
 *
 * Valid ownerType:          product | commodity_category | item | customer | supplier
 * Valid classificationType: commodity | industry
 *
 * Bulk POST accepts items with either:
 *   code_id (UUID)           — direct foreign key
 *   {domain_code, code}      — natural key; resolved to code_id on the fly
 *
 * EXCLUDE constraint handling:
 *   When is_primary=true, existing primary rows for the same
 *   (tenant_id, owner_type, owner_id, classification_type, domain_code) are
 *   auto-demoted to is_primary=false before upserting the new primary.
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  verifyBearer,
  isUuid,
  extractOrgHeaders,
  resolveTenantId,
  resolvePrincipalIdOrNull,
  SYSTEM_PRINCIPAL_UUID,
} from "@athyper/svc-shared";

// ─── Deps ──────────────────────────────────────────────────────────────────────

export interface ClassificationRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const VALID_OWNER_TYPES = new Set([
  "product", "commodity_category", "item", "customer", "supplier",
]);

const VALID_CLASSIFICATION_TYPES = new Set(["commodity", "industry"]);

const OWNER_TYPE_LIST = [...VALID_OWNER_TYPES].join(", ");

// ─── Internal helpers ──────────────────────────────────────────────────────────

function codeTable(classificationType: string): string {
  return classificationType === "commodity"
    ? "shared.commodity_code"
    : "shared.industry_code";
}

interface BulkItem {
  classification_type: string;
  domain_code:         string;
  code_id?:            string;
  code?:               string;
  mapping_type:        string;
  confidence:          number | null;
  provenance:          string;
  is_primary:          boolean;
  description:         string | null;
  metadata:            Record<string, unknown>;
}

// ─── Route factory ─────────────────────────────────────────────────────────────

export function registerClassificationRoutes(
  router: Router,
  deps: ClassificationRoutesDeps,
): Router {
  const { db, auth, logger } = deps;

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /platform/classifications/:ownerType/:ownerId
  //
  // Lists active classifications for the given entity.
  // Polymorphic JOIN to both shared.commodity_code and shared.industry_code;
  // COALESCE picks the right name/code depending on classification_type.
  //
  // Query params:
  //   ?classification_type=commodity|industry   — narrow to one type
  //   ?domain_code=unspsc|hs|naics|…            — narrow to one domain
  // ═══════════════════════════════════════════════════════════════════════════

  const listHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { ownerType, ownerId } = req.params as Record<string, string>;
      if (!VALID_OWNER_TYPES.has(ownerType!)) {
        res.status(400).json({ error: "INVALID_OWNER_TYPE", message: `ownerType must be one of: ${OWNER_TYPE_LIST}` });
        return;
      }
      if (!isUuid(ownerId!)) {
        res.status(400).json({ error: "INVALID_OWNER_ID", message: "ownerId must be a valid UUID" });
        return;
      }

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "TENANT_NOT_FOUND", message: "Could not resolve tenant from x-org header" });
        return;
      }

      const q   = req.query as Record<string, unknown>;
      const fct = typeof q["classification_type"] === "string" ? q["classification_type"] : null;
      const fdc = typeof q["domain_code"]         === "string" ? q["domain_code"]         : null;

      if (fct && !VALID_CLASSIFICATION_TYPES.has(fct)) {
        res.status(400).json({ error: "INVALID_CLASSIFICATION_TYPE", message: "classification_type must be: commodity | industry" });
        return;
      }

      let query = db
        .selectFrom("master.commodity_classification as cl")
        .leftJoin("shared.commodity_code as cc", (join) =>
          join
            .onRef("cc.id", "=", "cl.code_id" as never)
            .on("cl.classification_type" as never, "=", "commodity" as never),
        )
        .leftJoin("shared.industry_code as ic", (join) =>
          join
            .onRef("ic.id", "=", "cl.code_id" as never)
            .on("cl.classification_type" as never, "=", "industry" as never),
        )
        .select([
          "cl.id"                  as never,
          "cl.classification_type" as never,
          "cl.domain_code"         as never,
          "cl.code_id"             as never,
          sql<string>`COALESCE(cc.code, ic.code)`.as("code"),
          sql<string>`COALESCE(cc.name, ic.name)`.as("code_name"),
          "cl.mapping_type"        as never,
          "cl.confidence"          as never,
          "cl.provenance"          as never,
          "cl.is_primary"          as never,
          "cl.description"         as never,
          "cl.status"              as never,
          "cl.metadata"            as never,
          "cl.created_at"          as never,
          "cl.updated_at"          as never,
        ])
        .where("cl.tenant_id"  as never, "=", tenantId as never)
        .where("cl.owner_type" as never, "=", ownerType as never)
        .where("cl.owner_id"   as never, "=", ownerId   as never)
        .where("cl.is_active"  as never, "=", true      as never)
        .orderBy("cl.is_primary" as never, "desc")
        .orderBy("cl.domain_code" as never, "asc")
        .orderBy("cl.created_at" as never, "asc");

      if (fct) query = query.where("cl.classification_type" as never, "=", fct as never) as typeof query;
      if (fdc) query = query.where("cl.domain_code"         as never, "=", fdc as never) as typeof query;

      const rows = await query.execute();

      res.setHeader("Cache-Control", "no-store");
      res.json({ data: rows });
    } catch (err) {
      logger?.error("classification.list.error", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /platform/classifications/:ownerType/:ownerId/bulk
  //
  // Upserts a batch of classification rows.
  // Conflict target: UNIQUE (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
  // Primary guard: auto-demotes existing is_primary=true rows before upserting any
  //                new primary in the same (classification_type, domain_code) group.
  //
  // Body: { items: BulkItem[] }
  // ═══════════════════════════════════════════════════════════════════════════

  const bulkUpsertHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { ownerType, ownerId } = req.params as Record<string, string>;
      if (!VALID_OWNER_TYPES.has(ownerType!)) {
        res.status(400).json({ error: "INVALID_OWNER_TYPE", message: `ownerType must be one of: ${OWNER_TYPE_LIST}` });
        return;
      }
      if (!isUuid(ownerId!)) {
        res.status(400).json({ error: "INVALID_OWNER_ID", message: "ownerId must be a valid UUID" });
        return;
      }

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "TENANT_NOT_FOUND", message: "Could not resolve tenant from x-org header" });
        return;
      }

      const sub         = typeof claims["sub"] === "string" ? claims["sub"] : "";
      const principalId = (await resolvePrincipalIdOrNull(db, sub, tenantId)) ?? SYSTEM_PRINCIPAL_UUID;

      const body = req.body as { items?: unknown } | undefined;
      if (!Array.isArray(body?.items) || (body!.items as unknown[]).length === 0) {
        res.status(400).json({ error: "INVALID_BODY", message: "body.items must be a non-empty array" });
        return;
      }

      const raw = body!.items as Record<string, unknown>[];

      // ── Validate and normalise items ────────────────────────────────────────
      const items: BulkItem[] = [];
      for (let i = 0; i < raw.length; i++) {
        const item      = raw[i]!;
        const classType = String(item["classification_type"] ?? "");
        const domCode   = String(item["domain_code"] ?? "");
        const codeId    = typeof item["code_id"] === "string" ? item["code_id"] : undefined;
        const code      = typeof item["code"]    === "string" ? item["code"]    : undefined;

        if (!VALID_CLASSIFICATION_TYPES.has(classType)) {
          res.status(400).json({ error: "INVALID_ITEM", message: `items[${i}].classification_type must be: commodity | industry` });
          return;
        }
        if (!domCode) {
          res.status(400).json({ error: "INVALID_ITEM", message: `items[${i}].domain_code is required` });
          return;
        }
        if (!codeId && !code) {
          res.status(400).json({ error: "INVALID_ITEM", message: `items[${i}]: provide code_id (UUID) or code (natural key)` });
          return;
        }
        if (codeId && !isUuid(codeId)) {
          res.status(400).json({ error: "INVALID_ITEM", message: `items[${i}].code_id is not a valid UUID` });
          return;
        }

        const confidence = typeof item["confidence"] === "number" ? item["confidence"] : null;
        if (confidence !== null && (confidence < 0 || confidence > 100)) {
          res.status(400).json({ error: "INVALID_ITEM", message: `items[${i}].confidence must be 0–100` });
          return;
        }

        items.push({
          classification_type: classType,
          domain_code:         domCode,
          code_id:             codeId,
          code,
          mapping_type:  typeof item["mapping_type"] === "string" ? item["mapping_type"] : "exact",
          confidence,
          provenance:    typeof item["provenance"]   === "string" ? item["provenance"]   : "manual",
          is_primary:    Boolean(item["is_primary"]),
          description:   typeof item["description"]  === "string" ? item["description"]  : null,
          metadata:
            typeof item["metadata"] === "object" && item["metadata"] !== null
              ? (item["metadata"] as Record<string, unknown>)
              : {},
        });
      }

      // ── Guard: at most one is_primary per (classification_type, domain_code) ─
      const primarySeen = new Map<string, number>();
      for (let i = 0; i < items.length; i++) {
        const it = items[i]!;
        if (it.is_primary) {
          const key = `${it.classification_type}:${it.domain_code}`;
          if (primarySeen.has(key)) {
            res.status(400).json({
              error:   "MULTIPLE_PRIMARIES",
              message: `Batch has more than one primary for ${key} (items[${primarySeen.get(key)}] and items[${i}])`,
            });
            return;
          }
          primarySeen.set(key, i);
        }
      }

      // ── Transactional upsert ────────────────────────────────────────────────
      const now     = new Date();
      const results = await db.transaction().execute(async (trx) => {
        const upserted: Record<string, unknown>[] = [];

        for (const item of items) {
          // Resolve natural key → code_id
          let codeId = item.code_id;
          if (!codeId && item.code) {
            const tbl    = codeTable(item.classification_type);
            const codeRow = await trx
              .selectFrom(tbl as never)
              .select("id" as never)
              .where("domain_code" as never, "=", item.domain_code as never)
              .where("code"        as never, "=", item.code        as never)
              .executeTakeFirst() as { id: string } | undefined;

            if (!codeRow) {
              throw Object.assign(
                new Error(`Code not found: ${item.classification_type}/${item.domain_code}/${item.code}`),
                { statusCode: 422 },
              );
            }
            codeId = codeRow.id;
          }

          // Auto-demote existing primary for this (classification_type, domain_code) group
          if (item.is_primary) {
            await trx
              .updateTable("master.commodity_classification" as never)
              .set({
                is_primary:  false      as never,
                updated_at:  now        as never,
                updated_by:  principalId as never,
              } as never)
              .where("tenant_id"          as never, "=",  tenantId                  as never)
              .where("owner_type"         as never, "=",  ownerType                 as never)
              .where("owner_id"           as never, "=",  ownerId                   as never)
              .where("classification_type" as never, "=", item.classification_type  as never)
              .where("domain_code"        as never, "=",  item.domain_code          as never)
              .where("is_primary"         as never, "=",  true                      as never)
              .where("code_id"            as never, "!=", codeId                    as never)
              .execute();
          }

          // Upsert — conflict on cc_owner_code_uq
          const row = await trx
            .insertInto("master.commodity_classification" as never)
            .values({
              tenant_id:           tenantId            as never,
              owner_type:          ownerType           as never,
              owner_id:            ownerId             as never,
              classification_type: item.classification_type as never,
              domain_code:         item.domain_code    as never,
              code_id:             codeId              as never,
              mapping_type:        item.mapping_type   as never,
              confidence:          item.confidence     as never,
              provenance:          item.provenance     as never,
              is_primary:          item.is_primary     as never,
              description:         item.description    as never,
              metadata:            item.metadata       as never,
              status:              "active"            as never,
              created_by:          principalId         as never,
              updated_at:          now                 as never,
              updated_by:          principalId         as never,
            } as never)
            .onConflict((oc) =>
              oc.constraint("cc_owner_code_uq").doUpdateSet({
                mapping_type: item.mapping_type as never,
                confidence:   item.confidence   as never,
                provenance:   item.provenance   as never,
                is_primary:   item.is_primary   as never,
                description:  item.description  as never,
                metadata:     item.metadata     as never,
                status:       "active"          as never,
                updated_at:   now               as never,
                updated_by:   principalId       as never,
              } as never),
            )
            .returning([
              "id"                  as never,
              "classification_type" as never,
              "domain_code"         as never,
              "code_id"             as never,
              "mapping_type"        as never,
              "confidence"          as never,
              "provenance"          as never,
              "is_primary"          as never,
              "description"         as never,
              "status"              as never,
              "created_at"          as never,
              "updated_at"          as never,
            ])
            .executeTakeFirstOrThrow();

          upserted.push(row as Record<string, unknown>);
        }

        return upserted;
      });

      res.status(200).json({ data: results });
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      if (e?.["statusCode"] === 422) {
        res.status(422).json({ error: "CODE_NOT_FOUND", message: (err as Error).message });
        return;
      }
      logger?.error("classification.bulk.error", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /platform/classifications/:ownerType/:ownerId/:classificationId
  //
  // Soft-deletes a single classification row (status → 'inactive', is_primary → false).
  // Scoped to tenant + owner for safety; 404 if not found or already inactive.
  // ═══════════════════════════════════════════════════════════════════════════

  const deleteOneHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { ownerType, ownerId, classificationId } = req.params as Record<string, string>;
      if (!VALID_OWNER_TYPES.has(ownerType!)) {
        res.status(400).json({ error: "INVALID_OWNER_TYPE", message: `ownerType must be one of: ${OWNER_TYPE_LIST}` });
        return;
      }
      if (!isUuid(ownerId!)) {
        res.status(400).json({ error: "INVALID_OWNER_ID", message: "ownerId must be a valid UUID" });
        return;
      }
      if (!isUuid(classificationId!)) {
        res.status(400).json({ error: "INVALID_CLASSIFICATION_ID", message: "classificationId must be a valid UUID" });
        return;
      }

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "TENANT_NOT_FOUND", message: "Could not resolve tenant from x-org header" });
        return;
      }

      const sub         = typeof claims["sub"] === "string" ? claims["sub"] : "";
      const principalId = (await resolvePrincipalIdOrNull(db, sub, tenantId)) ?? SYSTEM_PRINCIPAL_UUID;

      const now = new Date();
      const result = await db
        .updateTable("master.commodity_classification" as never)
        .set({
          status:             "inactive" as never,
          is_primary:         false      as never,
          status_changed_at:  now        as never,
          status_changed_by:  principalId as never,
          updated_at:         now        as never,
          updated_by:         principalId as never,
        } as never)
        .where("id"         as never, "=", classificationId as never)
        .where("tenant_id"  as never, "=", tenantId         as never)
        .where("owner_type" as never, "=", ownerType         as never)
        .where("owner_id"   as never, "=", ownerId           as never)
        .where("status"     as never, "=", "active"          as never)
        .returning("id" as never)
        .executeTakeFirst() as { id: string } | undefined;

      if (!result) {
        res.status(404).json({ error: "NOT_FOUND", message: "Classification not found or already inactive" });
        return;
      }

      res.status(200).json({ id: classificationId, status: "inactive" });
    } catch (err) {
      logger?.error("classification.deleteOne.error", { err: String(err) });
      next(err);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /platform/classifications/:ownerType/:ownerId
  //
  // Scoped soft-delete — deactivates all matching active rows for the owner.
  // Query params narrow the scope:
  //   ?classification_type=commodity|industry   — required or all types cleared
  //   ?domain_code=<code>                       — optional further narrow
  //
  // Returns { deleted: <count> }.
  // ═══════════════════════════════════════════════════════════════════════════

  const deleteScopedHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const { ownerType, ownerId } = req.params as Record<string, string>;
      if (!VALID_OWNER_TYPES.has(ownerType!)) {
        res.status(400).json({ error: "INVALID_OWNER_TYPE", message: `ownerType must be one of: ${OWNER_TYPE_LIST}` });
        return;
      }
      if (!isUuid(ownerId!)) {
        res.status(400).json({ error: "INVALID_OWNER_ID", message: "ownerId must be a valid UUID" });
        return;
      }

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);
      if (!tenantId) {
        res.status(400).json({ error: "TENANT_NOT_FOUND", message: "Could not resolve tenant from x-org header" });
        return;
      }

      const sub         = typeof claims["sub"] === "string" ? claims["sub"] : "";
      const principalId = (await resolvePrincipalIdOrNull(db, sub, tenantId)) ?? SYSTEM_PRINCIPAL_UUID;

      const q   = req.query as Record<string, unknown>;
      const fct = typeof q["classification_type"] === "string" ? q["classification_type"] : null;
      const fdc = typeof q["domain_code"]         === "string" ? q["domain_code"]         : null;

      if (fct && !VALID_CLASSIFICATION_TYPES.has(fct)) {
        res.status(400).json({ error: "INVALID_CLASSIFICATION_TYPE", message: "classification_type must be: commodity | industry" });
        return;
      }

      const now = new Date();

      let updateQuery = db
        .updateTable("master.commodity_classification" as never)
        .set({
          status:             "inactive" as never,
          is_primary:         false      as never,
          status_changed_at:  now        as never,
          status_changed_by:  principalId as never,
          updated_at:         now        as never,
          updated_by:         principalId as never,
        } as never)
        .where("tenant_id"  as never, "=", tenantId as never)
        .where("owner_type" as never, "=", ownerType as never)
        .where("owner_id"   as never, "=", ownerId   as never)
        .where("status"     as never, "=", "active"  as never);

      if (fct) updateQuery = updateQuery.where("classification_type" as never, "=", fct as never) as typeof updateQuery;
      if (fdc) updateQuery = updateQuery.where("domain_code"         as never, "=", fdc as never) as typeof updateQuery;

      const result = await updateQuery.executeTakeFirst() as { numUpdatedRows?: bigint } | undefined;
      const count  = Number(result?.numUpdatedRows ?? 0n);

      res.status(200).json({ deleted: count });
    } catch (err) {
      logger?.error("classification.deleteScoped.error", { err: String(err) });
      next(err);
    }
  };

  // ── Route registrations ────────────────────────────────────────────────────
  //
  // Order matters: /:classificationId must be registered before bare /:ownerId
  // for DELETE, but Express differentiates by path segment count so both are fine.

  router.get(
    "/platform/classifications/:ownerType/:ownerId",
    listHandler,
  );
  router.post(
    "/platform/classifications/:ownerType/:ownerId/bulk",
    bulkUpsertHandler,
  );
  router.delete(
    "/platform/classifications/:ownerType/:ownerId/:classificationId",
    deleteOneHandler,
  );
  router.delete(
    "/platform/classifications/:ownerType/:ownerId",
    deleteScopedHandler,
  );

  return router;
}
