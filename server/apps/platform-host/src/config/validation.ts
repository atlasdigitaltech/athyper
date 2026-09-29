import type { ProcessRole } from "./deployment-profile.js";

/** Validate before importing a runtime or constructing resources. */
export function selectProcessRole(
  environment: Readonly<Record<string, string | undefined>>,
  expectedRole?: ProcessRole,
): ProcessRole {
  const role = environment.MODE ?? expectedRole ?? "api";
  if (role !== "api" && role !== "worker" && role !== "scheduler")
    throw new Error(`Unknown MODE="${role}". Valid values: api, worker, scheduler`);
  if (expectedRole && role !== expectedRole) throw new Error("DEPLOYMENT_ROLE_MISMATCH");
  return role;
}
