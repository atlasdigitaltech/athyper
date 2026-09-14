import { createOperation } from "@athyper/platform-api-client";
export interface ChangeSet {
  id: string;
  entityCode: string;
  title: string;
  revision: number;
  status: string;
}
export interface Preview {
  state: string;
  changeSetId: string;
  savedRevision: number;
  activeRevision?: number;
  activeChangeSetId?: string;
  error?: string;
}
export interface Loaded {
  changeSet: ChangeSet;
  graph: Record<string, unknown>;
  preview?: Preview;
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid graph response");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw Error("Invalid graph response text");
  return value;
}
function revision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw Error("Invalid graph revision");
  return value;
}
export function changeSet(value: unknown): ChangeSet {
  const row = object(value);
  const status = text(row.status);
  if (
    ![
      "draft",
      "in_review",
      "approved",
      "rejected",
      "abandoned",
      "published",
    ].includes(status)
  )
    throw Error("Invalid change set status");
  return {
    id: text(row.id),
    entityCode: text(row.entityCode),
    title: row.title === undefined ? text(row.entityCode) : text(row.title),
    revision: revision(row.revision),
    status,
  };
}
export function preview(value: unknown): Preview {
  const row = object(value);
  return {
    state: text(row.state),
    changeSetId: text(row.changeSetId),
    savedRevision: revision(row.savedRevision),
    ...(row.activeRevision !== undefined
      ? { activeRevision: revision(row.activeRevision) }
      : {}),
    ...(row.activeChangeSetId !== undefined
      ? { activeChangeSetId: text(row.activeChangeSetId) }
      : {}),
    ...(row.error !== undefined ? { error: text(row.error) } : {}),
  };
}
export function loaded(value: unknown): Loaded {
  const row = object(value);
  return {
    changeSet: changeSet(row.changeSet),
    graph: object(row.graph),
    ...(row.preview !== undefined ? { preview: preview(row.preview) } : {}),
  };
}
export const list = createOperation<ChangeSet[]>({
  method: "GET",
  path: "/meta-entity-authoring/change-sets",
  parse: (value) => {
    if (!Array.isArray(value)) throw Error("Invalid change set list");
    return value.map(changeSet);
  },
});
export const read = createOperation<Loaded>({
  method: "GET",
  path: ({ id }) =>
    `/meta-entity-authoring/change-sets/${encodeURIComponent(id)}/graph`,
  parse: loaded,
});
export const fork = createOperation<ChangeSet>({
  method: "POST",
  path: ({ id }) =>
    `/meta-entity-authoring/change-sets/${encodeURIComponent(id)}/fork`,
  parse: changeSet,
});
export const save = createOperation<
  ChangeSet & { preview?: Preview },
  Record<string, unknown>
>({
  method: "PUT",
  path: ({ id }) =>
    `/meta-entity-authoring/change-sets/${encodeURIComponent(id)}/graph`,
  parse: (value) => {
    const row = object(value);
    return {
      ...changeSet(row),
      ...(row.preview !== undefined ? { preview: preview(row.preview) } : {}),
    };
  },
});
