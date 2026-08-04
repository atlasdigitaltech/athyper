/**
 * Per-Record Lifecycle Route
 *
 *   GET /api/records/:entity/:id/lifecycle
 *
 * Returns the canonical lifecycle state progression for a specific record,
 * enriched with transition history from log.entity_lifecycle_log.
 *
 * Data sources:
 *   control.entity_lifecycle + control.lifecycle_state  — canonical state order
 *   log.entity_lifecycle_log                            — transition history
 *   master.principal_profile                            — actor display names
 *
 * Response shape:
 *   {
 *     data: {
 *       lifecycle_code:  string | null,
 *       states:          string[],          // canonical codes in order
 *       terminal_states: string[],
 *       current_state:   string | null,
 *       steps: [{ state, label, status, entered_at, actor_name }],
 *       transitions: [{ from_status, to_status, transitioned_at, operation_code, actor_name, remarks }],
 *     }
 *   }
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { requireVerifiedContext } from "@athyper/svc-iam";
import { normalizeLifecycleStateCode } from "@athyper/svc-workflow";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

export interface LifecycleRouteDeps {
  db:   AnyDb;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event:  string, fields?: Record<string, unknown>): void;
  };
}

interface StateRow {
  code:           string;
  state_name:     string;
  is_terminal:    boolean;
  sort_order:     number;
  lifecycle_code: string;
}

interface TransitionRow {
  from_status:     string | null;
  to_status:       string;
  operation_code:  string | null;
  remarks:         string | null;
  transitioned_at: string;
  actor_id:        string | null;
}

interface ActorRow {
  principal_id: string;
  display_name: string | null;
}

interface CurrentLifecycleRow {
  current_state: string;
}

export function createLifecycleRoute(router: Router, deps: LifecycleRouteDeps): Router {
  const { db, logger } = deps;

  const handler: RequestHandler = async (req, res, next) => {
    try {
      const { tenantId } = requireVerifiedContext(req, res);

      const entityCode = (req.params["entity"] as string).replace(/-/g, "_").toLowerCase();
      const recordId   = String(req.params["id"] ?? "");

      if (!recordId || recordId.length > 256) {
        res.status(400).json({ error: "INVALID_ID", message: "Record id must be a non-empty key of at most 256 characters" });
        return;
      }

      const runtimeEntity = await (db as any)
        .selectFrom("control.entity as e")
        .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
        .select(["e.id"])
        .where("e.name", "=", entityCode)
        .where("e.tenant_id", "is", null)
        .where("e.runtime_enabled", "=", true)
        .where("e.status", "=", "ACTIVE")
        .where("e.is_active", "=", true)
        .where("e.read_capability", "<>", "none")
        .where("e.primary_key", "is not", null)
        .where("ev.status", "=", "EFFECTIVE")
        .executeTakeFirst();
      if (!runtimeEntity) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' is not runtime eligible.` });
        return;
      }

      // 1. Canonical lifecycle states
      let stateRows: StateRow[] = [];
      try {
        stateRows = await (db as any)
          .selectFrom("control.entity_lifecycle as el")
          .innerJoin("control.lifecycle as lc", "lc.id" as never, "el.lifecycle_id" as never)
          .innerJoin("control.lifecycle_state as ls", "ls.lifecycle_id" as never, "lc.id" as never)
          .select([
            "ls.code",
            "ls.name as state_name",
            "ls.is_terminal",
            "ls.sort_order",
            "lc.code as lifecycle_code",
          ] as never[])
          .where("el.entity_name" as never, "=", entityCode as never)
          .where((eb: any) => eb.or([
            eb("el.tenant_id" as any, "=" as any, tenantId as any),
            eb("el.tenant_id" as any, "is" as any, null as any),
          ]))
          .where("lc.is_active" as never, "=" as never, true as never)
          .orderBy("el.priority" as never, "asc" as never)
          .orderBy("ls.sort_order" as never, "asc" as never)
          .limit(60)
          .execute() as StateRow[];
      } catch (err) {
        logger?.warn("lifecycle_states_query_failed", { entityCode, err: String(err) });
      }

      // 2. Transition history
      let transitionRows: TransitionRow[] = [];
      try {
        transitionRows = await (db as any)
          .selectFrom("log.entity_lifecycle_log as ell")
          .select([
            "ell.from_status",
            "ell.to_status",
            "ell.operation_code",
            "ell.remarks",
            "ell.created_at as transitioned_at",
            "ell.actor_id",
          ] as never[])
          .where("ell.tenant_id"   as never, "=", tenantId   as never)
          .where("ell.entity_type" as never, "=", entityCode as never)
          .where("ell.entity_id"   as never, "=", recordId   as never)
          .orderBy("ell.created_at" as never, "asc" as never)
          .limit(200)
          .execute() as TransitionRow[];
      } catch (err) {
        logger?.warn("lifecycle_transitions_query_failed", { entityCode, recordId, err: String(err) });
      }

      // 3. Current state from authoritative lifecycle instance
      let instanceCurrentState: string | null = null;
      try {
        const current = await (db as any)
          .selectFrom("master.lifecycle_instance as li")
          .innerJoin("control.lifecycle_state as ls", "ls.id" as never, "li.state_id" as never)
          .innerJoin("control.entity_lifecycle as el", "el.lifecycle_id" as never, "li.lifecycle_id" as never)
          .select(["ls.code as current_state"] as never[])
          .where("li.tenant_id" as never, "=", tenantId as never)
          .where("li.entity_name" as never, "=", entityCode as never)
          .where("li.entity_id" as never, "=", recordId as never)
          .where("el.entity_name" as never, "=", entityCode as never)
          .where((eb: any) => eb.or([
            eb("el.tenant_id" as never, "=" as never, tenantId as never),
            eb("el.tenant_id" as never, "is" as never, null as never),
          ]))
          .orderBy("el.priority" as never, "asc" as never)
          .orderBy("el.created_at" as never, "asc" as never)
          .limit(1)
          .executeTakeFirst() as CurrentLifecycleRow | undefined;
        instanceCurrentState = current?.current_state ?? null;
      } catch (err) {
        logger?.warn("lifecycle_instance_current_state_query_failed", { entityCode, recordId, err: String(err) });
      }

      // 4. Enrich actor names from principal_profile
      const actorIds = [...new Set(transitionRows.map((r) => r.actor_id).filter(Boolean))] as string[];
      const actors: ActorRow[] = actorIds.length > 0
        ? await (db as any)
            .selectFrom("master.principal_profile as pp")
            .select(["pp.principal_id", "pp.display_name"] as never[])
            .where("pp.principal_id" as never, "in", actorIds as never)
            .execute() as ActorRow[]
        : [];
      const actorMap = new Map(actors.map((p) => [p.principal_id, p.display_name ?? null]));

      // 5. Build steps
      // Map each state code to when it was first entered (from transition log).
      const stateEnteredAt = new Map<string, { at: string; actorName: string | null }>();
      for (const t of transitionRows) {
        const key = normCode(t.to_status);
        if (!stateEnteredAt.has(key)) {
          stateEnteredAt.set(key, {
            at:        String(t.transitioned_at),
            actorName: t.actor_id ? (actorMap.get(t.actor_id) ?? null) : null,
          });
        }
      }

      // A state is "visited" if it appears as to_status OR from_status in the
      // transition log.  The initial state (e.g. "draft") is set at creation
      // without a logged transition to it, but it always appears as from_status
      // once the record moves forward — so this covers that gap.
      const stateVisited = new Set<string>(stateEnteredAt.keys());
      for (const t of transitionRows) {
        if (t.from_status) stateVisited.add(normCode(t.from_status));
      }

      const currentState = instanceCurrentState ?? transitionRows.at(-1)?.to_status ?? null;
      const currentNorm  = currentState ? normCode(currentState) : null;

      // Step status is driven by actual transition history (visited set), not
      // sort_order position.  This prevents exit-state records from falsely
      // marking every preceding flow state as "completed".
      const steps = stateRows.map((s) => {
        const code  = normCode(s.code);
        const entry = stateEnteredAt.get(code);
        const status: "completed" | "current" | "future" =
          code === currentNorm
            ? "current"
            : stateVisited.has(code)
              ? "completed"
              : "future";
        return {
          state:      s.code,
          label:      s.state_name,
          status,
          entered_at: entry?.at ?? null,
          actor_name: entry?.actorName ?? null,
        };
      });

      // 6. Shape transitions
      const transitions = transitionRows.map((t) => ({
        from_status:     t.from_status ?? null,
        to_status:       t.to_status,
        transitioned_at: String(t.transitioned_at),
        operation_code:  t.operation_code ?? null,
        actor_name:      t.actor_id ? (actorMap.get(t.actor_id) ?? null) : null,
        remarks:         t.remarks ?? null,
      }));

      res.json({
        data: {
          lifecycle_code:  stateRows[0]?.lifecycle_code ?? null,
          states:          stateRows.map((s) => s.code),
          terminal_states: stateRows.filter((s) => s.is_terminal).map((s) => s.code),
          current_state:   currentState,
          steps,
          transitions,
        },
      });
    } catch (err) {
      logger?.error("lifecycle_route_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/records/:entity/:id/lifecycle", handler);
  return router;
}

function normCode(value: string): string {
  return normalizeLifecycleStateCode(value);
}
