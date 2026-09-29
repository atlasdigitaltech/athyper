import { describe, expect, it, vi } from "vitest";
import { createLifecycle } from "@athyper/server-foundation/lifecycle";
import { loadConfig } from "../../../config/environment.js";
import { createContainer } from "../../../kernel/container.js";
import { registerAdapters } from "../../register-adapters.js";
import { registerTelemetry } from "../telemetry.js";

describe("extracted infrastructure lifecycle ownership", () => {
  it("closes independently registered telemetry without needing the combined registrar", async () => {
    const config = loadConfig({});
    config.openTelemetry.endpoint = "http://telemetry.test";
    const adapter = {
      prometheus: {},
      start: vi.fn(),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    const lifecycle = createLifecycle();
    const close = registerTelemetry(createContainer(), config, lifecycle, {
      createOpenTelemetry: () => adapter as never,
    });
    await lifecycle.signalReady({ failOnError: true });
    expect(adapter.start).toHaveBeenCalledOnce();
    await lifecycle.shutdown("test");
    await close();
    expect(adapter.shutdown).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "flushes telemetry once before pools close, including failed composition: %s",
    async (fail) => {
      const order: string[] = [],
        config = loadConfig({}),
        lifecycle = createLifecycle();
      config.openTelemetry.endpoint = "http://telemetry.test";
      config.database.connectionString = "postgresql://runtime@db/athyper_neon";
      config.publication.authoringEnabled = fail;
      const telemetry = {
        prometheus: {},
        start: vi.fn(),
        shutdown: vi.fn(async () => {
          order.push("telemetry");
        }),
      };
      const database = {
        close: vi.fn(async () => {
          order.push("database");
        }),
      };
      const register = () =>
        registerAdapters(createContainer(), config, lifecycle, {
          createOpenTelemetry: () => telemetry as never,
          createNeonDatabase: () => database as never,
        });
      if (fail)
        expect(register).toThrow(
          "Publication requires configured object storage",
        );
      else register();
      await lifecycle.shutdown("test");
      expect(order).toEqual(["telemetry", "database"]);
      expect(telemetry.shutdown).toHaveBeenCalledOnce();
      expect(database.close).toHaveBeenCalledOnce();
    },
  );
});
