import { expect, it } from "vitest";
import { loadConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerPlatform } from "../register-platform.js";

it("schedules Customer delivery in the scheduler process without worker database adapters", () => {
  const container = createContainer();
  container.runtimes.scheduler = {} as NonNullable<typeof container.runtimes.scheduler>;
  const config = loadConfig();
  registerPlatform(container, { ...config, mode: "scheduler" }, {
    tokenVerifier: { verify: async () => { throw new Error("No authentication expected during registration"); } },
  });
  expect(container.adapters.jobNeonDatabase).toBeUndefined();
  expect(container.adapters.jobAthyperDatabase).toBeUndefined();
  expect(container.runtimes.scheduledJobs).toContainEqual(expect.objectContaining({
    scheduleId: "customer-portal-delivery",
    queue: "iam.customer-portal.delivery",
    name: "trustiam.customer-portal.deliver",
    options: expect.objectContaining({ execution: { planeKey: "studio", scope: "plane", principalId: "00000000-0000-0000-0000-000000000000" } }),
  }));
  expect(container.runtimes.jobDefinitions).toContainEqual(expect.objectContaining({
    code: "trustiam.customer-portal.deliver",
  }));
});
