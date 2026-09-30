import { isCanonicalEntityCode } from "@athyper/contract-platform-entity-runtime";
/** Reviewed declarative selection, not executable code or request coordinates. */
export interface CollectionCompilationBinding {
  readonly schemaVersion: 1;
  readonly entityCode: string;
  readonly planeKey: "studio" | "neon" | "mesh";
  readonly subjectEntityCode: string;
  readonly permissionCode: string;
  readonly detailRouteTemplate: string;
}

export function parseCollectionCompilationBinding(raw: unknown): CollectionCompilationBinding {
  const fail = (): never => { throw new TypeError("DOCUMENT_COLLECTION_COMPILATION_INVALID"); };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail();
  const b = raw as Record<string, unknown>;
  if (Object.keys(b).some(key => !["schemaVersion", "entityCode", "planeKey", "subjectEntityCode", "permissionCode", "detailRouteTemplate"].includes(key)) ||
      b.schemaVersion !== 1 ||
      !isCanonicalEntityCode(b.entityCode) ||
      typeof b.planeKey !== "string" || !["studio", "neon", "mesh"].includes(b.planeKey) ||
      typeof b.subjectEntityCode !== "string" || b.subjectEntityCode.length > 160 ||
      !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(b.subjectEntityCode) ||
      typeof b.permissionCode !== "string" || !/^[a-z][a-z0-9_.-]{1,159}$/.test(b.permissionCode) ||
      b.detailRouteTemplate !== `/app/entity/${b.entityCode}/:recordId`) return fail();
  return Object.freeze({
    schemaVersion: 1, entityCode: b.entityCode, planeKey: b.planeKey as CollectionCompilationBinding["planeKey"],
    subjectEntityCode: b.subjectEntityCode, permissionCode: b.permissionCode,
    detailRouteTemplate: b.detailRouteTemplate as string,
  });
}
