import { createLifecycle } from "@athyper/server-foundation/lifecycle";
import { createRegistrationPlan } from "./registration-plan.js";
import { loadHostModule } from "./module-registry.js";
import { selectDeploymentEnvironment } from "./deployment-environment.js";
import { selectDatabaseConfiguration } from "../composition/infrastructure/database-selection.js";
import { assertDeploymentProfileImplemented, readDeploymentProfile, type ProcessRole } from "../config/deployment-profile.js";

/** Transitional combined composition. Isolated profiles must not silently use it. */
export async function bootstrap(role: ProcessRole) {
  const profile = readDeploymentProfile(process.env, role);
  assertDeploymentProfileImplemented(profile);
  const plan = createRegistrationPlan(profile);
  console.info(JSON.stringify({ event: "host.deployment_profile", ...profile }));

  // Validate the profile before importing configuration and composition.
  const { loadConfig } = await import("../config/environment.js");
  const config = selectDatabaseConfiguration(loadConfig(selectDeploymentEnvironment(process.env, plan)), plan);
  if (role === "scheduler" && config.bullMq.url) {
    const { assertDedicatedJobStore } = await import("@athyper/server-runtime-jobs");
    assertDedicatedJobStore(config.bullMq.url, config.redis.url);
  }
  const lifecycle = createLifecycle();
  try {
    // Load the complete compatibility graph before constructing resources.
    const { createContainer } = await import("./container.js");
    const { registerAdapters } = await import("../composition/register-adapters.js");
    const { registerRuntimes } = await import("../composition/register-runtimes.js");
    const { registerPlatform } = await import("../composition/register-platform.js");
    const { registerServices } = await loadHostModule(profile, "compatibility.services");
    const reviewPath = process.env.ENTITY_RELEASE_REVIEW_CONFIG_PATH;
    const reviewFactory = profile.coordination.includes("entity-release-review") && reviewPath
      ? (await loadHostModule(profile, "coordination.entity-release-review")).resolveEntityReleaseReview
      : undefined;
    const container = createContainer();
    registerAdapters(container, config, lifecycle, {}, plan);
    registerRuntimes(container, config, lifecycle, {}, plan);
    registerPlatform(container, config, { servedPlanes: plan.servedPlanes });
    const review = reviewFactory && reviewPath
      ? await reviewFactory(container, reviewPath)
      : undefined;
    registerServices(container, review ? { entityAuthorizationReleaseReview: review } : {}, config, lifecycle, plan);
    return { config, lifecycle, container, profile };
  } catch (error) {
    try { await lifecycle.shutdown("bootstrap_failed"); }
    catch { console.error("[host] bootstrap_cleanup_failed"); }
    throw error;
  }
}
