import { createHash } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type { Application, RequestHandler, Response } from "express";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type { EntityApplicationDescriptorV1 } from "@athyper/contract-platform-entity-list";

type Tx = Transaction<Record<string, never>>;
export interface ReferenceHistoryScope {
  planeKey: "neon" | "studio" | "mesh";
  tenantId: string;
  principalId: string;
  sourceKey: string;
  contextKey: string;
}
export interface ReferenceHistoryItem {
  key: string;
  selectedAt: string;
}
export interface ReferenceHistoryStore {
  execute(
    scope: ReferenceHistoryScope,
    command: {
      action: "read" | "select" | "clear";
      key?: string;
      limit: number;
      retentionDays: number;
    },
  ): Promise<ReferenceHistoryItem[]>;
}
export function createReferenceHistoryStore(
  transactions: PlaneTransactionCoordinator<Tx>,
): ReferenceHistoryStore {
  return {
    execute: (scope, command) =>
      transactions.run(scope.planeKey, scope, async (tx) => {
        const { tenantId, principalId, planeKey, sourceKey, contextKey } =
          scope;
        // Serialize one history group, including clear and trimming, across concurrent devices.
        const lock = JSON.stringify([
          tenantId,
          principalId,
          planeKey,
          sourceKey,
          contextKey,
        ]);
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))`.execute(
          tx,
        );
        const where = sql`tenant_id=${tenantId}::uuid AND principal_id=${principalId}::uuid AND plane_key=${planeKey} AND source_key=${sourceKey} AND context_key=${contextKey}`;
        await sql`DELETE FROM master.reference_choice_recent WHERE tenant_id=${tenantId}::uuid AND principal_id=${principalId}::uuid AND expires_at <= now()`.execute(
          tx,
        );
        await sql`DELETE FROM master.reference_choice_recent WHERE ${where} AND last_selected_at<=now()-${command.retentionDays}*interval '1 day'`.execute(
          tx,
        );
        if (command.action === "clear")
          await sql`DELETE FROM master.reference_choice_recent WHERE ${where}`.execute(
            tx,
          );
        if (command.action === "select")
          await sql`INSERT INTO master.reference_choice_recent (tenant_id,principal_id,plane_key,source_key,context_key,reference_key,last_selected_at,expires_at)
      VALUES (${tenantId}::uuid,${principalId}::uuid,${planeKey},${sourceKey},${contextKey},${command.key!},clock_timestamp(),clock_timestamp()+${command.retentionDays}*interval '1 day')
      ON CONFLICT (tenant_id,principal_id,plane_key,source_key,context_key,reference_key)
      DO UPDATE SET last_selected_at=EXCLUDED.last_selected_at,expires_at=EXCLUDED.expires_at`.execute(
            tx,
          );
        await sql`DELETE FROM master.reference_choice_recent WHERE ${where} AND reference_key IN
      (SELECT reference_key FROM master.reference_choice_recent WHERE ${where} ORDER BY last_selected_at DESC,reference_key OFFSET ${command.limit})`.execute(
          tx,
        );
        const rows = await sql<{
          reference_key: string;
          last_selected_at: Date | string;
        }>`SELECT reference_key,last_selected_at FROM master.reference_choice_recent WHERE ${where}
      AND expires_at>now() AND last_selected_at>now()-${command.retentionDays}*interval '1 day'
      ORDER BY last_selected_at DESC,reference_key LIMIT ${command.limit}`.execute(
          tx,
        );
        return rows.rows.map((row) => ({
          key: row.reference_key,
          selectedAt: new Date(row.last_selected_at).toISOString(),
        }));
      }),
  };
}
export function registerReferenceChoiceRoutes(
  app: Application,
  options: {
    authenticate: RequestHandler;
    readContext: (response: Response) => VerifiedRequestContext;
    descriptor: (
      context: VerifiedRequestContext,
      entity: string,
      query: Record<string, unknown>,
    ) => Promise<EntityApplicationDescriptorV1>;
    store: ReferenceHistoryStore;
  },
) {
  const handler: RequestHandler = async (req, res, next) => {
    try {
      const context = options.readContext(res);
      const entity = String(req.params.entityCode),
        surfaceKey = String(req.query.surface ?? ""),
        fieldKey = String(req.query.field ?? "");
      if (
        ![entity, surfaceKey, fieldKey].every((key) =>
          /^[a-z][a-zA-Z0-9_.-]{0,126}$/.test(key),
        )
      )
        throw new TypeError("Invalid reference coordinate");
      const descriptor = await options.descriptor(context, entity, req.query);
      const surface = descriptor.intakeSurfaces?.find(
        (surface) => surface.key === surfaceKey,
      );
      const field = surface?.sections
        .flatMap((section) => section.fields)
        .find((field) => field.key === fieldKey);
      if (
        field?.control !== "input" ||
        field.widget !== "select" ||
        !field.lookup?.sourceKey ||
        !field.lookup.recent?.enabled ||
        field.lookup.recent.persistence !== "server"
      ) {
        res.status(403).json({ message: "Reference history is unavailable" });
        return;
      }
      const policy = field.lookup.recent;
      if (
        policy.scope !== "referenceSource" &&
        descriptor.scope.status !== "ready"
      ) {
        res.status(403).json({ message: "Reference context is unavailable" });
        return;
      }
      const scope: ReferenceHistoryScope = {
        planeKey: context.planeKey,
        tenantId: context.tenantId,
        principalId: context.principalId,
        sourceKey: field.lookup.sourceKey,
        contextKey:
          policy.scope !== "referenceSource"
            ? createHash("sha256")
                .update(descriptor.scope.fingerprint)
                .digest("hex")
            : "",
      };
      const action = req.method === "GET" ? "read" : req.body?.action;
      if (
        !["read", "select", "clear"].includes(action) ||
        (req.method !== "GET" && action === "read")
      )
        throw new TypeError("Invalid reference command");
      const key = action === "select" ? req.body?.key : undefined;
      const allowed = new Set(
        field.lookup.options?.map((option) => option.value) ?? [],
      );
      if (
        action === "select" &&
        (typeof key !== "string" || key.length > 256 || !allowed.has(key))
      ) {
        res.status(422).json({ message: "Reference is unavailable" });
        return;
      }
      const items = await options.store.execute(scope, {
        action,
        key,
        limit: policy.limit,
        retentionDays: policy.retentionDays ?? 90,
      });
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ items: items.filter((item) => allowed.has(item.key)) });
    } catch (error) {
      if (error instanceof TypeError)
        res.status(400).json({ message: error.message });
      else next(error);
    }
  };
  app.get(
    "/api/entity-runtime/:entityCode/reference-history",
    options.authenticate,
    handler,
  );
  app.post(
    "/api/entity-runtime/:entityCode/reference-history",
    options.authenticate,
    handler,
  );
}
