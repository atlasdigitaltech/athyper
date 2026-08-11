import { describe, expect, it, vi } from "vitest";

import {
  checkPostgresPoolHealth,
  closePostgresPool,
  getPostgresPoolStats,
} from "../pool.js";

describe("PostgreSQL pool operations", () => {
  it("reports pool counters without exposing the pool implementation", () => {
    expect(
      getPostgresPoolStats(
        { totalCount: 7, idleCount: 3, waitingCount: 2 },
        12,
      ),
    ).toEqual({ totalCount: 7, idleCount: 3, waitingCount: 2, max: 12 });
  });

  it("uses a focused query for health checks", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });

    await expect(checkPostgresPoolHealth({ query } as never)).resolves.toEqual({
      healthy: true,
    });
    expect(query).toHaveBeenCalledWith("select 1");
  });

  it("returns a safe unhealthy result instead of throwing", async () => {
    const query = vi.fn().mockRejectedValue(new Error("database unavailable"));

    await expect(checkPostgresPoolHealth({ query } as never)).resolves.toEqual({
      healthy: false,
      message: "database unavailable",
    });
  });

  it("delegates graceful shutdown to the pool", async () => {
    const end = vi.fn().mockResolvedValue(undefined);

    await closePostgresPool({ end } as never);

    expect(end).toHaveBeenCalledOnce();
  });
});
