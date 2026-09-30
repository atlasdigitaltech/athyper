import { expect, it } from "vitest";
import type { PublicationTargetOptions } from "./targets.js";
import { createPublicationTargets } from "./targets.js";
const database = {} as PublicationTargetOptions["authorityDatabase"];
const artifactLoader = {} as PublicationTargetOptions["artifactLoader"];
it("does not turn authority or coordination databases into apply targets", () => {
  const result = createPublicationTargets({
    authorityDatabase: database,
    databases: { studio: database, neon: database, mesh: database },
    targetPlanes: ["mesh"],
    artifactLoader,
  });
  for (const registry of Object.values(result))
    expect(Object.keys(registry)).toEqual(["mesh"]);
});
it("requires the exact selected target and never borrows authority storage", () => {
  expect(() =>
    createPublicationTargets({
      authorityDatabase: database,
      databases: { studio: database },
      targetPlanes: ["neon"],
      artifactLoader,
    }),
  ).toThrow("Publication target database is unavailable: neon");
});
it("constructs no apply bindings when apply is disabled", () => {
  expect(
    createPublicationTargets({
      authorityDatabase: database,
      databases: { studio: database },
      targetPlanes: [],
      artifactLoader,
    }),
  ).toEqual({ projections: {}, orchestrators: {}, loaders: {} });
});
