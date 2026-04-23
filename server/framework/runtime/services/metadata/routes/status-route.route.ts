/**
 * Metadata Routes — GET /api/metadata/entities/:entity/status-route
 *
 * Returns the compiled status transition map for the given entity + tenant.
 *
 * Resolution order:
 *   1. snapshot.status_route (compiled cache, O(1)) — used when present
 *   2. Fall-through: build live from control.entity_lifecycle + lifecycle_state
 *      + lifecycle_transition (covers entities whose snapshot hasn't been compiled yet)
 *
 * Returns 404 when no lifecycle is bound to the entity.
 *
 * The payload matches the StatusRoute contract:
 *   { entity_name, initial_state, all_states, terminal_states,
 *     deletable_states, allowed_transitions }
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import {
  verifyBearer,
  resolveTenantId,
  extractOrgHeaders,
} from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface StatusRouteRouteDeps {
  db: AnyDb;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
  };
}

export function createStatusRouteRoute(router: Router, deps: StatusRouteRouteDeps): Router {
  const { db, auth, logger } = deps;

  const handler: RequestHandler = async (req, res, next) => {
    try {
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");

      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = await resolveTenantId(db, xOrg, xRealm);

      if (!tenantId) {
        res.status(404).json({ error: "NOT_FOUND", message: "No tenant context" });
        return;
      }

      // ── 1. Try compiled snapshot ─────────────────────────────────────────────
      const snapshot = await db
        .selectFrom("snapshot.status_route as sr")
        .select(["sr.compiled_json"])
        .where("sr.entity_name" as never, "=", entityCode as never)
        .where("sr.tenant_id"   as never, "=", tenantId  as never)
        .executeTakeFirst();

      if (snapshot) {
        res.json(snapshot.compiled_json);
        return;
      }

      // ── 2. Fall back: build live from control tables ──────────────────────────
      // Find lifecycle bound to this entity (global binding, tenant_id IS NULL)
      const binding = await db
        .selectFrom("control.entity_lifecycle as el")
        .innerJoin("control.lifecycle as lc", "lc.id", "el.lifecycle_id")
        .select(["el.lifecycle_id", "lc.code as lifecycle_code"])
        .where("el.entity_name" as never, "=", entityCode as never)
        .where((eb: any) => eb.or([
          eb("el.tenant_id" as never, "is", null),
          eb("el.tenant_id" as never, "=", tenantId as never),
        ]))
        .where("lc.is_active" as never, "=", true as never)
        .orderBy("el.priority" as never, "desc")
        .executeTakeFirst();

      if (!binding) {
        res.status(404).json({
          error:   "NOT_FOUND",
          message: `No lifecycle bound to entity '${entityCode}'`,
        });
        return;
      }

      const lifecycleId = binding.lifecycle_id as string;

      // Fetch states
      const states = await db
        .selectFrom("control.lifecycle_state as s")
        .select([
          "s.id",
          "s.code",
          "s.name",
          "s.is_initial",
          "s.is_terminal",
          "s.sort_order",
          "s.config",
        ])
        .where("s.lifecycle_id" as never, "=", lifecycleId as never)
        .where((eb: any) => eb.or([
          eb("s.tenant_id" as never, "is", null),
          eb("s.tenant_id" as never, "=", tenantId as never),
        ]))
        .orderBy("s.sort_order" as never, "asc")
        .execute() as { id: string; code: string; name: string; is_initial: boolean; is_terminal: boolean; sort_order: number; config: Record<string, unknown> | null }[];

      // Fetch active transitions
      const transitions = await db
        .selectFrom("control.lifecycle_transition as t")
        .innerJoin("control.lifecycle_state as fs", "fs.id", "t.from_state_id")
        .innerJoin("control.lifecycle_state as ts", "ts.id", "t.to_state_id")
        .select(["fs.code as from_code", "ts.code as to_code"])
        .where("t.lifecycle_id" as never, "=", lifecycleId as never)
        .where("t.is_active"    as never, "=", true as never)
        .execute() as { from_code: string; to_code: string }[];

      // Build allowed_transitions map { from_code: [to_code, ...] }
      const allowedTransitions: Record<string, string[]> = {};
      for (const t of transitions) {
        if (!allowedTransitions[t.from_code]) allowedTransitions[t.from_code] = [];
        allowedTransitions[t.from_code]!.push(t.to_code);
      }

      const initialState = states.find((s) => s.is_initial)?.code ?? states[0]?.code ?? "";

      const statesMap: Record<string, unknown> = {};
      for (const s of states) {
        statesMap[s.code] = {
          name:        s.name,
          is_initial:  s.is_initial,
          is_terminal: s.is_terminal,
          sort_order:  s.sort_order,
          config:      s.config ?? {},
        };
      }

      const payload = {
        entity_name:          entityCode,
        lifecycle_id:         lifecycleId,
        initial_state:        initialState,
        all_states:           states.map((s) => s.code),
        terminal_states:      states.filter((s) => s.is_terminal).map((s) => s.code),
        deletable_states:     states.filter((s) => s.is_initial).map((s) => s.code),
        allowed_transitions:  allowedTransitions,
        states:               statesMap,
      };

      res.json(payload);
    } catch (err) {
      logger?.error("status-route.get.failed", { error: String(err) });
      next(err);
    }
  };

  router.get("/metadata/entities/:entity/status-route", handler);
  return router;
}
