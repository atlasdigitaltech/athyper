/**
 * Platform Taxonomy Routes
 *
 * Browse and search shared.commodity_code / shared.industry_code hierarchies.
 * Resolve crosswalks between code systems via shared.commodity_crosswalk /
 * shared.industry_crosswalk.
 *
 * family = "commodity" | "industry"  (validated at handler entry — 400 on mismatch)
 *   commodity code table   → shared.commodity_code
 *   industry  code table   → shared.industry_code
 *   commodity crosswalk    → shared.commodity_crosswalk
 *   industry  crosswalk    → shared.industry_crosswalk
 *
 * Auth: general bearer (global shared tables — no tenant context)
 * Cache: private, max-age=3600 for hierarchy / path / node
 *        private, max-age=300  for search
 *        private, max-age=1800 for crosswalk
 *
 * Final URLs (apiRouter mounted at /api):
 *   GET /api/platform/taxonomy/:family/domains
 *   GET /api/platform/taxonomy/:family/domains/:domain/roots
 *   GET /api/platform/taxonomy/:family/domains/:domain/nodes/:code
 *   GET /api/platform/taxonomy/:family/domains/:domain/nodes/:code/children
 *   GET /api/platform/taxonomy/:family/domains/:domain/nodes/:code/path
 *   GET /api/platform/taxonomy/:family/domains/:domain/search
 *   GET /api/platform/taxonomy/:family/crosswalks/resolve
 *   GET /api/platform/taxonomy/:family/crosswalks/reverse
 *   GET /api/platform/taxonomy/:family/crosswalks/browse
 *
 * Rules:
 *   - No full-tree or unlimited-depth endpoints.
 *   - Path in search is opt-in (?include_path=true) with max limit=20.
 *   - Children and roots are paginated (default limit=50, max=200).
 *   - Search uses GIN index on keywords (term = ANY(keywords)) + name/code ILIKE.
 *   - Crosswalk responses include hydrated source/target node summaries.
 */

import { createHash } from "node:crypto";
import type { Request, RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import busboy from "busboy";
import { appendPlatformAuditEvent } from "@athyper/svc-audit";
import {
  verifyBearer,
  parsePagination,
  parseSearch,
  setCachePrivate,
} from "@athyper/svc-shared";
import {
  requirePlatformPermission,
  requireCatalogWritable,
} from "../platform-guard.js";

// ─── Deps ──────────────────────────────────────────────────────────────────────

export interface TaxonomyRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Family helpers ────────────────────────────────────────────────────────────

type TaxonomyFamily = "commodity" | "industry";

function resolveFamily(
  family: string,
  res: Parameters<RequestHandler>[1],
): TaxonomyFamily | null {
  if (family === "commodity" || family === "industry") return family;
  res.status(400).json({ error: "INVALID_FAMILY", message: "family must be commodity or industry" });
  return null;
}

function codeTable(family: TaxonomyFamily): string {
  return family === "commodity" ? "shared.commodity_code" : "shared.industry_code";
}

function crosswalkTable(family: TaxonomyFamily): string {
  return family === "commodity" ? "shared.commodity_crosswalk" : "shared.industry_crosswalk";
}

// ─── Route factory ─────────────────────────────────────────────────────────────

export function registerTaxonomyRoutes(router: Router, deps: TaxonomyRoutesDeps): Router {
  const { db, auth, logger } = deps;

  // ── GET /platform/taxonomy/:family/domains ───────────────────────────────────
  // Domain discovery: query actual code table for distinct domains + stats.
  // Only domains with loaded codes appear. LEFT JOIN control.lookup_value for labels.

  const listDomainsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const family = resolveFamily((req.params["family"] as string) ?? "", res);
      if (!family) return;

      const tbl = codeTable(family);
      const alias = family === "commodity" ? "c" : "i";

      const rows = await sql<{
        domain_code: string;
        name: string | null;
        description: string | null;
        node_count: string;
        root_count: string;
        max_level: number | null;
      }>`
        SELECT
          ${sql.raw(alias)}.domain_code,
          lv.name,
          lv.description,
          COUNT(*)                                                   AS node_count,
          COUNT(*) FILTER (WHERE ${sql.raw(alias)}.parent_code IS NULL) AS root_count,
          MAX(${sql.raw(alias)}.level_no)                            AS max_level
        FROM ${sql.raw(tbl)} ${sql.raw(alias)}
        LEFT JOIN control.lookup_value lv
          ON lv.domain_code = 'master.cc_domain_code'
         AND lv.code = ${sql.raw(alias)}.domain_code
         AND lv.tenant_id IS NULL
        WHERE ${sql.raw(alias)}.status = 'active'
        GROUP BY ${sql.raw(alias)}.domain_code, lv.name, lv.description, lv.sort_order
        ORDER BY lv.sort_order ASC NULLS LAST, ${sql.raw(alias)}.domain_code ASC
      `.execute(db);

      setCachePrivate(res, 3600);
      res.json(rows.rows.map((r) => ({
        domain_code: r.domain_code,
        name:        r.name        ?? r.domain_code,
        description: r.description ?? null,
        node_count:  Number(r.node_count),
        root_count:  Number(r.root_count),
        max_level:   r.max_level   ?? null,
      })));
    } catch (err) {
      logger?.error("taxonomy_domains_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/taxonomy/:family/domains", listDomainsHandler);

  // ── GET /platform/taxonomy/:family/domains/:domain/roots ────────────────────
  // Level-1 nodes (parent_code IS NULL) for a given domain. Paginated.

  const listRootsHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const family = resolveFamily((req.params["family"] as string) ?? "", res);
      if (!family) return;

      const q = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);
      const domain = ((req.params["domain"] as string) ?? "").toLowerCase();
      const tbl = codeTable(family);
      const alias = "n";

      let base = db
        .selectFrom(`${tbl} as ${alias}`)
        .where(`${alias}.domain_code` as never, "=", domain as never)
        .where(`${alias}.parent_code` as never, "is", null)
        .where(`${alias}.status` as never, "=", "active" as never);

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("cnt")).executeTakeFirst(),
        base
          .select([
            `${alias}.id`, `${alias}.domain_code`, `${alias}.code`, `${alias}.name`,
            `${alias}.description`, `${alias}.level_no`, `${alias}.is_leaf`,
            `${alias}.keywords`, `${alias}.status`,
          ] as never[])
          .orderBy(`${alias}.code` as never, "asc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      setCachePrivate(res, 3600);
      res.json({
        data: rows.map((r: Record<string, unknown>) => ({ ...r, has_children: !(r["is_leaf"] as boolean) })),
        meta: { total: Number(countRow?.cnt ?? 0), page, limit, pages: Math.ceil(Number(countRow?.cnt ?? 0) / limit) },
      });
    } catch (err) {
      logger?.error("taxonomy_roots_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/taxonomy/:family/domains/:domain/roots", listRootsHandler);

  // ── GET /platform/taxonomy/:family/domains/:domain/nodes/:code ──────────────
  // Single node by (domain_code, code). Returns full field set including keywords.

  const getNodeHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const family = resolveFamily((req.params["family"] as string) ?? "", res);
      if (!family) return;

      const domain   = ((req.params["domain"] as string) ?? "").toLowerCase();
      const nodeCode = (req.params["code"] as string) ?? "";
      const tbl      = codeTable(family);
      const alias    = "n";

      const row = await db
        .selectFrom(`${tbl} as ${alias}`)
        .select([
          `${alias}.id`, `${alias}.domain_code`, `${alias}.code`, `${alias}.name`,
          `${alias}.description`, `${alias}.parent_code`, `${alias}.level_no`,
          `${alias}.is_leaf`, `${alias}.keywords`, `${alias}.status`,
        ] as never[])
        .where(`${alias}.domain_code` as never, "=", domain as never)
        .where(`${alias}.code` as never, "=", nodeCode as never)
        .executeTakeFirst() as Record<string, unknown> | undefined;

      if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      setCachePrivate(res, 3600);
      res.json({ ...row, has_children: !(row["is_leaf"] as boolean) });
    } catch (err) {
      logger?.error("taxonomy_node_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/taxonomy/:family/domains/:domain/nodes/:code", getNodeHandler);

  // ── GET /platform/taxonomy/:family/domains/:domain/nodes/:code/children ─────
  // Direct children of a node. Paginated. Uses commodity_code_parent_idx.

  const listChildrenHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const family = resolveFamily((req.params["family"] as string) ?? "", res);
      if (!family) return;

      const q = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);
      const domain   = ((req.params["domain"] as string) ?? "").toLowerCase();
      const nodeCode = (req.params["code"] as string) ?? "";
      const tbl      = codeTable(family);
      const alias    = "n";

      let base = db
        .selectFrom(`${tbl} as ${alias}`)
        .where(`${alias}.domain_code`  as never, "=", domain as never)
        .where(`${alias}.parent_code`  as never, "=", nodeCode as never)
        .where(`${alias}.status`       as never, "=", "active" as never);

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("cnt")).executeTakeFirst(),
        base
          .select([
            `${alias}.id`, `${alias}.domain_code`, `${alias}.code`, `${alias}.name`,
            `${alias}.description`, `${alias}.parent_code`, `${alias}.level_no`,
            `${alias}.is_leaf`, `${alias}.status`,
          ] as never[])
          .orderBy(`${alias}.code` as never, "asc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      setCachePrivate(res, 3600);
      res.json({
        data: (rows as Record<string, unknown>[]).map((r) => ({ ...r, has_children: !(r["is_leaf"] as boolean) })),
        meta: { total: Number(countRow?.cnt ?? 0), page, limit, pages: Math.ceil(Number(countRow?.cnt ?? 0) / limit) },
      });
    } catch (err) {
      logger?.error("taxonomy_children_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/taxonomy/:family/domains/:domain/nodes/:code/children", listChildrenHandler);

  // ── GET /platform/taxonomy/:family/domains/:domain/nodes/:code/path ─────────
  // Ancestor path from root to the requested node (ascending level_no order).
  // Uses WITH RECURSIVE on (domain_code, parent_code) — no parent_id FK.

  const getPathHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const family = resolveFamily((req.params["family"] as string) ?? "", res);
      if (!family) return;

      const domain   = ((req.params["domain"] as string) ?? "").toLowerCase();
      const nodeCode = (req.params["code"] as string) ?? "";
      const tbl      = codeTable(family);

      const pathRows = await sql<{
        id: string; domain_code: string; code: string; name: string;
        description: string | null; parent_code: string | null;
        level_no: number | null; is_leaf: boolean; status: string;
      }>`
        WITH RECURSIVE path AS (
          SELECT id, domain_code, code, name, description, parent_code, level_no, is_leaf, status
          FROM   ${sql.raw(tbl)}
          WHERE  domain_code = ${domain} AND code = ${nodeCode}
          UNION ALL
          SELECT c.id, c.domain_code, c.code, c.name, c.description,
                 c.parent_code, c.level_no, c.is_leaf, c.status
          FROM   ${sql.raw(tbl)} c
          JOIN   path p ON c.domain_code = p.domain_code AND c.code = p.parent_code
          WHERE  p.parent_code IS NOT NULL
        )
        SELECT id, domain_code, code, name, description, parent_code, level_no, is_leaf, status
        FROM   path
        ORDER BY level_no ASC
      `.execute(db);

      if (pathRows.rows.length === 0) { res.status(404).json({ error: "NOT_FOUND" }); return; }

      setCachePrivate(res, 3600);
      res.json(pathRows.rows.map((r) => ({ ...r, has_children: !r.is_leaf })));
    } catch (err) {
      logger?.error("taxonomy_path_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/taxonomy/:family/domains/:domain/nodes/:code/path", getPathHandler);

  // ── GET /platform/taxonomy/:family/domains/:domain/search ───────────────────
  // Search by name ILIKE, code ILIKE, or term = ANY(keywords) (GIN-indexed).
  // ?q=           search term (required, min 2 chars)
  // ?level=       filter to a specific level_no
  // ?leaf_only=   true → only leaf nodes
  // ?parent_code= filter to direct descendants of a parent
  // ?limit=       max results (default 20, max 50 without path; max 20 with path)
  // ?include_path= true → attach root→node breadcrumb path to each result

  const searchHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const family = resolveFamily((req.params["family"] as string) ?? "", res);
      if (!family) return;

      const q          = req.query as Record<string, unknown>;
      const term       = parseSearch({ search: q["q"] });   // reuse parseSearch via alias
      const domain     = ((req.params["domain"] as string) ?? "").toLowerCase();
      const includePath = q["include_path"] === "true";
      const leafOnly   = q["leaf_only"]    === "true";
      const levelNo    = typeof q["level"] === "string" ? parseInt(q["level"], 10) : null;
      const parentCode = typeof q["parent_code"] === "string" ? q["parent_code"] : "";

      // Enforce limit caps: smaller cap when path hydration requested
      const rawLimit   = parseInt(String(q["limit"] ?? "20"), 10) || 20;
      const limit      = Math.min(includePath ? 20 : 50, Math.max(1, rawLimit));

      if (!term || term.length < 2) {
        res.status(400).json({ error: "QUERY_TOO_SHORT", message: "?q must be at least 2 characters" });
        return;
      }

      const tbl   = codeTable(family);
      const alias = "n";
      const ilike = `%${term}%`;

      let base = db
        .selectFrom(`${tbl} as ${alias}`)
        .where(`${alias}.domain_code` as never, "=", domain as never)
        .where(`${alias}.status` as never, "=", "active" as never)
        .where((eb) => eb.or([
          eb(`${alias}.name` as never, "ilike", ilike as never),
          eb(`${alias}.code` as never, "ilike", ilike as never),
          // keywords GIN: term = ANY(keywords) — exact element match on the array
          sql<boolean>`${sql.raw(String(term).replace(/'/g, "''"))
            .toString()
            ? `'${String(term).replace(/'/g, "''")}'`
            : "''"} = ANY(${sql.raw(`${alias}.keywords`)})` as never,
        ]));

      if (leafOnly)            { base = base.where(`${alias}.is_leaf`     as never, "=", true as never)         as typeof base; }
      if (!Number.isNaN(levelNo) && levelNo !== null) {
        base = base.where(`${alias}.level_no`  as never, "=", levelNo as never)    as typeof base;
      }
      if (parentCode)          { base = base.where(`${alias}.parent_code` as never, "=", parentCode as never) as typeof base; }

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("cnt")).executeTakeFirst(),
        base
          .select([
            `${alias}.id`, `${alias}.domain_code`, `${alias}.code`, `${alias}.name`,
            `${alias}.description`, `${alias}.parent_code`, `${alias}.level_no`,
            `${alias}.is_leaf`, `${alias}.keywords`, `${alias}.status`,
          ] as never[])
          .orderBy(`${alias}.level_no` as never, "asc")
          .orderBy(`${alias}.code`     as never, "asc")
          .limit(limit)
          .execute(),
      ]);

      const resultRows = rows as Record<string, unknown>[];

      // Path hydration (opt-in) — individual recursive CTE per result (max 20)
      let pathMap = new Map<string, Record<string, unknown>[]>();
      if (includePath && resultRows.length > 0) {
        await Promise.all(resultRows.map(async (r) => {
          const nodeCode = r["code"] as string;
          const pathRows = await sql<Record<string, unknown>>`
            WITH RECURSIVE path AS (
              SELECT id, domain_code, code, name, level_no, parent_code, is_leaf, status
              FROM   ${sql.raw(tbl)}
              WHERE  domain_code = ${domain} AND code = ${nodeCode}
              UNION ALL
              SELECT c.id, c.domain_code, c.code, c.name, c.level_no, c.parent_code, c.is_leaf, c.status
              FROM   ${sql.raw(tbl)} c
              JOIN   path p ON c.domain_code = p.domain_code AND c.code = p.parent_code
              WHERE  p.parent_code IS NOT NULL
            )
            SELECT id, domain_code, code, name, level_no, parent_code, is_leaf, status
            FROM   path
            ORDER BY level_no ASC
          `.execute(db);
          pathMap.set(nodeCode, pathRows.rows as Record<string, unknown>[]);
        }));
      }

      setCachePrivate(res, 300);
      res.json({
        data: resultRows.map((r) => ({
          ...r,
          has_children: !(r["is_leaf"] as boolean),
          ...(includePath ? { path: pathMap.get(r["code"] as string) ?? [] } : {}),
        })),
        meta: { total: Number(countRow?.cnt ?? 0), limit },
      });
    } catch (err) {
      logger?.error("taxonomy_search_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/taxonomy/:family/domains/:domain/search", searchHandler);

  // ── GET /platform/taxonomy/:family/crosswalks/resolve ───────────────────────
  // Resolve source code to target domain. Returns all matches (may be multiple
  // mapping_types: EXACT, BROAD, NARROW, etc.). Ordered by confidence DESC.
  // ?source_domain= ?source_code= ?target_domain= (all required)

  const resolveHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const family = resolveFamily((req.params["family"] as string) ?? "", res);
      if (!family) return;

      const q = req.query as Record<string, unknown>;
      const sourceDomain = typeof q["source_domain"] === "string" ? q["source_domain"].toLowerCase() : "";
      const sourceCode   = typeof q["source_code"]   === "string" ? q["source_code"]   : "";
      const targetDomain = typeof q["target_domain"] === "string" ? q["target_domain"].toLowerCase() : "";

      if (!sourceDomain || !sourceCode || !targetDomain) {
        res.status(400).json({ error: "PARAMS_REQUIRED", message: "source_domain, source_code, target_domain required" });
        return;
      }

      const cwTbl  = crosswalkTable(family);
      const codeTbl = codeTable(family);

      const rows = await sql<{
        id: string;
        source_domain_code: string; source_code: string;
        target_domain_code: string; target_code: string;
        mapping_type: string; confidence: number | null; provenance: string;
        is_verified: boolean; verified_at: string | null; notes: string | null; status: string;
        source_name: string | null; source_level_no: number | null;
        target_name: string | null; target_level_no: number | null;
      }>`
        SELECT
          cw.id,
          cw.source_domain_code, cw.source_code,
          cw.target_domain_code, cw.target_code,
          cw.mapping_type, cw.confidence, cw.provenance,
          cw.is_verified, cw.verified_at, cw.notes, cw.status,
          src.name  AS source_name,  src.level_no  AS source_level_no,
          tgt.name  AS target_name,  tgt.level_no  AS target_level_no
        FROM   ${sql.raw(cwTbl)} cw
        LEFT JOIN ${sql.raw(codeTbl)} src
          ON src.domain_code = cw.source_domain_code AND src.code = cw.source_code
        LEFT JOIN ${sql.raw(codeTbl)} tgt
          ON tgt.domain_code = cw.target_domain_code AND tgt.code = cw.target_code
        WHERE  cw.source_domain_code = ${sourceDomain}
          AND  cw.source_code        = ${sourceCode}
          AND  cw.target_domain_code = ${targetDomain}
          AND  cw.status             = 'active'
        ORDER BY cw.confidence DESC NULLS LAST, cw.mapping_type ASC
      `.execute(db);

      setCachePrivate(res, 1800);
      res.json({
        data: rows.rows.map((r) => ({
          id: r.id,
          source: { domain_code: r.source_domain_code, code: r.source_code, name: r.source_name, level_no: r.source_level_no },
          target: { domain_code: r.target_domain_code, code: r.target_code, name: r.target_name, level_no: r.target_level_no },
          mapping_type: r.mapping_type,
          confidence:   r.confidence,
          provenance:   r.provenance,
          is_verified:  r.is_verified,
          verified_at:  r.verified_at,
          notes:        r.notes,
          status:       r.status,
        })),
      });
    } catch (err) {
      logger?.error("taxonomy_resolve_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/taxonomy/:family/crosswalks/resolve", resolveHandler);

  // ── GET /platform/taxonomy/:family/crosswalks/reverse ───────────────────────
  // Reverse lookup: given a target code, find all source codes that map to it.
  // ?target_domain= ?target_code= ?source_domain= (all required)

  const reverseHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const family = resolveFamily((req.params["family"] as string) ?? "", res);
      if (!family) return;

      const q = req.query as Record<string, unknown>;
      const targetDomain = typeof q["target_domain"] === "string" ? q["target_domain"].toLowerCase() : "";
      const targetCode   = typeof q["target_code"]   === "string" ? q["target_code"]   : "";
      const sourceDomain = typeof q["source_domain"] === "string" ? q["source_domain"].toLowerCase() : "";

      if (!targetDomain || !targetCode || !sourceDomain) {
        res.status(400).json({ error: "PARAMS_REQUIRED", message: "target_domain, target_code, source_domain required" });
        return;
      }

      const cwTbl   = crosswalkTable(family);
      const codeTbl = codeTable(family);

      const rows = await sql<{
        id: string;
        source_domain_code: string; source_code: string;
        target_domain_code: string; target_code: string;
        mapping_type: string; confidence: number | null; provenance: string;
        is_verified: boolean; verified_at: string | null; notes: string | null; status: string;
        source_name: string | null; source_level_no: number | null;
        target_name: string | null; target_level_no: number | null;
      }>`
        SELECT
          cw.id,
          cw.source_domain_code, cw.source_code,
          cw.target_domain_code, cw.target_code,
          cw.mapping_type, cw.confidence, cw.provenance,
          cw.is_verified, cw.verified_at, cw.notes, cw.status,
          src.name  AS source_name,  src.level_no  AS source_level_no,
          tgt.name  AS target_name,  tgt.level_no  AS target_level_no
        FROM   ${sql.raw(cwTbl)} cw
        LEFT JOIN ${sql.raw(codeTbl)} src
          ON src.domain_code = cw.source_domain_code AND src.code = cw.source_code
        LEFT JOIN ${sql.raw(codeTbl)} tgt
          ON tgt.domain_code = cw.target_domain_code AND tgt.code = cw.target_code
        WHERE  cw.target_domain_code = ${targetDomain}
          AND  cw.target_code        = ${targetCode}
          AND  cw.source_domain_code = ${sourceDomain}
          AND  cw.status             = 'active'
        ORDER BY cw.confidence DESC NULLS LAST, cw.mapping_type ASC
      `.execute(db);

      setCachePrivate(res, 1800);
      res.json({
        data: rows.rows.map((r) => ({
          id: r.id,
          source: { domain_code: r.source_domain_code, code: r.source_code, name: r.source_name, level_no: r.source_level_no },
          target: { domain_code: r.target_domain_code, code: r.target_code, name: r.target_name, level_no: r.target_level_no },
          mapping_type: r.mapping_type,
          confidence:   r.confidence,
          provenance:   r.provenance,
          is_verified:  r.is_verified,
          verified_at:  r.verified_at,
          notes:        r.notes,
          status:       r.status,
        })),
      });
    } catch (err) {
      logger?.error("taxonomy_reverse_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/taxonomy/:family/crosswalks/reverse", reverseHandler);

  // ── GET /platform/taxonomy/:family/crosswalks/browse ────────────────────────
  // Admin inspection of crosswalk mappings. Paginated.
  // ?source_domain= ?target_domain= ?source_code= ?target_code=
  // ?mapping_type=  ?verified_only= ?status=

  const browseCrosswalksHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;
      const family = resolveFamily((req.params["family"] as string) ?? "", res);
      if (!family) return;

      const q = req.query as Record<string, unknown>;
      const { page, limit, offset } = parsePagination(q);
      const sourceDomain  = typeof q["source_domain"]  === "string" ? q["source_domain"].toLowerCase()  : "";
      const targetDomain  = typeof q["target_domain"]  === "string" ? q["target_domain"].toLowerCase()  : "";
      const sourceCode    = typeof q["source_code"]    === "string" ? q["source_code"]    : "";
      const targetCode    = typeof q["target_code"]    === "string" ? q["target_code"]    : "";
      const mappingType   = typeof q["mapping_type"]   === "string" ? q["mapping_type"].toUpperCase()   : "";
      const verifiedOnly  = q["verified_only"] === "true";
      const statusFilter  = typeof q["status"] === "string" ? q["status"] : "active";

      let base = db.selectFrom(`${crosswalkTable(family)} as cw`);
      if (sourceDomain) { base = base.where("cw.source_domain_code" as never, "=", sourceDomain as never) as typeof base; }
      if (targetDomain) { base = base.where("cw.target_domain_code" as never, "=", targetDomain as never) as typeof base; }
      if (sourceCode)   { base = base.where("cw.source_code"        as never, "=", sourceCode   as never) as typeof base; }
      if (targetCode)   { base = base.where("cw.target_code"        as never, "=", targetCode   as never) as typeof base; }
      if (mappingType)  { base = base.where("cw.mapping_type"       as never, "=", mappingType  as never) as typeof base; }
      if (verifiedOnly) { base = base.where("cw.is_verified"        as never, "=", true         as never) as typeof base; }
      base = base.where("cw.status" as never, "=", statusFilter as never) as typeof base;

      const [countRow, rows] = await Promise.all([
        base.select((eb) => eb.fn.countAll<string>().as("cnt")).executeTakeFirst(),
        base
          .select([
            "cw.id",
            "cw.source_domain_code", "cw.source_code",
            "cw.target_domain_code", "cw.target_code",
            "cw.mapping_type", "cw.confidence", "cw.provenance",
            "cw.is_verified", "cw.verified_at", "cw.notes", "cw.status",
          ] as never[])
          .orderBy("cw.source_domain_code" as never, "asc")
          .orderBy("cw.source_code"        as never, "asc")
          .orderBy("cw.confidence"         as never, "desc")
          .limit(limit)
          .offset(offset)
          .execute(),
      ]);

      setCachePrivate(res, 1800);
      res.json({
        data: rows,
        meta: { total: Number(countRow?.cnt ?? 0), page, limit, pages: Math.ceil(Number(countRow?.cnt ?? 0) / limit) },
      });
    } catch (err) {
      logger?.error("taxonomy_browse_crosswalks_error", { err: String(err) });
      next(err);
    }
  };
  router.get("/platform/taxonomy/:family/crosswalks/browse", browseCrosswalksHandler);

  // ═══════════════════════════════════════════════════════════════════════════
  // CROSSWALK IMPORT — POST /platform/taxonomy/:family/crosswalks/import
  // Idempotent upsert for shared.commodity_crosswalk / shared.industry_crosswalk.
  // DDL column names: source_domain_code, source_code, target_domain_code, target_code.
  // Requires PLATFORM.TAXONOMY.IMPORT + PLATFORM_CATALOG_WRITABLE env.
  // ═══════════════════════════════════════════════════════════════════════════

  const CROSSWALK_REQUIRED_COLUMNS = ["source_domain_code", "source_code", "target_domain_code", "target_code"];
  const CROSSWALK_ALLOWED_COLUMNS  = new Set([
    ...CROSSWALK_REQUIRED_COLUMNS, "confidence", "notes",
  ]);
  const MAX_CW_UPLOAD_BYTES = 20 * 1024 * 1024;

  function sha256hex(buf: Buffer): string {
    return createHash("sha256").update(buf).digest("hex");
  }

  function parseCwCsvBuffer(buf: Buffer): Record<string, string>[] {
    const text  = buf.toString("utf-8");
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0]!.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    return lines.slice(1).map((line) => {
      const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
    });
  }

  function validateCwRows(rows: Record<string, string>[]): { row: number; field: string; message: string }[] {
    const errors: { row: number; field: string; message: string }[] = [];
    if (rows.length > 0) {
      for (const col of Object.keys(rows[0]!)) {
        if (!CROSSWALK_ALLOWED_COLUMNS.has(col)) {
          errors.push({ row: 0, field: col, message: `Unknown crosswalk column '${col}'. Accepted: ${[...CROSSWALK_ALLOWED_COLUMNS].join(", ")}` });
        }
      }
    }
    if (errors.length > 0) return errors;
    for (let i = 0; i < rows.length; i++) {
      for (const req of CROSSWALK_REQUIRED_COLUMNS) {
        if (!rows[i]![req]?.trim()) {
          errors.push({ row: i + 1, field: req, message: `Required field '${req}' is empty` });
        }
      }
    }
    return errors;
  }

  function readCwUpload(req: Request): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_CW_UPLOAD_BYTES } });
      let fileSeen = false; let limitExceeded = false; let sizeBytes = 0;
      const chunks: Buffer[] = []; let settled = false;
      const rejectOnce = (err: unknown) => {
        if (settled) return; settled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      bb.on("file", (_f, stream, _i) => {
        if (fileSeen) { stream.resume(); return; }
        fileSeen = true;
        stream.on("data", (chunk: Buffer) => {
          if (limitExceeded) return;
          sizeBytes += chunk.length;
          if (sizeBytes > MAX_CW_UPLOAD_BYTES) { limitExceeded = true; chunks.length = 0; stream.resume(); return; }
          chunks.push(Buffer.from(chunk));
        });
        stream.on("limit", () => { limitExceeded = true; chunks.length = 0; });
        stream.on("error", rejectOnce);
      });
      bb.on("finish", () => {
        if (settled) return;
        if (limitExceeded) { rejectOnce(Object.assign(new Error("FILE_TOO_LARGE"),    { statusCode: 413 })); return; }
        if (!fileSeen)     { rejectOnce(Object.assign(new Error("MISSING_FILE"),      { statusCode: 400 })); return; }
        const buf = Buffer.concat(chunks, sizeBytes);
        if (buf.byteLength === 0) { rejectOnce(Object.assign(new Error("EMPTY_FILE"), { statusCode: 400 })); return; }
        settled = true; resolve(buf);
      });
      bb.on("error", rejectOnce);
      req.pipe(bb);
    });
  }

  const crosswalkImportHandler: RequestHandler = async (req, res, next) => {
    try {
      const fam = resolveFamily((req.params["family"] as string ?? "").trim(), res);
      if (!fam) return;
      if (!requireCatalogWritable(res)) return;

      const g = await requirePlatformPermission(req, res, auth, db, "PLATFORM.TAXONOMY.IMPORT");
      if (!g) return;

      let fileBuffer: Buffer;
      try { fileBuffer = await readCwUpload(req); }
      catch (uploadErr: unknown) {
        const e = uploadErr as { statusCode?: number; message?: string };
        res.status(e.statusCode ?? 400).json({ error: e.message ?? "UPLOAD_ERROR" });
        return;
      }

      const checksum = sha256hex(fileBuffer);
      const rows     = parseCwCsvBuffer(fileBuffer);
      const errors   = validateCwRows(rows);
      if (errors.length > 0) { res.status(422).json({ error: "VALIDATION_FAILED", errors }); return; }

      if (req.query["preview"] === "true") {
        res.json({ checksum, row_count: rows.length, preview: rows.slice(0, 5), errors: [] });
        return;
      }

      const cwTable = fam === "commodity" ? "shared.commodity_crosswalk" : "shared.industry_crosswalk";

      let inserted = 0; let updated = 0;
      await (db as Kysely<any>).transaction().execute(async (trx) => {
        for (const row of rows) {
          const prior = await trx
            .selectFrom(cwTable as never)
            .select("id" as never)
            .where("source_domain_code" as never, "=", row["source_domain_code"] as never)
            .where("source_code"        as never, "=", row["source_code"]        as never)
            .where("target_domain_code" as never, "=", row["target_domain_code"] as never)
            .where("target_code"        as never, "=", row["target_code"]        as never)
            .executeTakeFirst() as { id: string } | undefined;

          if (prior) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const upd: Record<string, any> = { updated_at: new Date().toISOString(), updated_by: g.principalId };
            if (row["confidence"]) upd["confidence"] = Number(row["confidence"]);
            if (row["notes"])      upd["notes"]      = row["notes"];
            await trx.updateTable(cwTable as never).set(upd as never).where("id" as never, "=", prior.id as never).execute();
            updated++;
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ins: Record<string, any> = {
              source_domain_code: row["source_domain_code"],
              source_code:        row["source_code"],
              target_domain_code: row["target_domain_code"],
              target_code:        row["target_code"],
              created_at: new Date().toISOString(),
              created_by: g.principalId,
            };
            if (row["confidence"]) ins["confidence"] = Number(row["confidence"]);
            if (row["notes"])      ins["notes"]      = row["notes"];
            await trx.insertInto(cwTable as never).values(ins as never).execute();
            inserted++;
          }
        }
      });

      void appendPlatformAuditEvent(db, {
        event_code:  "platform.taxonomy.import",
        operation:   "import",
        entity_type: cwTable,
        scope_id:    g.principalId,
        context:     { checksum, inserted, updated, row_count: inserted + updated },
      });

      res.json({ checksum, inserted, updated, row_count: inserted + updated });
    } catch (err) {
      logger?.error("taxonomy_crosswalk_import_error", { err: String(err) });
      next(err);
    }
  };
  router.post("/platform/taxonomy/:family/crosswalks/import", crosswalkImportHandler);

  return router;
}
