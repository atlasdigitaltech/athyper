import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createContainer } from "../../kernel/container.js";
import { registerStudioOnboarding } from "../spaces/studio/onboarding/register-studio-onboarding.js";

describe("optional capability readiness", () => {
  it("does not fail readiness for routes that composition deliberately leaves disabled", async () => {
    const root = resolve(import.meta.dirname, "../../../../..");
    const source = await readFile(
      resolve(root, "apps/platform-host/src/composition/register-services.ts"),
      "utf8",
    );

    expect(source).toMatch(/message:\s*"Governance compliance routes are disabled"/);
  });
  it.each(["api", "worker", "scheduler"] as const)("does not register disabled onboarding readiness for %s", role => {
    const container = createContainer();
    registerStudioOnboarding(container, undefined, undefined, {} as never, {} as never, role);
    expect(container.runtimes.health.list()).not.toContain("studio.onboarding-authority");
    expect(container.platform.httpRegistrars).toHaveLength(0);
  });
  it("does not give the scheduler onboarding ownership even with transport configured", () => {
    const container = createContainer();
    registerStudioOnboarding(container, undefined, {} as never, {} as never, {} as never, "scheduler");
    expect(container.runtimes.health.list()).not.toContain("studio.onboarding-authority");
  });
  it("registers readiness when an API onboarding capability is selected but its database is absent", () => {
    const container = createContainer();
    registerStudioOnboarding(container, undefined, {} as never, {} as never, {} as never, "api");
    expect(container.runtimes.health.list()).toContain("studio.onboarding-authority");
  });
});
