import { createHash } from "node:crypto";
import type { CompiledEntityArtifactV2 } from "@athyper/server-contract-publication";
import type { CompiledEntityResolvedRelease } from "./artifact-resolution.js";

/**
 * Browser metadata is a projection of immutable IR, never the IR itself. In
 * particular, storage bindings, policy evaluator input and handler internals do
 * not cross this boundary. The identity deliberately includes every dimension
 * that can alter an authorization or localized presentation decision.
 */
export interface AuthorizedBrowserProjectionCoordinate {
  readonly tenantId: string;
  readonly principalId: string;
  readonly accessEpoch: number;
  readonly contextKey: string;
  readonly locale: string;
  readonly surfaceKey: string;
}

export interface AuthorizedBrowserFieldProjection {
  readonly key: string;
  readonly dataType: string;
  readonly nullable: boolean;
  readonly label?: Readonly<{ readonly labelKey: string; readonly defaultText: string }>;
  readonly uiFacets?: Readonly<Record<string, unknown>>;
}

export interface AuthorizedBrowserSectionProjection {
  readonly key: string;
  readonly label?: Readonly<{ readonly labelKey: string; readonly defaultText: string }>;
  readonly load?: string;
}

export interface AuthorizedBrowserSurfaceProjection {
  readonly schema: "athyper.authorized-browser-entity-projection/1";
  readonly cacheKey: string;
  readonly entityCode: string;
  readonly surfaceKey: string;
  readonly release: Readonly<{ readonly releaseId: string; readonly releaseHash: string }>;
  readonly fields: readonly AuthorizedBrowserFieldProjection[];
  readonly sections: readonly AuthorizedBrowserSectionProjection[];
}

export function authorizedBrowserProjectionCacheKey(
  release: CompiledEntityResolvedRelease,
  coordinate: AuthorizedBrowserProjectionCoordinate,
): string {
  return `entity-browser-projection:${createHash("sha256").update(JSON.stringify({
    tenantId: coordinate.tenantId,
    principalId: coordinate.principalId,
    accessEpoch: coordinate.accessEpoch,
    contextKey: coordinate.contextKey,
    locale: coordinate.locale,
    entityCode: release.coordinate.entityCode,
    surfaceKey: coordinate.surfaceKey,
    releaseId: release.release.releaseId,
    releaseHash: release.release.releaseHash,
  })).digest("hex")}`;
}

export function projectAuthorizedBrowserSurface(input: {
  readonly release: CompiledEntityResolvedRelease;
  readonly core: CompiledEntityArtifactV2;
  readonly surface: CompiledEntityArtifactV2;
  readonly coordinate: AuthorizedBrowserProjectionCoordinate;
  /** Already-authorized field/section keys. Permission checks remain server owned. */
  readonly allowedFieldKeys: ReadonlySet<string>;
  readonly allowedSectionKeys: ReadonlySet<string>;
}): AuthorizedBrowserSurfaceProjection {
  if (input.core.artifactType !== "core" || input.surface.artifactType !== "presentation_surface")
    throw new TypeError("AUTHORIZED_BROWSER_PROJECTION_ARTIFACT_TYPE_INVALID");
  const fields = array(input.core.content.fields)
    .filter(record)
    .filter((field) => typeof field.key === "string" && input.allowedFieldKeys.has(field.key))
    .map((field) => Object.freeze({
      key: String(field.key),
      dataType: typeof field.dataType === "string" ? field.dataType : "string",
      nullable: field.nullable === true,
      ...(localized(field.label) ? { label: localized(field.label) } : {}),
      ...(record(field.uiFacets) ? { uiFacets: Object.freeze({ ...field.uiFacets }) } : {}),
    }));
  const sections = array(input.surface.content.sections)
    .filter(record)
    .filter((section) => typeof section.sectionKey === "string" && input.allowedSectionKeys.has(section.sectionKey))
    .map((section) => Object.freeze({
      key: String(section.sectionKey),
      ...(localized(section.label) ? { label: localized(section.label) } : {}),
      ...(typeof section.load === "string" ? { load: section.load } : {}),
    }));
  return Object.freeze({
    schema: "athyper.authorized-browser-entity-projection/1",
    cacheKey: authorizedBrowserProjectionCacheKey(input.release, input.coordinate),
    entityCode: input.release.coordinate.entityCode,
    surfaceKey: input.coordinate.surfaceKey,
    release: Object.freeze({ releaseId: input.release.release.releaseId, releaseHash: input.release.release.releaseHash }),
    fields: Object.freeze(fields),
    sections: Object.freeze(sections),
  });
}

function array(value: unknown): readonly unknown[] { return Array.isArray(value) ? value : []; }
function record(value: unknown): value is Readonly<Record<string, unknown>> { return !!value && typeof value === "object" && !Array.isArray(value); }
function localized(value: unknown): Readonly<{ readonly labelKey: string; readonly defaultText: string }> | undefined {
  if (!record(value) || typeof value.labelKey !== "string" || typeof value.defaultText !== "string") return undefined;
  return Object.freeze({ labelKey: value.labelKey, defaultText: value.defaultText });
}
