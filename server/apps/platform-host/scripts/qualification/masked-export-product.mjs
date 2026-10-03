import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** Qualification-only product derived from the actual Principal graph. It uses
 * the standard provider and routes, a distinct publication key and no new grants. */
export function maskedExportProduct(
  root,
  entityCode = "principal_disclosure_probe",
) {
  const product = JSON.parse(
    readFileSync(
      `${root}/metadata/entities/principal/definition.json`,
      "utf8",
    ),
  );
  const ids = new Map();
  const id = (key) => {
    const hex = createHash("sha256")
      .update(`${entityCode}:${key}`)
      .digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };
  const visit = (value) => {
    if (typeof value === "string") {
      if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(value)) {
        if (!ids.has(value)) ids.set(value, id(value));
        return ids.get(value);
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, visit(child)]),
    );
  };
  product.definition = visit(product.definition);
  const graph = product.definition;
  graph.entity.entityCode = entityCode;
  for (const binding of graph.operationPermissions) {
    binding.permissionCode = `studio.foundation.${entityCode}.read`;
    binding.permissionKind = "entity_operation";
  }
  // A probe owns no fixture identity or other Principal dependents.
  for (const surface of graph.surfaces ?? []) {
    const layout = surface.layoutConfig;
    if (!layout) continue;
    if (layout.recordPresentation) {
      layout.recordPresentation.sections =
        layout.recordPresentation.sections.filter((s) => !s.relationshipKey);
      delete layout.recordPresentation.navigation;
      delete layout.recordPresentation.entityRelationships;
    }
    if (layout.authorization) {
      const profile = layout.authorization;
      profile.entityCode = entityCode;
      for (const operation of profile.operations)
        operation.permissionCode = `studio.foundation.${entityCode}.read`;
      profile.operations.push({
        key: "export",
        permissionCode: `studio.foundation.${entityCode}.export`,
        scope: "tenant.record.v1",
        target: "collection",
        effect: "read",
        requiresParentRead: false,
        requiresPreflight: false,
      });
      for (const field of profile.fieldPolicies) {
        if (field.fields.includes("name")) {
          field.representation = "masked";
          field.queryUses = [];
        } else if (field.fields.includes("code"))
          field.queryUses = [...new Set([...field.queryUses, "export"])];
      }
    }
    if (layout.authorizationRuntime)
      layout.authorizationRuntime.bindings.push({
        operation: "export",
        handler: "entity.record.export.v1",
        resolver: "tenant.record.v1",
      });
    if (layout.defaultState)
      layout.defaultState.sort = [{ field: "code", direction: "asc" }];
    if (surface.surfaceKind === "list")
      layout.dataOperations = {
        exportFormats: ["csv", "json", "xlsx"],
        exportMaxRecords: 100,
      };
  }
  const operationId = id("export");
  graph.operations.push({
    id: operationId,
    operationKey: "export",
    operationKind: "read",
    label: "Export permitted fields",
    fieldKeys: ["code"],
    auditEventCode: "records.export.requested",
  });
  graph.operationPermissions.push({
    id: id("export-permission"),
    entityOperationId: operationId,
    targetPlane: "studio",
    permissionCode: `studio.foundation.${entityCode}.export`,
    permissionKind: "entity_operation",
  });
  graph.operationScopeBindings.push({
    id: id("export-scope"),
    entityOperationId: operationId,
    bindingKey: "export_tenant",
    targetPlane: "studio",
    decisionMode: "collection",
    scopeKind: "tenant",
    coordinateSource: "tenant_context",
    missingValueBehavior: "deny",
  });
  return product;
}
