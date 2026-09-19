import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import {
  checkPostgresPoolHealth,
  closePostgresPool,
  createPostgresPool,
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

  it("observes checked-out client transport errors without leaving them unhandled", async () => {
    const onPoolError = vi.fn();
    const pool = createPostgresPool({ connectionString: "postgres://localhost/unused" }, { onPoolError });
    const client = new EventEmitter();
    const error = new Error("connection reset");

    pool.emit("connect", client as never);
    expect(() => client.emit("error", error)).not.toThrow();
    pool.emit("error", error);

    expect(onPoolError).toHaveBeenCalledOnce();
    expect(onPoolError).toHaveBeenCalledWith(error);
    await pool.end();
  });
});
