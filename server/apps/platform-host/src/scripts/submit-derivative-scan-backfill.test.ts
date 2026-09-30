import { afterEach, describe, expect, it } from "vitest";
import { parseArgs } from "./submit-derivative-scan-backfill.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const principalId = "33333333-3333-4333-8333-333333333333";

const ORIGINAL_REDIS_URL = process.env["REDIS_BULLMQ_URL"];
afterEach(() => {
  if (ORIGINAL_REDIS_URL === undefined) delete process.env["REDIS_BULLMQ_URL"];
  else process.env["REDIS_BULLMQ_URL"] = ORIGINAL_REDIS_URL;
});

describe("submit-derivative-scan-backfill CLI arg parsing", () => {
  it("parses required flags and applies documented defaults", () => {
    process.env["REDIS_BULLMQ_URL"] = "redis://localhost:6379";
    const args = parseArgs([
      "--plane",
      "neon",
      "--tenant",
      tenantId,
      "--principal",
      principalId,
    ]);
    expect(args.planeKey).toBe("neon");
    expect(args.tenantId).toBe(tenantId);
    expect(args.principalId).toBe(principalId);
    expect(args.dryRun).toBe(false);
    expect(args.batchSize).toBe(200);
    expect(args.concurrency).toBe(8);
    expect(args.redisUrl).toBe("redis://localhost:6379");
    expect(args.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("accepts explicit overrides for batch size, concurrency, request id, dry-run, and redis url", () => {
    delete process.env["REDIS_BULLMQ_URL"];
    const args = parseArgs([
      "--plane",
      "mesh",
      "--tenant",
      tenantId,
      "--principal",
      principalId,
      "--request-id",
      "req-42",
      "--batch-size",
      "50",
      "--concurrency",
      "3",
      "--dry-run",
      "--redis-url",
      "redis://ops-box:6380",
    ]);
    expect(args).toMatchObject({
      planeKey: "mesh",
      requestId: "req-42",
      batchSize: 50,
      concurrency: 3,
      dryRun: true,
      redisUrl: "redis://ops-box:6380",
    });
  });

  it("rejects an invalid or missing plane", () => {
    expect(() =>
      parseArgs(["--tenant", tenantId, "--principal", principalId]),
    ).toThrow(/--plane/);
    expect(() =>
      parseArgs([
        "--plane",
        "atlas",
        "--tenant",
        tenantId,
        "--principal",
        principalId,
      ]),
    ).toThrow(/--plane/);
  });

  it("requires both --tenant and --principal", () => {
    expect(() =>
      parseArgs(["--plane", "neon", "--principal", principalId]),
    ).toThrow(/--tenant/);
    expect(() => parseArgs(["--plane", "neon", "--tenant", tenantId])).toThrow(
      /--principal/,
    );
  });

  it("fails fast when no Redis URL is available from either the flag or the environment", () => {
    delete process.env["REDIS_BULLMQ_URL"];
    expect(() =>
      parseArgs([
        "--plane",
        "neon",
        "--tenant",
        tenantId,
        "--principal",
        principalId,
      ]),
    ).toThrow(/REDIS_BULLMQ_URL/);
  });

  it("prefers an explicit --redis-url over the environment variable", () => {
    process.env["REDIS_BULLMQ_URL"] = "redis://from-env:6379";
    const args = parseArgs([
      "--plane",
      "neon",
      "--tenant",
      tenantId,
      "--principal",
      principalId,
      "--redis-url",
      "redis://from-flag:6379",
    ]);
    expect(args.redisUrl).toBe("redis://from-flag:6379");
  });
});
