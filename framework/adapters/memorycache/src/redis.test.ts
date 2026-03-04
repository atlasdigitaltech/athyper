import { describe, it, expect } from "vitest";

import { createRedisClient } from "./redis.js";

describe("createRedisClient", () => {
  it("should create redis client with default options", () => {
    const client = createRedisClient({ host: "localhost", port: 6379 });

    expect(client).toBeDefined();
    expect(client.options.lazyConnect).toBe(true);
    expect(client.options.maxRetriesPerRequest).toBe(2);
    expect(client.options.enableReadyCheck).toBe(true);

    // Clean up
    client.disconnect();
  });

  it("should merge custom options with defaults", () => {
    const client = createRedisClient({
      host: "localhost",
      port: 6379,
      maxRetriesPerRequest: 5
    });

    expect(client.options.maxRetriesPerRequest).toBe(5);
    expect(client.options.lazyConnect).toBe(true); // Still has default

    // Clean up
    client.disconnect();
  });
});
