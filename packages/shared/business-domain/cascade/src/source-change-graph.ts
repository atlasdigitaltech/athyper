/**
 * Pure cycle detection over `defaults.on_source_change` rules.
 *
 * Builds a directed graph per entity (edge: target → source for every source
 * in every mutation-class rule) and reports any cycles. CI fails red on cycle.
 *
 * Mutation-class actions: clear, rederive, refilter, lock.
 * Read-only actions (warn, validate) are exempt — they do not mutate values
 * and therefore cannot cause feedback loops.
 *
 * Spec: docs/specs/entity_field_defaults.md §8
 */

import type {
  EntityFieldDefaults,
  OnSourceChangeAction,
} from "./types";

export interface CycleViolation {
  entityCode: string;
  cycle:      string[]; // ordered fields forming the cycle, e.g. ["a","b","c","a"]
}

const MUTATION_ACTIONS: ReadonlySet<OnSourceChangeAction> = new Set<OnSourceChangeAction>([
  "clear",
  "rederive",
  "refilter",
  "lock",
]);

export function detectCycles(
  defaultsByField: Readonly<Record<string, EntityFieldDefaults>>,
  entityCode:      string,
): CycleViolation[] {
  // adjacency: target → set of sources
  const adj = new Map<string, Set<string>>();

  for (const [target, defaults] of Object.entries(defaultsByField)) {
    const rules = defaults?.on_source_change;
    if (!rules) continue;

    for (const rule of rules) {
      if (!MUTATION_ACTIONS.has(rule.action)) continue;
      let set = adj.get(target);
      if (!set) {
        set = new Set();
        adj.set(target, set);
      }
      for (const source of rule.sources) {
        if (source === target) {
          // Self-loop is always a cycle.
          set.add(source);
        } else {
          set.add(source);
        }
      }
    }
  }

  const violations: CycleViolation[] = [];
  const seenCycles = new Set<string>();

  // Tarjan-style DFS with stack tracking. For each node, walk descendants;
  // if we revisit a node currently on the path, extract the cycle slice.
  const WHITE = 0;
  const GRAY  = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  for (const node of Array.from(adj.keys()).sort()) {
    color.set(node, color.get(node) ?? WHITE);
  }

  function dfs(node: string): void {
    color.set(node, GRAY);
    stack.push(node);
    onStack.add(node);

    const successors = adj.get(node);
    if (successors) {
      for (const next of Array.from(successors).sort()) {
        const c = color.get(next) ?? WHITE;
        if (c === WHITE) {
          if (!adj.has(next)) {
            // next is a pure source (no outgoing edges), nothing to recurse.
            continue;
          }
          dfs(next);
        } else if (c === GRAY && onStack.has(next)) {
          const cutIndex = stack.indexOf(next);
          if (cutIndex >= 0) {
            const cycle = [...stack.slice(cutIndex), next];
            const key = canonicalCycleKey(cycle);
            if (!seenCycles.has(key)) {
              seenCycles.add(key);
              violations.push({ entityCode, cycle });
            }
          }
        }
      }
    }

    stack.pop();
    onStack.delete(node);
    color.set(node, BLACK);
  }

  for (const node of Array.from(adj.keys()).sort()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      dfs(node);
    }
  }

  return violations;
}

/**
 * A cycle [a,b,c,a] is the same as [b,c,a,b] and [c,a,b,c]. Canonicalise
 * by rotating to start at the lexicographically smallest node.
 */
function canonicalCycleKey(cycle: string[]): string {
  if (cycle.length === 0) return "";
  // Drop the duplicated tail node, rotate, restore.
  const ring = cycle.slice(0, -1);
  let minIdx = 0;
  for (let i = 1; i < ring.length; i += 1) {
    if (ring[i]! < ring[minIdx]!) minIdx = i;
  }
  const rotated = [...ring.slice(minIdx), ...ring.slice(0, minIdx)];
  return [...rotated, rotated[0]!].join("→");
}
