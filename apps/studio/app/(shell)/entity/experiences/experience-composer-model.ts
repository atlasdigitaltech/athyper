import { type ExperienceBlock } from "@athyper/contract-platform-dashboard";
import { createOperation } from "@athyper/platform-api-client";
export const policy = {
  dataSources: new Set(["catalog.summary"]),
  actions: new Set(["catalog.navigate"]),
  extensions: new Set([
    "studio.preview",
    "neon.atlas-welcome",
    "mesh.network-overview",
  ]),
};
export const templates: readonly ExperienceBlock["type"][] = [
  "heading",
  "text",
  "card",
  "chart",
  "shortcut",
  "onboarding",
  "quick-list",
  "number-card",
  "extension",
];
export const saveDraft = createOperation<
  SurfaceRelease,
  {
    readonly targetPlane: "studio" | "neon" | "mesh";
    readonly layer: "tenant";
    readonly definition: unknown;
    readonly expectedContentHash?: string;
  }
>({
  method: "POST",
  path: "/studio/experience-surfaces/drafts",
  parse: release,
  idempotency: "required",
});
export const generateAtlasDraft = createOperation<
  { readonly release: SurfaceRelease },
  {
    readonly targetPlane: "studio" | "neon" | "mesh";
    readonly layer: "tenant";
    readonly surfaceKey: string;
    readonly instruction: string;
    readonly baseDefinition: unknown;
    readonly expectedContentHash?: string;
  }
>({
  method: "POST",
  path: "/studio/experience-surfaces/atlas-drafts",
  parse: atlasDraft,
  idempotency: "required",
});
export const publish = createOperation<SurfaceRelease>({
  method: "POST",
  path: ({ releaseId }) =>
    `/studio/experience-surfaces/${encodeURIComponent(releaseId)}/publish`,
  parse: release,
  idempotency: "required",
});
export const historyOperation = createOperation<{
  readonly releases: readonly SurfaceRelease[];
}>({ method: "GET", path: "/studio/experience-surfaces", parse: history });
export const rollbackOperation = createOperation<SurfaceRelease>({
  method: "POST",
  path: ({ releaseId }) =>
    `/studio/experience-surfaces/${encodeURIComponent(releaseId)}/rollback`,
  parse: release,
  idempotency: "required",
});
export interface SurfaceRelease {
  readonly id: string;
  readonly revision: number;
  readonly status: "draft" | "published" | "retired";
  readonly targetPlane: "studio" | "neon" | "mesh";
  readonly contentHash: string;
  readonly definition: unknown;
}
export function template(
  type: ExperienceBlock["type"],
  index: number,
): ExperienceBlock {
  const id = `${type}.${index}`;
  switch (type) {
    case "heading":
      return { id, type, text: "New section" };
    case "text":
      return { id, type, text: "Add governed content." };
    case "card":
      return { id, type, title: "Card", body: "Add a concise description." };
    case "chart":
      return {
        id,
        type,
        title: "Chart",
        dataSource: "catalog.summary",
        visualization: "bar",
      };
    case "shortcut":
      return {
        id,
        type,
        title: "Shortcut",
        actions: [
          {
            action: "catalog.navigate",
            label: "Open",
            input: { path: "/home" },
          },
        ],
      };
    case "onboarding":
      return {
        id,
        type,
        title: "Onboarding",
        steps: [{ label: "First step" }],
      };
    case "quick-list":
      return { id, type, title: "Quick list", dataSource: "catalog.summary" };
    case "number-card":
      return { id, type, title: "Number card", dataSource: "catalog.summary" };
    case "extension":
      return {
        id,
        type,
        title: "Registered extension",
        extension: "studio.preview",
        config: {},
      };
  }
}
export function label(value: string): string {
  return value
    .replace(/-/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}
export function release(value: unknown): SurfaceRelease {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Surface release is invalid");
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" ||
    typeof item.revision !== "number" ||
    !Number.isInteger(item.revision) ||
    (item.status !== "draft" &&
      item.status !== "published" &&
      item.status !== "retired") ||
    (item.targetPlane !== "studio" &&
      item.targetPlane !== "neon" &&
      item.targetPlane !== "mesh") ||
    typeof item.contentHash !== "string" ||
    !item.definition ||
    typeof item.definition !== "object"
  )
    throw new TypeError("Surface release is invalid");
  return Object.freeze({
    id: item.id,
    revision: item.revision,
    status: item.status,
    targetPlane: item.targetPlane,
    contentHash: item.contentHash,
    definition: item.definition,
  });
}
export function history(value: unknown): {
  readonly releases: readonly SurfaceRelease[];
} {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Array.isArray((value as Record<string, unknown>).releases)
  )
    throw new TypeError("Surface history is invalid");
  return Object.freeze({
    releases: Object.freeze(
      ((value as Record<string, unknown>).releases as unknown[]).map(release),
    ),
  });
}
export function atlasDraft(value: unknown): {
  readonly release: SurfaceRelease;
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Atlas surface draft response is invalid");
  return Object.freeze({
    release: release((value as Record<string, unknown>).release),
  });
}
export function message(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "The experience operation could not be completed.";
}
