import { describe, expect, it } from "vitest";

import { DB_RETRY_POLICY, isTransientDatabaseError } from "../retry.js";

describe("database retry classification", () => {
  it.each(["40001", "40P01", "08006", "ECONNRESET", "ETIMEDOUT"])(
    "classifies %s as transient",
    (code) => {
      expect(isTransientDatabaseError(Object.assign(new Error("failed"), { code }))).toBe(
        true,
      );
    },
  );

  it("does not retry integrity violations", () => {
    expect(
      isTransientDatabaseError(
        Object.assign(new Error("duplicate key"), { code: "23505" }),
      ),
    ).toBe(false);
  });

  it("publishes a bounded database policy", () => {
    expect(DB_RETRY_POLICY).toMatchObject({
      maxAttempts: 3,
      initialDelayMs: 100,
      maxDelayMs: 2_000,
      strategy: "exponential",
    });
  });
});
