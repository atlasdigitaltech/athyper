/** Operator-only container command; no HTTP endpoint and no queue consumers.
 * Composes the SAME production loader, runtime qualifier and activation guard.
 */
import { loadConfig } from "../config/environment.js";
import { createLifecycle } from "@athyper/server-foundation/lifecycle";
import { runWithRequestContext } from "@athyper/server-foundation/context";
import { createContainer } from "../kernel/container.js";
import { registerAdapters } from "../composition/register-adapters.js";
import { registerRuntimes } from "../composition/register-runtimes.js";
import { registerPlatform } from "../composition/register-platform.js";
import { registerServices } from "../composition/register-services.js";
import { loadDeploymentEntityReleaseReview } from "../composition/entity-release-review-deployment.js";
import { loadDevPublicationConfiguration } from "../development/publication.js";
import { sql, type Kysely } from "kysely";
import { KyselyPublicationAuthorityRepository } from "@athyper/server-service-publication";

let input = "";
for await (const chunk of process.stdin) { input += chunk; if (input.length > 4096) throw Error("RECOVERY_INPUT_LIMIT"); }
const request = JSON.parse(input), config = loadConfig();
const scope = loadDevPublicationConfiguration(process.env, config.env);
if (!scope || scope.targets.join() !== "neon" || !scope.runtimeApproval || request.releaseId !== scope.runtimeApproval.releaseId || !/^[a-f0-9-]{36}$/.test(request.deploymentId) || !/^[a-f0-9-]{36}$/.test(request.requestId)) throw Error("RECOVERY_SCOPE_DENIED");
const lifecycle = createLifecycle(), container = createContainer();
try {
  registerAdapters(container, config, lifecycle);
  registerRuntimes(container, config, lifecycle);
  registerPlatform(container, config);
  const reviewPath = process.env.ENTITY_RELEASE_REVIEW_CONFIG_PATH;
  const review = reviewPath ? loadDeploymentEntityReleaseReview(reviewPath, {
    neon: container.adapters.neonDatabase!.database as unknown as Kysely<Record<string, never>>,
    studio: container.adapters.athyperDatabase!.database as unknown as Kysely<Record<string, never>>,
  }) : undefined;
  registerServices(container, { ...(review ? { entityAuthorizationReleaseReview: review } : {}) }, config, lifecycle);
  const result = await runWithRequestContext({ requestId: request.requestId, correlationId: request.requestId, tenantId: scope.tenantId, principalId: scope.publisher.principalId, planeKey: "neon" }, async () => {
    const publication = container.services.publication!;
    const database = (container.adapters.jobAthyperDatabase ?? container.adapters.athyperDatabase)!.database as unknown as Kysely<Record<string, never>>;
    const deployment = await database.transaction().execute(async tx => {
      await sql`SELECT set_config('app.current_tenant_id',${scope.tenantId},true),set_config('app.current_principal_id',${scope.publisher.principalId},true)`.execute(tx);
      return new KyselyPublicationAuthorityRepository(tx).getDeployment(request.deploymentId);
    });
    if (!deployment || deployment.sourceReleaseId !== request.releaseId || deployment.targetPlane !== "neon" || deployment.targetEnvironment !== "local") throw Error("RECOVERY_DEPLOYMENT_MISMATCH");
    return publication.orchestrators.neon!.deploy(request.deploymentId);
  });
  console.log(JSON.stringify({ recovery: true, status: result.status, artifactHash: result.artifactHash, appliedId: result.id }));
} finally { await lifecycle.shutdown("operator-publication-recovery"); }
