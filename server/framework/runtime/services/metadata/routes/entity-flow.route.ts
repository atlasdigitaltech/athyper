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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textConfig(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function referenceTargetEntity(row: {
  reference_config?: unknown;
  validation?: unknown;
}): string | null {
  const rawConfig = asRecord(row.reference_config);
  const validation = asRecord(row.validation);
  return textConfig(rawConfig?.["target_entity"])
    ?? textConfig(rawConfig?.["ref_entity"])
    ?? textConfig(validation?.["ref_entity"])
    ?? textConfig(validation?.["ref_hint"]);
}

const VALIDATION_REFERENCE_KEYS = new Set([
  "ref_entity",
  "ref_hint",
  "target_field",
  "display_field",
  "picker",
  "label_field",
  "code_field",
  "description_field",
  "navigation_field",
  "record_id_field",
  "show_code",
  "show_description",
  "show_view_action",
]);

function normalizeValidationRules(value: unknown): Record<string, unknown> | null {
  const validation = asRecord(value);
  if (!validation) return null;
  const entries = Object.entries(validation)
    .filter(([key, item]) => !VALIDATION_REFERENCE_KEYS.has(key) && item !== undefined && item !== null);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function mergeReferencePickerProfile(
  referenceConfig: Record<string, unknown>,
  referencePickerProfile?: Record<string, unknown> | null,
): Record<string, unknown> {
  const pickerOverride = asRecord(referenceConfig["picker"]);
  const displayField = textConfig(referenceConfig["display_field"]);
  const topLevelPickerOverrides = Object.fromEntries(Object.entries({
    label_field: referenceConfig["label_field"] ?? displayField ?? undefined,
    code_field: referenceConfig["code_field"],
    description_field: referenceConfig["description_field"],
    navigation_field: referenceConfig["navigation_field"] ?? referenceConfig["record_id_field"],
    show_code: referenceConfig["show_code"],
    show_description: referenceConfig["show_description"],
    show_view_action: referenceConfig["show_view_action"],
  }).filter(([, value]) => value !== undefined));
  const mergedPicker = Object.fromEntries(
    Object.entries({
      ...(referencePickerProfile ?? {}),
      ...topLevelPickerOverrides,
      ...(pickerOverride ?? {}),
    }).filter(([, value]) => value !== undefined),
  );
  const picker = Object.keys(mergedPicker).length > 0 ? mergedPicker : undefined;

  return Object.fromEntries(Object.entries({
    ...referenceConfig,
    target_field: referenceConfig["target_field"] ?? "id",
    display_field: referenceConfig["display_field"]
      ?? referenceConfig["label_field"]
      ?? picker?.["label_field"],
    picker,
  }).filter(([, value]) => value !== undefined));
}

function normalizeReferenceConfig(row: {
  reference_config?: unknown;
  validation?: unknown;
}, referencePickerProfiles?: Map<string, Record<string, unknown>>): Record<string, unknown> | null {
  const targetEntity = referenceTargetEntity(row);
  const referencePickerProfile = targetEntity ? referencePickerProfiles?.get(targetEntity) : undefined;

  if (row.reference_config && typeof row.reference_config === "object" && !Array.isArray(row.reference_config)) {
    const rawConfig = row.reference_config as Record<string, unknown>;
    const normalized = Object.fromEntries(Object.entries({
      ...rawConfig,
      target_entity: targetEntity ?? "",
      target_field: rawConfig["target_field"],
      display_field: rawConfig["display_field"],
    }).filter(([, value]) => value !== undefined));
    return mergeReferencePickerProfile(normalized, referencePickerProfile);
  }

  if (targetEntity) {
    const validation = asRecord(row.validation);
    const normalized = Object.fromEntries(Object.entries({
      target_entity: targetEntity,
      target_field: validation?.["target_field"],
      display_field: validation?.["display_field"],
    }).filter(([, value]) => value !== undefined));
    return mergeReferencePickerProfile(normalized, referencePickerProfile);
  }

  return null;
}

async function loadReferencePickerProfiles(
  db: Kysely<any>,
  fieldRows: Array<{ reference_config?: unknown; validation?: unknown }>,
  tenantId: string | null,
): Promise<Map<string, Record<string, unknown>>> {
  const targetEntities = [
    ...new Set(fieldRows.map(referenceTargetEntity).filter((value): value is string => Boolean(value))),
  ];
  const profiles = new Map<string, Record<string, unknown>>();
  if (targetEntities.length === 0) return profiles;

  let query = db
    .selectFrom("control.entity as e")
    .select(["e.name", "e.entity_code", "e.display_config"])
    .where((eb: any) => eb.or([
      eb("e.name", "in", targetEntities),
      eb("e.entity_code", "in", targetEntities),
    ]))
    .where("e.is_active", "=", true);

  if (tenantId) {
    query = query
      .where((eb: any) => eb.or([eb("e.tenant_id", "=", tenantId), eb("e.tenant_id", "is", null)]))
      .orderBy(sql`e.tenant_id NULLS LAST`);
  } else {
    query = query.where("e.tenant_id", "is", null);
  }

  const rows = await query.execute();
  for (const row of rows) {
    const displayConfig = asRecord(row.display_config);
    const referencePicker = asRecord(displayConfig?.["reference_picker"]);
    if (!referencePicker) continue;

    const names = [row.name, row.entity_code].filter((value): value is string => Boolean(value));
    for (const name of names) {
      if (!profiles.has(name)) profiles.set(name, referencePicker);
    }
  }

  return profiles;
}

function mergeProfileMaps(
  target: Map<string, Record<string, unknown>>,
  source: Map<string, Record<string, unknown>>,
): void {
  for (const [key, value] of source) {
    if (!target.has(key)) target.set(key, value);
  }
}

export function createEntityFlowRoute(router: Router, deps: EntityFlowRoutesDeps): Router {
  const { db, auth, logger, checkPermissionBatch } = deps;

  const handler: RequestHandler = async (req, res, next) => {
    try {
      // ── Auth ──────────────────────────────────────────────────────────────
      const claims = await verifyBearer(req.headers.authorization ?? "", auth, res);
      if (!claims) return;

      // ── Params ────────────────────────────────────────────────────────────
      const entityCode   = (req.params["entity"] as string).replace(/-/g, "_");
      const trigger      = (req.query["trigger"]   as string | undefined) ?? "new";
      const flowCodeParam = req.query["flow_code"] as string | undefined;

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

      // ── Active flow for this entity version ───────────────────────────────
      // When flow_code is supplied, fetch that specific flow regardless of
      // is_default or trigger_context (flow_code already uniquely identifies
      // the bundle — the trigger filter only applies to default-flow discovery).
      // When absent, fall back to the tenant's default flow for the trigger context.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let flowQuery: any = db
        .selectFrom("control.entity_flow as ef")
        .select(["ef.id", "ef.flow_code", "ef.label", "ef.description", "ef.config"])
        .where("ef.entity_version_id", "=", entityRow.version_id as string)
        .where("ef.status", "=", "active");

      if (flowCodeParam) {
        flowQuery = flowQuery.where("ef.flow_code", "=", flowCodeParam);
      } else {
        flowQuery = flowQuery
          .where("ef.trigger_context", "=", trigger)
          .where("ef.is_default", "=", true);
      }

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
          message: flowCodeParam
            ? `No active flow '${flowCodeParam}' for entity '${entityCode}'`
            : `No active flow for entity '${entityCode}' trigger '${trigger}'`,
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
          "eff.format",
          "eff.span",
          "eff.display_size",
          "eff.help_text",
          "eff.placeholder",
          "eff.sort_order",
          "eff.section_key",
          "ef.name as field_name",
          sql<string>`COALESCE(ef.label, ef.name)`.as("field_label"),
          "ef.data_type",
          "ef.enum_domain_code",
          "ef.ui_type",
          "ef.reference_config",
          "ef.money_config",
          "ef.validation",
          "ef.lookup_config",
        ])
        .where("eff.flow_step_id", "in", stepIds)
        .orderBy("eff.sort_order", "asc")
        .execute();
      const referencePickerProfiles = await loadReferencePickerProfiles(db, fieldRows, tenantId);

      // ── Section descriptors (composite intake) ────────────────────────────
      // Fetched for all steps; empty for standard flows.
      const sectionRows = stepIds.length > 0
        ? await db
            .selectFrom("control.entity_flow_section as efsec")
            .select([
              "efsec.id",
              "efsec.flow_step_id",
              "efsec.section_key",
              "efsec.label",
              "efsec.section_type",
              "efsec.entity_code",
              "efsec.payload_key",
              "efsec.field_codes",
              "efsec.min_rows",
              "efsec.max_rows",
              "efsec.default_row",
              "efsec.permission_code",
              "efsec.restricted_view_only",
              "efsec.visible_when",
              "efsec.sort_order",
              "efsec.collapse_default",
              "efsec.icon_key",
              "efsec.help_text",
            ])
            .where("efsec.flow_step_id", "in", stepIds)
            .orderBy("efsec.sort_order", "asc")
            .execute()
        : [];

      // For repeater/singleton sections, resolve child entity fields from
      // control.entity_field filtered by the section's field_codes list.
      const childEntityCodes = [
        ...new Set(
          sectionRows
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((s: any) => s.entity_code && (s.section_type === "repeater" || s.section_type === "singleton"))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((s: any) => String(s.entity_code)),
        ),
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const childFieldsByEntity = new Map<string, any[]>();
      if (childEntityCodes.length > 0) {
        for (const code of childEntityCodes) {
          const rows = await db
            .selectFrom("control.entity_field as ef")
            .innerJoin("control.entity_version as ev", "ev.id", "ef.entity_version_id")
            .innerJoin("control.entity as e", "e.id", "ev.entity_id")
            .select([
              "ef.id as entity_field_id",
              "ef.name as field_name",
              sql<string>`COALESCE(ef.label, ef.name)`.as("field_label"),
              "ef.data_type",
              "ef.enum_domain_code",
              "ef.cardinality",
              sql<string | null>`ef.ui_type`.as("ui_variant"),
              "ef.reference_config",
              "ef.money_config",
              "ef.validation",
              "ef.visibility",
              "ef.lookup_config",
              "ef.sort_order",
              "ef.is_required",
            ])
            .where(sql`COALESCE(e.entity_code, e.name)`, "=", code)
            .where("e.tenant_id", "is", null)
            .where("ev.status", "=", "EFFECTIVE")
            .where("ef.is_active", "=", true)
            .orderBy("ef.sort_order", "asc")
            .execute();
          mergeProfileMaps(referencePickerProfiles, await loadReferencePickerProfiles(db, rows, tenantId));
          childFieldsByEntity.set(code, rows);
        }
      }

      // ── User override permissions ─────────────────────────────────────────
      // Only evaluate the permission codes actually referenced by this flow.
      const sub = typeof claims.sub === "string" ? claims.sub : "";
      let userPermissions: string[] = [];

      if (sub && tenantId) {
        try {
          const principalId = await resolvePrincipalIdWithJit(db, sub, tenantId, claims);

          const permissionCodes = [
            ...new Set(
              [
                ...fieldRows
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .map((f: any) => f.override_permission as string | null),
                ...sectionRows
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .map((s: any) => s.permission_code as string | null),
              ].filter((c): c is string => Boolean(c)),
            ),
          ];

          if (permissionCodes.length > 0 && checkPermissionBatch) {
            const personaRow = await db
              .selectFrom("master.principal_persona as pp")
              .select(["pp.persona_id"])
              .where("pp.tenant_id", "=", tenantId)
              .where("pp.principal_id", "=", principalId)
              .executeTakeFirst();
            const personaId: string =
              (personaRow?.persona_id as string | undefined) ?? "00000000-0000-0000-0000-000000000000";

            const batch = await checkPermissionBatch(db, tenantId, principalId, personaId);
            userPermissions = permissionCodes.filter((code) => batch[code]?.decision === "allow");
          }
        } catch (permErr) {
          logger?.warn("entity_flow_permissions_resolve_failed", { entityCode, sub, err: String(permErr) });
          // Fail-open: no overrides but the flow still renders
        }
      }

      // ── Assemble FlowBundle ───────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const steps = stepRows.map((s: any) => {
        // Flat field bindings for this step (legacy FlowWizard path)
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
            enum_domain_code: (f.enum_domain_code ?? null) as string | null,
            reference_config: normalizeReferenceConfig(f, referencePickerProfiles),
            money_config: f.money_config && typeof f.money_config === "object"
              ? f.money_config as Record<string, unknown>
              : null,
            validation_rules: normalizeValidationRules(f.validation),
            lookup_config: (f.lookup_config && typeof f.lookup_config === "object"
              ? f.lookup_config as Record<string, unknown>
              : null),
            mode: f.mode as string,
            derivation_mode: (f.derivation_mode ?? null) as string | null,
            visible_when: f.visible_when ?? null,
            required_when: f.required_when ?? null,
            default_source: (f.default_source ?? null) as string | null,
            derive_expression: (f.derive_expression ?? null) as string | null,
            override_permission: (f.override_permission ?? null) as string | null,
            summary_role: (f.summary_role ?? null) as string | null,
            ui_variant: ((f.ui_type === "country" ? "country" : f.ui_variant) ?? null) as string | null,
            format: (f.format ?? null) as string | null,
            span: (Number(f.span) || 1) as 1 | 2 | 3,
            display_size: (f.display_size ?? null) as string | null,
            help_text: (f.help_text ?? null) as string | null,
            placeholder: (f.placeholder ?? null) as string | null,
            sort_order: Number(f.sort_order ?? 0),
            section_key: (f.section_key ?? null) as string | null,
            is_overridden: false,
          }));

        const advanceRule =
          s.advance_rule && typeof s.advance_rule === "object"
            ? (s.advance_rule as Record<string, unknown>)
            : {};

        // Build sections for this step (composite intake path)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stepSections = sectionRows
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((sec: any) => sec.flow_step_id === s.id)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((sec: any) => {
            const sType = String(sec.section_type ?? "fields");
            const sKey  = String(sec.section_key);

            // For "fields" sections: include matching flat field bindings
            const sectionFields = sType === "fields"
              ? stepFields.filter((f) => (f as unknown as Record<string, unknown>)["section_key"] === sKey)
              : [];

            // For "repeater"/"singleton": resolve child entity fields from the
            // pre-fetched childFieldsByEntity map, filtered by field_codes list
            const rawFieldCodes = Array.isArray(sec.field_codes) ? sec.field_codes as string[] : [];
            const childEntityCode = sec.entity_code ? String(sec.entity_code) : null;
            let childFields: unknown[] = [];

            if ((sType === "repeater" || sType === "singleton") && childEntityCode) {
              const allChildFields = childFieldsByEntity.get(childEntityCode) ?? [];
              const selectedChildFields = rawFieldCodes.length > 0
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ? allChildFields.filter((cf: any) => rawFieldCodes.includes(String(cf.field_name)))
                : allChildFields;
              childFields = selectedChildFields.map((cf) => ({
                ...cf,
                reference_config: normalizeReferenceConfig(cf, referencePickerProfiles),
                money_config: cf.money_config && typeof cf.money_config === "object"
                  ? cf.money_config as Record<string, unknown>
                  : null,
                visible_when: cf.visibility ?? null,
                validation_rules: normalizeValidationRules(cf.validation),
                lookup_config: cf.lookup_config && typeof cf.lookup_config === "object"
                  ? cf.lookup_config as Record<string, unknown>
                  : null,
              }));
            }

            return {
              section_key:          sKey,
              label:                String(sec.label),
              section_type:         sType,
              entity_code:          childEntityCode,
              payload_key:          sec.payload_key ? String(sec.payload_key) : null,
              sort_order:           Number(sec.sort_order ?? 0),
              collapse_default:     Boolean(sec.collapse_default ?? false),
              visible_when:         sec.visible_when ?? null,
              permission_code:      sec.permission_code ? String(sec.permission_code) : null,
              restricted_view_only: Boolean(sec.restricted_view_only ?? false),
              min_rows:             sec.min_rows != null ? Number(sec.min_rows) : null,
              max_rows:             sec.max_rows != null ? Number(sec.max_rows) : null,
              default_row:          sec.default_row ?? null,
              icon_key:             sec.icon_key ? String(sec.icon_key) : null,
              help_text:            sec.help_text ? String(sec.help_text) : null,
              fields:               sectionFields,
              child_fields:         childFields,
              // field_codes exposed as intake_fields so InvoiceIntakeLinesGrid
              // knows which columns to render in the inline grid.
              intake_fields:        rawFieldCodes.length > 0 ? rawFieldCodes : null,
            };
          });

        return {
          id: s.id as string,
          step_key: s.step_key as string,
          label: s.label as string,
          icon_key: (s.icon_key ?? null) as string | null,
          sort_order: Number(s.sort_order),
          skip_when: s.skip_when ?? null,
          advance_rule: {
            ...advanceRule,
            required_fields: Array.isArray(advanceRule["required_fields"])
              ? (advanceRule["required_fields"] as string[])
              : [],
            predicate: advanceRule["predicate"] ?? null,
          },
          layout_hint: (s.layout_hint ?? "two_column") as string,
          fields: stepFields,
          sections: stepSections,
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
        description: (flowRow.description ?? null) as string | null,
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
