import { randomUUID } from "node:crypto";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";

/** Fork row identities and their references without changing external dependency IDs. */
export function cloneGraphIds(graph: MetaEntityGraph): MetaEntityGraph {
  const ids = new Map<string, string>();
  for (const [name, branch] of Object.entries(graph))
    if (name !== "classProfiles" && Array.isArray(branch))
      for (const row of branch)
        if (row && typeof row.id === "string") ids.set(row.id, randomUUID());
  const clone = (value: unknown): unknown =>
    typeof value === "string"
      ? (ids.get(value) ?? value)
      : Array.isArray(value)
        ? value.map(clone)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value).map(([key, item]) => [key, clone(item)]),
            )
          : value;
  return clone(graph) as MetaEntityGraph;
}
