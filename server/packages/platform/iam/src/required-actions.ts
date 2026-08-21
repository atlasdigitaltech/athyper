export type RequiredActionDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly action: string; readonly reason: "configured" | "unknown-action" };

const ALWAYS_ALLOWED_METHODS = new Set(["OPTIONS"]);

export function evaluateRequiredActions(input: {
  readonly actions: readonly string[];
  readonly path: string;
  readonly method: string;
  /** Route prefixes explicitly allowed while each action is pending. `*` applies to unknown actions. */
  readonly matrix: Readonly<Record<string, readonly string[]>>;
}): RequiredActionDecision {
  if (ALWAYS_ALLOWED_METHODS.has(input.method.toUpperCase())) return { allowed: true };
  for (const action of input.actions) {
    const prefixes = input.matrix[action] ?? input.matrix["*"] ?? [];
    if (!prefixes.some((prefix) => routeMatches(input.path, prefix))) return { allowed: false, action, reason: input.matrix[action] ? "configured" : "unknown-action" };
  }
  return { allowed: true };
}

function routeMatches(path: string, prefix: string): boolean {
  return path === prefix || (prefix.endsWith("/") && path.startsWith(prefix));
}
