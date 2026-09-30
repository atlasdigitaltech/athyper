import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";

/** Native rows load in UUID order. Keep positional contract assertions attached
 * to the same row when authoring input order differs from database readback. */
export function normalizeGraphStorageOrder(
  graph: MetaEntityGraph,
): MetaEntityGraph {
  const branches = new Map<string, readonly { id: string }[]>();
  const normalized: Record<string, unknown> = { ...graph };
  for (const [name, rows] of Object.entries(graph)) {
    if (
      name === "classProfiles" ||
      name === "tests" ||
      !Array.isArray(rows) ||
      !rows.length ||
      !rows.every((row) => row && typeof row.id === "string")
    )
      continue;
    const sorted = [...rows].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    branches.set(name, sorted);
    normalized[name] = sorted;
  }
  if (graph.tests)
    normalized.tests = graph.tests.map((test) => {
      const match = /^([a-zA-Z]+)\.(\d+)(\..*)?$/.exec(test.path);
      if (!match || !branches.has(match[1]!)) return test;
      const original = Reflect.get(graph, match[1]!) as readonly {
        id: string;
      }[];
      const target = original[Number(match[2])];
      if (!target) return test; // Preserve invalid assertions as failures.
      const index = branches
        .get(match[1]!)!
        .findIndex((row) => row.id === target.id);
      return { ...test, path: `${match[1]}.${index}${match[3] ?? ""}` };
    });
  return normalized as unknown as MetaEntityGraph;
}
