#!/usr/bin/env node
/**
 * Operator entrypoint for the Stage 3 legacy rollout: submits one derivative-scan-backfill run
 * for a single tenant/plane. Registration in register-services.ts only makes the worker able to
 * *process* this job — nothing enqueues it automatically, so every existing tenant needs one of
 * these submitted (or looped over by a wrapper script) before its legacy "ready" derivatives
 * carry scan evidence.
 *
 * Usage:
 *   tsx src/scripts/submit-derivative-scan-backfill.ts \
 *     --plane neon --tenant <uuid> --principal <uuid> [--request-id <id>] \
 *     [--batch-size 200] [--concurrency 8] [--dry-run] [--redis-url <url>]
 *
 * Requires REDIS_BULLMQ_URL (or --redis-url) pointing at the same BullMQ Redis the target
 * environment's worker process consumes from — this only enqueues; it never runs the job itself.
 */
import { randomUUID } from "node:crypto";
import { createBullMqJobRuntime } from "@athyper/server-runtime-jobs";
import {
  submitDerivativeScanBackfill,
  type DerivativeScanBackfillRequest,
} from "@athyper/server-service-document-derivatives";

export interface CliArgs {
  readonly planeKey: "studio" | "neon" | "mesh";
  readonly tenantId: string;
  readonly principalId: string;
  readonly requestId: string;
  readonly dryRun: boolean;
  readonly batchSize: number;
  readonly concurrency: number;
  readonly redisUrl: string;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(name, next);
      i += 1;
    } else {
      flags.set(name, true);
    }
  }

  const planeKey = flags.get("plane");
  const tenantId = flags.get("tenant");
  const principalId = flags.get("principal");
  if (
    typeof planeKey !== "string" ||
    !["studio", "neon", "mesh"].includes(planeKey)
  ) {
    throw new Error("--plane must be one of studio, neon, mesh");
  }
  if (typeof tenantId !== "string")
    throw new Error("--tenant <uuid> is required");
  if (typeof principalId !== "string")
    throw new Error(
      "--principal <uuid> is required (the operator/service account performing this run)",
    );

  const redisUrl = (
    typeof flags.get("redis-url") === "string"
      ? (flags.get("redis-url") as string)
      : process.env["REDIS_BULLMQ_URL"]
  )?.trim();
  if (!redisUrl)
    throw new Error(
      "REDIS_BULLMQ_URL is not set and --redis-url was not provided",
    );

  const requestId =
    typeof flags.get("request-id") === "string"
      ? (flags.get("request-id") as string)
      : randomUUID();
  const batchSize =
    typeof flags.get("batch-size") === "string"
      ? Number(flags.get("batch-size"))
      : 200;
  const concurrency =
    typeof flags.get("concurrency") === "string"
      ? Number(flags.get("concurrency"))
      : 8;
  const dryRun = flags.get("dry-run") === true;

  return {
    planeKey: planeKey as CliArgs["planeKey"],
    tenantId,
    principalId,
    requestId,
    dryRun,
    batchSize,
    concurrency,
    redisUrl,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const request: DerivativeScanBackfillRequest = {
    planeKey: args.planeKey,
    tenantId: args.tenantId,
    principalId: args.principalId,
    requestId: args.requestId,
    dryRun: args.dryRun,
    batchSize: args.batchSize,
    concurrency: args.concurrency,
  };

  const jobs = createBullMqJobRuntime({ redisUrl: args.redisUrl });
  try {
    const jobId = await submitDerivativeScanBackfill(jobs, request);
    console.log(
      JSON.stringify({
        submitted: true,
        jobId,
        planeKey: request.planeKey,
        tenantId: request.tenantId,
        requestId: request.requestId,
        dryRun: request.dryRun,
      }),
    );
  } finally {
    await jobs.close();
  }
}

// Only run when executed directly (`tsx submit-derivative-scan-backfill.ts ...`), not when
// imported — e.g. by tests exercising parseArgs, which must not open a Redis connection.
const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(process.argv[1], "file://").href;
if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
