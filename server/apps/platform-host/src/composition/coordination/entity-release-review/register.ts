import type { Kysely } from "kysely";
import type { Container } from "../../../kernel/container.js";
import { loadDeploymentEntityReleaseReview } from "./deployment.js";

/** Cross-plane coordination, not ownership by either plane's application. */
export async function resolveEntityReleaseReview(container: Container, path: string) {
  if (!container.adapters.neonDatabase || !container.adapters.athyperDatabase)
    throw new Error("RELEASE_REVIEW_DATABASES_REQUIRED");
  return loadDeploymentEntityReleaseReview(path, {
    neon: container.adapters.neonDatabase.database as unknown as Kysely<Record<string, never>>,
    studio: container.adapters.athyperDatabase.database as unknown as Kysely<Record<string, never>>,
  });
}
