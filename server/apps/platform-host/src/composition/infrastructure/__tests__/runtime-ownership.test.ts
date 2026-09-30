import { expect, it, vi } from "vitest";
import { createLifecycle } from "@athyper/server-foundation/lifecycle";
import { loadConfig } from "../../../config/environment.js";
import { createRegistrationPlan } from "../../../kernel/registration-plan.js";
import { readDeploymentProfile } from "../../../config/deployment-profile.js";
import { createContainer } from "../../../kernel/container.js";
import { registerRuntimes, startRuntimes } from "../../register-runtimes.js";

it.each((["studio", "neon", "mesh"] as const).flatMap(plane => (["api", "worker", "scheduler"] as const).map(role => ({ plane, role }))))("owns queue lifecycle for $plane $role", async ({ plane, role }) => {
  const plan = createRegistrationPlan(readDeploymentProfile({ MODE: role, HOST_DEPLOYMENT_PROFILE: plane, ENTITY_RELEASE_REVIEW_CONFIG_PATH: "/review" }, role));
  const config = loadConfig({ MODE: role, REDIS_BULLMQ_URL: "redis://jobs:6379/1" });
  const container = createContainer(), lifecycle = createLifecycle();
  const jobs = { start: vi.fn(), close: vi.fn() };
  const scheduler = { listScheduleIds: vi.fn(async () => []), close: vi.fn() };
  const createJobs = vi.fn(() => jobs as never), createScheduler = vi.fn(() => scheduler as never);
  registerRuntimes(container, config, lifecycle, { createJobs, createScheduler }, plan);
  const selected = role === "scheduler" ? createScheduler : createJobs;
  expect(selected).toHaveBeenCalledWith(expect.objectContaining({ deployment: { namespace: `host-${plane}`, planes: [plane] } }));
  const excluded = plane === "studio" ? "neon" : "studio";
  if (container.runtimes.jobTransactions)
    expect(() => container.runtimes.jobTransactions!.runSystem(excluded, async () => undefined)).toThrow("JOB_DEPLOYMENT_PLANE_EXCLUDED");
  await startRuntimes(container, role);
  expect(jobs.start).toHaveBeenCalledTimes(role === "worker" ? 1 : 0);
  await lifecycle.shutdown("test");
  expect((role === "scheduler" ? scheduler : jobs).close).toHaveBeenCalledOnce();
});
