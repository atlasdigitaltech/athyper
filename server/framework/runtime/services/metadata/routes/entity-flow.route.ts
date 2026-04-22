/**
 * Metadata Routes — GET /api/metadata/entities/:entity/flow
 *
 * Returns the active FlowBundle for an entity + trigger context.
 * Consumed by the FlowWizard to render the metadata-driven intake experience.
 *
 * 404 when no active flow exists — client falls back to the generic EntityForm.
 *
 * user_permissions is populated with only the override_permission codes
 * referenced by the flow's fields that the requesting user is allowed.
 * Fail-open: permission errors yield an empty array (user gets no overrides
 * but can still complete the flow).
 */

import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  verifyBearer,
  extractOrgHeaders,
  resolveTenantId,
  resolvePrincipalIdWithJit,
} from "@athyper/svc-shared";

export interface EntityFlowRoutesDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  auth: {
    verifyToken(token: string): Promise<Record<string, unknown>>;
  };
  logger?: {
    error(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  checkPermissionBatch?: (db: Kysely<any>, tenantId: string, principalId: string, personaId: string) => Promise<Record<string, { decision: string } | undefined>>;
}

export function createEntityFlowRoute(router: Router, deps: EntityFlowRoutesDeps): Router {
  const { db, auth, logger, checkPermissionBatch } = deps;

  const handler: RequestHandler = async (req, res, next) => {
    try {
      // ── Auth ──────────────────────────────────────────────────────────────
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      // ── Params ────────────────────────────────────────────────────────────
      const entityCode = (req.params["entity"] as string).replace(/-/g, "_");
      const trigger = (req.query["trigger"] as string | undefined) ?? "new";

      // ── Tenant ────────────────────────────────────────────────────────────
      const { xOrg, xRealm } = extractOrgHeaders(req);
      const tenantId = xOrg ? await resolveTenantId(db, xOrg, xRealm) : null;

      // ── Entity version ────────────────────────────────────────────────────
      // Mirror compiled-entity.route: prefer tenant-specific row over platform
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let entityQuery: any = db
        .selectFrom("control.entity as e")
        .innerJoin("control.entity_version as ev", "ev.entity_id", "e.id")
        .select([
          sql<string>`COALESCE(e.entity_code, e.name)`.as("entity_code"),
          sql<string>`ev.id`.as("version_id"),
        ])
        .where(sql`COALESCE(e.entity_code, e.name)`, "=", entityCode)
        .where("ev.status", "=", "EFFECTIVE");

      if (tenantId) {
        entityQuery = entityQuery
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .where((eb: any) => eb.or([eb("e.tenant_id", "=", tenantId), eb("e.tenant_id", "is", null)]))
          .orderBy(sql`e.tenant_id NULLS LAST`);
      } else {
        entityQuery = entityQuery.where("e.tenant_id", "is", null);
      }

      const entityRow = await entityQuery.limit(1).executeTakeFirst();

      if (!entityRow) {
        res.status(404).json({ error: "ENTITY_NOT_FOUND", message: `Entity '${entityCode}' not found` });
        return;
      }

      // ── Active default flow for this entity version + trigger ─────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let flowQuery: any = db
        .selectFrom("control.entity_flow as ef")
        .select(["ef.id", "ef.flow_code", "ef.label", "ef.config"])
        .where("ef.entity_version_id", "=", entityRow.version_id as string)
        .where("ef.trigger_context", "=", trigger)
        .where("ef.is_default", "=", true)
        .where("ef.status", "=", "active");

      if (tenantId) {
        flowQuery = flowQuery
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .where((eb: any) => eb.or([eb("ef.tenant_id", "=", tenantId), eb("ef.tenant_id", "is", null)]))
          .orderBy(sql`ef.tenant_id NULLS LAST`);
      } else {
        flowQuery = flowQuery.where("ef.tenant_id", "is", null);
      }

      const flowRow = await flowQuery.limit(1).executeTakeFirst();

      if (!flowRow) {
        res.status(404).json({
          error: "FLOW_NOT_FOUND",
          message: `No active flow for entity '${entityCode}' trigger '${trigger}'`,
        });
        return;
      }

      // ── Steps ─────────────────────────────────────────────────────────────
      const stepRows = await db
        .selectFrom("control.entity_flow_step as efs")
        .selectAll()
        .where("efs.flow_id", "=", flowRow.id as string)
        .orderBy("efs.sort_order", "asc")
        .execute();

      if (stepRows.length === 0) {
        res.status(404).json({
          error: "FLOW_NOT_FOUND",
          message: `Flow '${String(flowRow.flow_code)}' has no steps`,
        });
        return;
      }

      const stepIds = stepRows.map((s) => s.id as string);

      // ── Field bindings + entity_field name/label/data_type ────────────────
      const fieldRows = await db
        .selectFrom("control.entity_flow_field as eff")
        .innerJoin("control.entity_field as ef", "ef.id", "eff.entity_field_id")
        .select([
          "eff.id",
          "eff.flow_step_id",
          "eff.entity_field_id",
          "eff.mode",
          "eff.derivation_mode",
          "eff.visible_when",
          "eff.required_when",
          "eff.default_source",
          "eff.derive_expression",
          "eff.override_permission",
          "eff.summary_role",
          "eff.ui_variant",
          "eff.span",
          "eff.help_text",
          "eff.placeholder",
          "eff.sort_order",
          "ef.name as field_name",
          sql<string>`COALESCE(ef.label, ef.name)`.as("field_label"),
          "ef.data_type",
        ])
        .where("eff.flow_step_id", "in", stepIds)
        .orderBy("eff.sort_order", "asc")
        .execute();

      // ── User override permissions ─────────────────────────────────────────
      // Only evaluate the permission codes actually referenced by this flow.
      const sub = typeof claims.sub === "string" ? claims.sub : "";
      let userPermissions: string[] = [];

      if (sub && tenantId) {
        try {
          const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, claims);

          const overrideCodes = [
            ...new Set(
              fieldRows
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((f: any) => f.override_permission as string | null)
                .filter((c): c is string => Boolean(c)),
            ),
          ];

          if (overrideCodes.length > 0 && checkPermissionBatch) {
            const personaRow = await db
              .selectFrom("master.principal_persona as pp")
              .select(["pp.persona_id"])
              .where("pp.tenant_id", "=", tenantId)
              .where("pp.principal_id", "=", principalId)
              .executeTakeFirst();
            const personaId: string =
              (personaRow?.persona_id as string | undefined) ?? "00000000-0000-0000-0000-000000000000";

            const batch = await checkPermissionBatch(db, tenantId, principalId, personaId);
            userPermissions = overrideCodes.filter((code) => batch[code]?.decision === "allow");
          }
        } catch (permErr) {
          logger?.warn("entity_flow_permissions_resolve_failed", { entityCode, sub, err: String(permErr) });
          // Fail-open: no overrides but the flow still renders
        }
      }

      // ── Assemble FlowBundle ───────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const steps = stepRows.map((s: any) => {
        const stepFields = fieldRows
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((f: any) => f.flow_step_id === s.id)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((f: any) => ({
            id: f.id as string,
            entity_field_id: f.entity_field_id as string,
            field_name: f.field_name as string,
            field_label: f.field_label as string,
            data_type: f.data_type as string,
            mode: f.mode as string,
            derivation_mode: (f.derivation_mode ?? null) as string | null,
            visible_when: f.visible_when ?? null,
            required_when: f.required_when ?? null,
            default_source: (f.default_source ?? null) as string | null,
            derive_expression: (f.derive_expression ?? null) as string | null,
            override_permission: (f.override_permission ?? null) as string | null,
            summary_role: (f.summary_role ?? null) as string | null,
            ui_variant: (f.ui_variant ?? null) as string | null,
            span: (Number(f.span) || 1) as 1 | 2 | 3,
            help_text: (f.help_text ?? null) as string | null,
            placeholder: (f.placeholder ?? null) as string | null,
            sort_order: Number(f.sort_order ?? 0),
            is_overridden: false,
          }));

        const advanceRule =
          s.advance_rule && typeof s.advance_rule === "object"
            ? (s.advance_rule as Record<string, unknown>)
            : {};

        return {
          id: s.id as string,
          step_key: s.step_key as string,
          label: s.label as string,
          icon_key: (s.icon_key ?? null) as string | null,
          sort_order: Number(s.sort_order),
          skip_when: s.skip_when ?? null,
          advance_rule: {
            required_fields: Array.isArray(advanceRule["required_fields"])
              ? (advanceRule["required_fields"] as string[])
              : [],
            predicate: advanceRule["predicate"] ?? null,
          },
          layout_hint: (s.layout_hint ?? "two_column") as string,
          fields: stepFields,
        };
      });

      const config =
        flowRow.config && typeof flowRow.config === "object"
          ? (flowRow.config as Record<string, unknown>)
          : {};

      res.setHeader("Cache-Control", "private, no-cache");
      res.json({
        flow_id: flowRow.id as string,
        flow_code: flowRow.flow_code as string,
        label: flowRow.label as string,
        config,
        steps,
        user_permissions: userPermissions,
      });
    } catch (err) {
      logger?.error("entity_flow_route_error", { err: String(err) });
      next(err);
    }
  };

  router.get("/metadata/entities/:entity/flow", handler);
  return router;
}
