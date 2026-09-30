/** Only explicit permission denial uses the permission-specific UI copy. */
export function sectionAvailability(cause: unknown): "context_required" | "forbidden" | undefined {
  if (!cause || typeof cause !== "object") return undefined;
  const failure = cause as {status?: unknown; problem?: {code?: unknown}};
  if (failure.status === 403) return "forbidden";
  if (failure.status !== 409) return undefined;
  return failure.problem?.code === "ENTITY_RUNTIME_CONTEXT_REQUIRED" ||
    failure.problem?.code === "BP_360_SCOPE_REQUIRED" ? "context_required" : undefined;
}
