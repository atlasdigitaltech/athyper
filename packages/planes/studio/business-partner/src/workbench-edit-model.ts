import { createOperation } from "@athyper/platform-api-client";
import { record, type Json } from "./workbench-model";
export type EditableCollection =
  "surfaces" | "surfaceSections" | "surfaceFieldBindings";
export const editableProperties: Record<EditableCollection, readonly string[]> =
  {
    surfaces: ["title", "description"],
    surfaceSections: ["title", "description", "columnCount"],
    surfaceFieldBindings: [
      "labelOverride",
      "helpText",
      "placeholder",
      "columnSpan",
    ],
  };
/** Copy only an allowlisted leaf. Preserve bindings, IDs, policies, rules and unknown siblings. */
export function editProperty(
  graph: Json,
  collection: EditableCollection,
  index: number,
  key: string,
  value: string | number,
): Json {
  if (!editableProperties[collection].includes(key))
    throw Error("This property is not supported by focused editing");
  const members = graph[collection];
  if (
    !Array.isArray(members) ||
    !members[index] ||
    typeof members[index] !== "object"
  )
    throw Error("Stored member is unavailable");
  if (
    typeof value === "number" &&
    (!Number.isInteger(value) || value < 1 || value > 12)
  )
    throw Error("Layout columns must be an integer from 1 to 12");
  if (
    typeof value === "string" &&
    (value.length > 2000 || (key === "title" && !value.trim()))
  )
    throw Error("Enter a title or text up to 2,000 characters");
  return {
    ...graph,
    [collection]: members.map((member, i) =>
      i === index ? { ...record(member), [key]: value } : member,
    ),
  };
}
export interface Difference {
  path: string;
  before: unknown;
  after: unknown;
}
// Compare keyed collections independently of storage ordering; position remains an explicit leaf.
function stable(value: unknown): unknown {
  if (Array.isArray(value)) {
    const result = value.map(stable);
    return result.every((v) => typeof record(v).id === "string")
      ? result.sort((a, b) =>
          String(record(a).id).localeCompare(String(record(b).id)),
        )
      : result;
  }
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(record(value))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  return value;
}
export function differences(
  before: unknown,
  after: unknown,
  path = "",
): Difference[] {
  // Native contract test rows have stable keys; storage regenerates their row IDs.
  if (
    path === "tests" &&
    Array.isArray(before) &&
    Array.isArray(after) &&
    [...before, ...after].every((v) => typeof record(v).key === "string") &&
    new Set(before.map((v) => record(v).key)).size === before.length &&
    new Set(after.map((v) => record(v).key)).size === after.length
  ) {
    return differences(
      Object.fromEntries(before.map((v) => [String(record(v).key), v])),
      Object.fromEntries(after.map((v) => [String(record(v).key), v])),
      path,
    );
  }
  if (JSON.stringify(stable(before)) === JSON.stringify(stable(after)))
    return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const a = record(before),
      b = record(after);
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((key) =>
      differences(a[key], b[key], path ? `${path}.${key}` : key),
    );
  }
  if (
    Array.isArray(before) &&
    Array.isArray(after) &&
    before.length === after.length
  ) {
    const a = stable(before) as unknown[],
      b = stable(after) as unknown[];
    return a.flatMap((value, i) =>
      differences(value, b[i], `${path}[${String(record(value).id ?? i)}]`),
    );
  }
  return [{ path, before, after }];
}
export const forkWorkingDraft = (id: string) =>
  createOperation<Json>({
    method: "POST",
    path: `/meta-entity-authoring/change-sets/${encodeURIComponent(id)}/fork`,
  });
export const saveWorkingDraft = (id: string) =>
  createOperation<Json, Json>({
    method: "PUT",
    path: `/meta-entity-authoring/change-sets/${encodeURIComponent(id)}/graph`,
  });
