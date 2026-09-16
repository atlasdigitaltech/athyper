import { createOperation } from "@athyper/platform-api-client";
export type Json = Record<string, unknown>;
export type InspectionSource = "release" | "draft" | "bundle";
export interface Inspection {
  source: InspectionSource;
  id: string;
  version: string;
  status: string;
  changeSetId?: string;
  preview?: Json;
  hash?: string;
  publishedAt?: string;
  createdBy?: string;
  submittedBy?: string;
  reviewedBy?: string;
  approvedBy?: string;
  targets: string[];
  data: Json;
}
export interface Choice {
  id: string;
  label: string;
  source: "release" | "draft";
}
export const record = (value: unknown): Json =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
export const rows = (value: unknown): Json[] =>
  Array.isArray(value) ? value.map(record) : [];
export const display = (value: unknown): string =>
  value === undefined || value === null
    ? "—"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
function required(value: unknown): string {
  if (typeof value !== "string" || !value)
    throw Error("Invalid stored definition response");
  return value;
}
export function parseInspection(
  value: unknown,
  source: InspectionSource,
  id: string,
): Inspection {
  const result = record(value),
    header = record(
      source === "release"
        ? result.release
        : source === "draft"
          ? result.changeSet
          : result,
    );
  if (required(header.id) !== id)
    throw Error("The response does not match the selected definition");
  const data = record(source === "bundle" ? result.bundle : result.graph);
  if (
    source !== "bundle" &&
    record(data.entity).entityCode !== "business_partner"
  )
    throw Error("The selected definition is not Business Partner");
  if (
    source === "bundle" &&
    header.bundleCode !== "business_partner.onboarding"
  )
    throw Error("The selected bundle is not Business Partner onboarding");
  if (!Object.keys(data).length) throw Error("The stored definition is empty");
  return {
    source,
    id,
    createdBy:
      typeof header.createdBy === "string" ? header.createdBy : undefined,
    submittedBy:
      typeof header.submittedBy === "string" ? header.submittedBy : undefined,
    reviewedBy:
      typeof header.reviewedBy === "string" ? header.reviewedBy : undefined,
    approvedBy:
      typeof header.approvedBy === "string" ? header.approvedBy : undefined,
    changeSetId:
      source === "draft"
        ? id
        : typeof header.changeSetId === "string"
          ? header.changeSetId
          : undefined,
    preview: result.preview === undefined ? undefined : record(result.preview),
    data,
    version: display(
      source === "release"
        ? header.releaseNo
        : source === "draft"
          ? header.revision
          : header.semanticVersion,
    ),
    status:
      source === "release"
        ? "Published source release"
        : source === "draft"
          ? required(header.status)
          : "Immutable bundle revision · publication unverified",
    hash:
      typeof header.contractHash === "string"
        ? header.contractHash
        : typeof header.bundleHash === "string"
          ? header.bundleHash
          : undefined,
    publishedAt:
      typeof header.publishedAt === "string" ? header.publishedAt : undefined,
    targets: Array.isArray(header.targetPlanes)
      ? header.targetPlanes.filter((v): v is string => typeof v === "string")
      : [],
  };
}
export const releaseList = createOperation<unknown>({
  method: "GET",
  path: "/meta-entity-authoring/inspection/releases",
});
export const draftList = createOperation<unknown>({
  method: "GET",
  path: "/meta-entity-authoring/change-sets",
});
export function inspectionRead(source: InspectionSource, id: string) {
  const encoded = encodeURIComponent(id);
  return createOperation<Inspection>({
    method: "GET",
    path:
      source === "release"
        ? `/meta-entity-authoring/inspection/releases/${encoded}`
        : source === "draft"
          ? `/meta-entity-authoring/change-sets/${encoded}/graph`
          : `/api/studio/business-partner-definitions/${encoded}`,
    parse: (value) => parseInspection(value, source, id),
  });
}
export function choices(value: unknown, source: "release" | "draft"): Choice[] {
  if (!Array.isArray(value)) throw Error("Invalid definition list");
  return rows(value)
    .filter((r) => r.entityCode === "business_partner")
    .map((r) => ({
      id: required(r.id),
      source,
      label:
        source === "release"
          ? `Published release ${display(r.releaseNo)} · ${display(r.publishedAt)} · ${r.id}`
          : `${display(r.status)} · revision ${display(r.revision)} · ${r.id}`,
    }));
}
export function operationTrace(graph: Json): Json[] {
  return rows(graph.operations).flatMap((operation) => {
    const permissions = rows(graph.operationPermissions).filter(
      (p) => p.entityOperationId === operation.id && operation.id !== undefined,
    );
    const placements = rows(graph.surfaceOperations).filter(
      (p) => p.entityOperationId === operation.id && operation.id !== undefined,
    );
    return (permissions.length ? permissions : [{}]).map((permission) => ({
      operation: operation.operationKey,
      label: operation.label,
      handler: operation.handlerKey,
      plane: permission.targetPlane,
      permission:
        permission.permissionCode ??
        operation.permissionCode ??
        "No permission binding declared",
      surfaces: placements.length
        ? placements
            .map((p) => {
              const surface = rows(graph.surfaces).find(
                (s) => s.id === p.entitySurfaceId,
              );
              return `${display(surface?.surfaceKey ?? p.entitySurfaceId)} / ${display(p.placementKey)}`;
            })
            .join(", ")
        : "Headless / no placement declared",
      scopes: rows(graph.operationScopeBindings).filter(
        (s) =>
          operation.id !== undefined &&
          s.entityOperationId === operation.id &&
          (!permission.targetPlane || s.targetPlane === permission.targetPlane),
      ),
      status: permission.status ?? operation.status,
    }));
  });
}
