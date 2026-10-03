/** Read-only deployed-process inspection. Never emit HostConfig or credentials. */
import { bootstrap } from "../kernel/bootstrap.js";
import { createEntityReadinessInventory } from "@athyper/server-platform-metadata";
import { entityCapabilityRequirements } from "@athyper/server-contract-metadata";
import { publicationCompilerIdentity } from "../composition/shared/publication/compiler-build.js";

const host = await bootstrap("api");
try {
  const adapters = host.container.adapters;
  const databases = {
    neon: adapters.neonDatabase?.database as never,
    studio: adapters.athyperDatabase?.database as never,
    mesh: adapters.meshDatabase?.database as never,
  };
  const evidence = [];
  const failures = [];
  for (const plane of ["studio", "neon", "mesh"] as const) {
  try {
  const descriptors = await createEntityReadinessInventory({ [plane]: databases[plane] })();
  for (const descriptor of descriptors) {
    const readiness = host.container.platform.entityReadiness!;
    evidence.push({ entityCode: descriptor.entityCode, plane: descriptor.planeKey,
      binding: readiness.describeDescriptor(descriptor),
      requirements: entityCapabilityRequirements(descriptor),
      readiness: await readiness.evaluateDescriptor(descriptor) });
  }
  } catch (error) { failures.push({ plane, code: "ENTITY_INVENTORY_UNAVAILABLE",
    reason: error instanceof Error ? error.message : "Unknown failure" }); }
  }
  console.log(JSON.stringify({ schema: "athyper.entity-serving-qualification-inspection/1",
    inspectedAt: new Date().toISOString(), deploymentId: host.config.entityServingDeploymentId,
    compiler: publicationCompilerIdentity(), descriptors: evidence, failures }));
} finally { await host.lifecycle.shutdown("qualification_inspection_complete"); }
