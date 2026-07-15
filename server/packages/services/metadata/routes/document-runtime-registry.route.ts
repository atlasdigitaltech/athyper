/**
 * Document-runtime registry routes:
 *   GET /api/runtime/v1/bindings/:code
 *   GET /api/runtime/v1/lookups/:code
 *   GET /api/runtime/v1/entities/:entity/rules     (merged field + action rules envelope)
 *
 * The rules endpoint queries control.entity_field and control.entity_action_rule
 * directly and returns the merged envelope the BFF previously assembled from
 * two separate upstream calls. Querying source tables directly avoids the
 * records-API auto-coverage dependency.
 *
 * Why a dedicated route family:
 *   These three tables are framework-infrastructure, not tenant
 *   "records". The records API requires entity registration
 *   (control.entity row) + filterable-column flags
 *   (control.entity_field.is_filterable = true) for every column the
 *   caller filters on. Both of those depend on the auto-coverage seeds
 *   (040a / 042) applying cleanly — which has been a recurring failure
 *   point. Querying directly removes that dependency entirely.
 *
 * Tenant scope:
 *   All three tables are platform-wide (no tenant_id column). No tenant
 *   filter applies. Authn is enforced via the standard bearer check.
 *
 * Mirrors the `permission-alias.route.ts` pattern.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { RequestHandler, Router } from "express";

import { verifyBearer } from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export interface DocumentRuntimeRegistryRouteDeps {
  db: AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn?(event: string, fields?: Record<string, unknown>): void;
  };
}

// ─── Row shapes ──────────────────────────────────────────────────────

interface PolymorphicChildBindingRow {
  binding_code:          string;
  parent_entity_code:    string;
  child_entity_code:     string;
  binding_kind:          string;
  fk_field:              string | null;
  source_doc_type_value: string | null;
  source_doc_id_field:   string | null;
  source_line_id_field:  string | null;
  status:                string;
  description:           string | null;
  // Free-form metadata; the BFF reads `record_filter` from here to
  // append extra `filter.<field>=<sigil>` URL params on the records
  // fetch. Used today to exclude superseded pricing_component rows.
  metadata:              Record<string, unknown> | null;
}

interface DocumentLookupRow {
  lookup_code:   string;
  child_entity:  string;
  base_filters:  Record<string, unknown>;
  status:        string;
  description:   string | null;
}

interface EntityActionRuleRow {
  entity_code:         string;
  status:              string;
  action_code:         string;
  capability:          string;
  required_permission: string | null;
  reason:              string | null;
}

interface EntityFieldRuleRow {
  name:        string;
  // editability->'editable_in_status' extracted in SQL; an array of status codes.
  editable_in_status: string[] | null;
}

interface MergedRulesResponse {
  ok:           true;
  entity:       string;
  field_rules:  Record<string, { editable_in_status: string[] }>;
  action_rules: Record<string, Record<string, {
    capability:          "allowed" | "denied" | "requires_permission";
    required_permission: string | null;
    reason:              string | null;
  }>>;
}

// ─── Route factory ───────────────────────────────────────────────────

export function createDocumentRuntimeRegistryRoute(
  router: Router,
  deps: DocumentRuntimeRegistryRouteDeps,
): Router {
  const { db, auth, logger } = deps;

  // ─── Binding lookup ─────────────────────────────────────────────────
  const bindingHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const code = String(req.params.code ?? "").trim();
      if (!code) {
        res.status(400).json({ error: "INVALID_PARAM", message: "binding code is required" });
        return;
      }

      const result = await sql<PolymorphicChildBindingRow>`
        SELECT binding_code,
               parent_entity_code,
               child_entity_code,
               binding_kind,
               fk_field,
               source_doc_type_value,
               source_doc_id_field,
               source_line_id_field,
               status,
               description,
               metadata
          FROM control.polymorphic_child_binding
         WHERE binding_code = ${code}
           AND status = 'active'
         LIMIT 1
      `.execute(db);

      const row = result.rows[0];
      if (!row) {
        res.status(404).json({
          error: "BINDING_NOT_FOUND",
          message: `No active binding for code '${code}'.`,
        });
        return;
      }

      res.setHeader("Cache-Control", "private, max-age=300");
      res.json(row);
    } catch (err) {
      logger?.error("document_runtime_binding_route_error", { err: String(err) });
      next(err);
    }
  };

  // ─── Lookup row ─────────────────────────────────────────────────────
  const lookupHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const code = String(req.params.code ?? "").trim();
      if (!code) {
        res.status(400).json({ error: "INVALID_PARAM", message: "lookup code is required" });
        return;
      }

      const result = await sql<DocumentLookupRow>`
        SELECT lookup_code,
               child_entity,
               base_filters,
               status,
               description
          FROM control.document_lookup
         WHERE lookup_code = ${code}
           AND status = 'active'
         LIMIT 1
      `.execute(db);

      const row = result.rows[0];
      if (!row) {
        res.status(404).json({
          error: "LOOKUP_NOT_FOUND",
          message: `No active lookup for code '${code}'.`,
        });
        return;
      }

      res.setHeader("Cache-Control", "private, max-age=300");
      res.json(row);
    } catch (err) {
      logger?.error("document_runtime_lookup_route_error", { err: String(err) });
      next(err);
    }
  };

  // ─── Action-rule projection ────────────────────────────────────────
  const actionRulesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = String(req.params.entityCode ?? "").trim();
      if (!entityCode) {
        res.status(400).json({ error: "INVALID_PARAM", message: "entity code is required" });
        return;
      }

      const result = await sql<EntityActionRuleRow>`
        SELECT entity_code,
               status,
               action_code,
               capability,
               required_permission,
               reason
          FROM control.entity_action_rule
         WHERE entity_code = ${entityCode}
         ORDER BY action_code, status
      `.execute(db);

      res.setHeader("Cache-Control", "private, max-age=60");
      res.json({ entity_code: entityCode, rules: result.rows });
    } catch (err) {
      logger?.error("document_runtime_action_rules_route_error", { err: String(err) });
      next(err);
    }
  };

  // ─── Merged rules (field + action) ──────────────────────────────────
  // Server-side merge that replaces the BFF's two-call composition:
  //   (a) records API for control.entity_field.editable_in_status
  //   (b) /metadata/document-runtime/action-rules for control.entity_action_rule
  // Querying both tables directly avoids the records-API auto-coverage
  // dependency and lets the BFF rules handler collapse to a single fetch.
  //
  // Response shape is byte-equivalent to what the BFF previously emitted,
  // so the BFF passthrough is safe.
  const mergedRulesHandler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = String(req.params.entity ?? "").trim();
      if (!entityCode) {
        res.status(400).json({ error: "INVALID_PARAM", message: "entity code is required" });
        return;
      }

      // Run both queries in parallel.
      const [fieldRows, actionRuleRows] = await Promise.all([
        sql<EntityFieldRuleRow>`
          SELECT ef.name,
                 ef.editability->'editable_in_status' AS editable_in_status
            FROM control.entity_field ef
            JOIN control.entity_version ev ON ev.id = ef.entity_version_id
            JOIN control.entity e          ON e.id  = ev.entity_id
           WHERE e.entity_code = ${entityCode}
             AND ev.status = 'EFFECTIVE'
             AND ef.is_active = true
             AND ef.editability ? 'editable_in_status'
             AND jsonb_array_length(ef.editability->'editable_in_status') > 0
        `.execute(db),
        sql<EntityActionRuleRow>`
          SELECT entity_code,
                 status,
                 action_code,
                 capability,
                 required_permission,
                 reason
            FROM control.entity_action_rule
           WHERE entity_code = ${entityCode}
           ORDER BY action_code, status
        `.execute(db),
      ]);

      const field_rules: MergedRulesResponse["field_rules"] = {};
      for (const row of fieldRows.rows) {
        if (!row.name) continue;
        const raw = row.editable_in_status;
        const statuses: string[] = Array.isArray(raw)
          ? raw.filter((s): s is string => typeof s === "string")
          : [];
        if (statuses.length === 0) continue;
        field_rules[row.name] = { editable_in_status: statuses };
      }

      const action_rules: MergedRulesResponse["action_rules"] = {};
      for (const row of actionRuleRows.rows) {
        if (!row.action_code || !row.status) continue;
        if (row.capability !== "allowed" && row.capability !== "denied" && row.capability !== "requires_permission") continue;
        const bucket = action_rules[row.action_code] ?? {};
        bucket[row.status] = {
          capability:          row.capability,
          required_permission: row.required_permission,
          reason:              row.reason,
        };
        action_rules[row.action_code] = bucket;
      }

      const body: MergedRulesResponse = {
        ok:           true,
        entity:       entityCode,
        field_rules,
        action_rules,
      };
      res.setHeader("Cache-Control", "private, max-age=60");
      res.json(body);
    } catch (err) {
      logger?.error("document_runtime_merged_rules_route_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/runtime/v1/bindings/:code", bindingHandler);
  router.get("/runtime/v1/lookups/:code", lookupHandler);
  router.get("/runtime/v1/entities/:entity/rules", mergedRulesHandler);
  return router;
}
