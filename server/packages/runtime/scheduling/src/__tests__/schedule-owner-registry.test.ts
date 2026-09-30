import { describe, expect, it, vi } from "vitest";
import { createRedisScheduleOwnerRegistry } from "../schedule-owner-registry.js";

describe("durable schedule inventory", () => {
  it("reads persisted owners through a new registry using the configured Redis key", async () => {
    const hkeys = vi.fn(async () => ["neon:old-code", "mesh:schedule-id"]);
    const connection = () => ({ client: Promise.resolve({ hkeys }), close: vi.fn(async () => undefined) });
    const first = createRedisScheduleOwnerRegistry("redis://unused", { key: "test:owners", connection: connection() });
    await first.close();
    const restarted = createRedisScheduleOwnerRegistry("redis://unused", { key: "test:owners", connection: connection() });
    await expect(restarted.listScheduleIds()).resolves.toEqual(["neon:old-code", "mesh:schedule-id"]);
    expect(hkeys).toHaveBeenCalledWith("test:owners");
    hkeys.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(restarted.listScheduleIds()).rejects.toThrow("Redis unavailable");
    await restarted.close();
  });
});
