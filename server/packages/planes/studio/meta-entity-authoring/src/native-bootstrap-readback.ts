import type { ExpandedNativeMetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { canonicalJson } from "./deterministic.js";
/** SQL member collections are sets keyed by ID; semantic positions remain values.
 * PostgreSQL timestamps retain microseconds while JS proposal clocks use milliseconds. */
export function nativeBootstrapReadbackJson(
  graph: ExpandedNativeMetaEntityGraph,
): string {
  type Mutable<T> = T extends readonly (infer U)[]
    ? Mutable<U>[]
    : T extends object
      ? { -readonly [P in keyof T]: Mutable<T[P]> }
      : T;
  const copy = structuredClone(graph) as Mutable<ExpandedNativeMetaEntityGraph>;
  for (const rows of Object.values(copy.referenceMembers?.members ?? {}))
    rows.sort((a, b) => a.id.localeCompare(b.id));
  for (const rows of Object.values(copy.ai))
    rows.sort((a, b) => a.id.localeCompare(b.id));
  copy.ownedLabels?.labels.sort((a, b) => a.id.localeCompare(b.id));
  copy.ownedLabels?.translations.sort((a, b) =>
    canonicalJson(a).localeCompare(canonicalJson(b)),
  );
  copy.fieldIdentities?.sort((a, b) => a.id.localeCompare(b.id));
  for (const identity of copy.fieldIdentities ?? [])
    identity.createdAt = identity.createdAt.replace(
      /\.(\d{1,6})Z$/,
      (_, fraction: string) => "." + fraction.padEnd(6, "0") + "Z",
    );
  return canonicalJson(copy);
}
