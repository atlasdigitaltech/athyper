import { assertPostgresQualificationEnvironment } from "./postgres-service-harness.js";

export function setup(): void {
  if (process.env["ATHYPER_POSTGRES_LOCAL_SKIP"] === "true") return;
  assertPostgresQualificationEnvironment();
}
