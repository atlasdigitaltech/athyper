import { expect, it, vi } from "vitest";
import { HealthRegistry } from "@athyper/server-foundation/observability";
import { readDeploymentProfile } from "../../config/deployment-profile.js";
import { createRegistrationPlan } from "../registration-plan.js";
import { createCapabilityRegistration } from "../capability-registration.js";

it.each(["studio", "neon", "mesh"] as const)("selects %s capabilities and health independently of coordination connections", plane => {
  const plan = createRegistrationPlan(readDeploymentProfile({ MODE: "worker", HOST_DEPLOYMENT_PROFILE: plane, ENTITY_RELEASE_REVIEW_CONFIG_PATH: "/review" }, "worker"));
  const registration = createCapabilityRegistration(plan);
  const factory = vi.fn(planes => planes);
  expect(registration.register("entity.governance", factory)).toEqual([plane]);
  expect(registration.databases("entity.persistence", { studio: {}, neon: {}, mesh: {} })).toEqual({ [plane]: {} });
  expect(() => registration.register("entity.governance", factory)).toThrow("HOST_CAPABILITY_DUPLICATE");
  expect(() => registration.register("entity.http", factory)).toThrow("HOST_CAPABILITY_ROLE_EXCLUDED");
  if (plane !== "studio") expect(() => registration.register("publication.authority", factory)).toThrow("HOST_CAPABILITY_PLANE_EXCLUDED");
  const health = new HealthRegistry();
  const probe = async () => ({ status: "healthy" as const });
  registration.registerHealth(health, plane, `governance.${plane}`, probe);
  const other = plane === "studio" ? "neon" : "studio";
  expect(() => registration.registerHealth(health, other, `governance.${other}`, probe)).toThrow("HOST_HEALTH_PLANE_EXCLUDED");
  expect(health.list()).toEqual([`governance.${plane}`]);
});
