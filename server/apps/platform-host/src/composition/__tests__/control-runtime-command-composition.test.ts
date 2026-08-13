import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerServices } from "../register-services.js";

describe("runtime control command composition", () => {
  const previous = process.env["WAVE0_CONTROL_ADMIN_RUNTIME_COMMANDS_ENABLED"];
  afterEach(() => {
    if (previous === undefined) delete process.env["WAVE0_CONTROL_ADMIN_RUNTIME_COMMANDS_ENABLED"];
    else process.env["WAVE0_CONTROL_ADMIN_RUNTIME_COMMANDS_ENABLED"] = previous;
  });

  it("fails startup when enabled without a durable exact-plane database", () => {
    process.env["WAVE0_CONTROL_ADMIN_RUNTIME_COMMANDS_ENABLED"] = "true";
    const container = createContainer();
    container.platform.iam = {} as never;
    container.platform.authorizer = {} as never;
    container.platform.audit = {} as never;
    expect(() => registerServices(container, {}, loadConfig())).toThrowError(expect.objectContaining({
      code: "CONTROL_ADMIN_RUNTIME_STORE_REQUIRED",
    }));
  });
});
