import { describe, expect, it, vi } from "vitest";
import { AuthoringConflictError, AuthoringPolicyError } from "@athyper/server-contract-meta-entity-authoring";
import { learningAttemptFailureCode, runLearningAttempt } from "./learning-attempt.js";

describe("durable learning attempts", () => {
  it("commits start before work and writes failure only after rollback has released the connection", async () => {
    const order: string[] = [];
    const error = new AuthoringPolicyError("LEARNING_EVALUATION_FAILED", "private fixture text");
    await expect(runLearningAttempt({
      start: async () => { order.push("start committed"); },
      work: async () => { try { order.push("draft transaction"); throw error; } finally { order.push("rollback released"); } },
      failed: async code => { order.push(code); },
    })).rejects.toBe(error);
    expect(order).toEqual(["start committed", "draft transaction", "rollback released", "LEARNING_EVALUATION_FAILED"]);
  });
  it("does not run evaluation without durable start or invent a terminal result after a ledger outage", async () => {
    const work = vi.fn(), failed = vi.fn();
    await expect(runLearningAttempt({ start: async () => { throw Error("unavailable"); }, work, failed })).rejects.toThrow("unavailable");
    expect(work).not.toHaveBeenCalled(); expect(failed).not.toHaveBeenCalled();
    await expect(runLearningAttempt({ start: async () => {}, work: async () => { throw Error("private SQL"); },
      failed: async () => { throw Error("connection lost"); } })).rejects.toMatchObject({ code: "LEARNING_ATTEMPT_RECORDING_FAILED" });
  });
  it("returns committed success without a second terminal write", async () => {
    const failed = vi.fn();
    expect(await runLearningAttempt({ start: async () => {}, work: async () => "committed", failed })).toBe("committed");
    expect(failed).not.toHaveBeenCalled();
  });
  it("only persists enumerated failure codes, never error messages or database diagnostics", () => {
    expect(learningAttemptFailureCode(new AuthoringConflictError("private row"))).toBe("LEARNING_CONFLICT");
    expect(learningAttemptFailureCode(new TypeError("private question"))).toBe("LEARNING_INVALID_INPUT");
    for (const error of [Error("password"), { code: "secret", message: "token" }, new AuthoringPolicyError("UNKNOWN_SECRET", "secret")])
      expect(learningAttemptFailureCode(error)).toBe("LEARNING_ATTEMPT_FAILED");
  });
});
