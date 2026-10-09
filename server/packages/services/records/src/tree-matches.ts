import type { RecordListResult } from "@athyper/server-contract-records";

// Search with ancestor context (Entity list Tree blueprint sections 5.5 and
// 7.3). Each repository finds the matches and walks their ancestors inside the
// visible set and the scope; this module turns the two row sets into one
// result the same way for every repository.

/** At most this many matches are returned; one more is read to know whether
 * more exist. */
export const LIST_TREE_MATCHES_LIMIT = 500;

export interface TreeMatchRow {
  readonly row: Readonly<Record<string, unknown>>;
  readonly id: string;
  /** The parent identity as stored; internal, never a response field. */
  readonly parent: string | null;
  readonly hasChildren: boolean;
}

/** Places every match: a path that reaches a root is kept; a path stopped by a
 * parent the viewer cannot read is kept with its top row marked
 * `parentOutsideView`; a match whose path is longer than `maxDepth` is not
 * returned and is counted. Matches come first in their own order, then the
 * context rows their kept paths need, each row once. */
export function assembleTreeMatches(input: {
  readonly matches: readonly TreeMatchRow[];
  readonly ancestors: readonly TreeMatchRow[];
  readonly maxDepth: number;
  readonly truncated: boolean;
}): Pick<RecordListResult, "data" | "hasChildren" | "treeRoles" | "parentOutsideView" | "matchesTruncated" | "matchesBeyondDepth"> {
  const byId = new Map<string, TreeMatchRow>();
  for (const item of input.ancestors) byId.set(item.id, item);
  for (const item of input.matches) byId.set(item.id, item);
  const matchIds = new Set(input.matches.map((item) => item.id));
  const kept: TreeMatchRow[] = [];
  const context = new Map<string, TreeMatchRow>();
  const outside = new Set<string>();
  let beyond = 0;
  for (const match of input.matches) {
    const path: TreeMatchRow[] = [match];
    let top = match;
    let placed: "root" | "outside" | "beyond" | undefined;
    while (!placed) {
      if (top.parent === null) placed = path.length > input.maxDepth ? "beyond" : "root";
      else if (path.length >= input.maxDepth) placed = "beyond";
      else {
        const next = byId.get(top.parent);
        if (!next || path.includes(next)) placed = "outside";
        else {
          path.push(next);
          top = next;
        }
      }
    }
    if (placed === "beyond") {
      beyond += 1;
      continue;
    }
    kept.push(match);
    for (const item of path.slice(1)) if (!matchIds.has(item.id)) context.set(item.id, item);
    if (placed === "outside") outside.add(top.id);
  }
  const rows = [...kept, ...context.values()];
  return {
    data: rows.map((item) => item.row),
    hasChildren: rows.map((item) => item.hasChildren),
    treeRoles: rows.map((item) => (matchIds.has(item.id) ? "match" : "context")),
    parentOutsideView: rows.map((item) => outside.has(item.id)),
    ...(input.truncated ? { matchesTruncated: true } : {}),
    ...(beyond ? { matchesBeyondDepth: beyond } : {}),
  };
}
