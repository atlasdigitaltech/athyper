import type { JobHandler, JobPublisher } from "@athyper/server-contract-jobs";
import { PUBLICATION_AUTHORITY_QUEUE } from "@athyper/server-service-publication";
import { assertLocalPublicationEnvironment } from "@athyper/server-contract-publication";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";
import type { createNativePublicationStartup } from "./native-publication-startup.js";

export const PREPARE_LOCAL_PUBLICATION_JOB =
  "publication.prepare-local-request";
type Configuration = PublicationWorkloadConfiguration;
type Transition = NonNullable<
  ReturnType<
    typeof createNativePublicationStartup
  >["transitionLocalNativeSource"]
>;
const payloadSchema = {
  name: PREPARE_LOCAL_PUBLICATION_JOB,
  version: 1,
} as const;
function configured(configuration: Configuration) {
  assertLocalPublicationEnvironment(configuration);
  if (!configuration.localAuthority)
    throw Error("LOCAL_PUBLICATION_AUTHORITY_NOT_CONFIGURED");
}
function requestHash(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw Error("LOCAL_PUBLICATION_REQUEST_HASH_INVALID");
  return value;
}

/** Call only after the authenticated admission transaction commits. A queue
 * failure leaves the durable admission intact; retry uses the same enqueue key.
 * The worker independently loads that admission, never authority from job data. */
export async function enqueueLocalPublicationPreparation(options: {
  configuration: Configuration;
  jobs: JobPublisher;
  admittedRequestHash: string;
}) {
  configured(options.configuration);
  const hash = requestHash(options.admittedRequestHash);
  return options.jobs.enqueue(
    PUBLICATION_AUTHORITY_QUEUE,
    PREPARE_LOCAL_PUBLICATION_JOB,
    { requestHash: hash },
    {
      enqueueKey: `${PREPARE_LOCAL_PUBLICATION_JOB}:${hash}`,
      execution: {
        planeKey: "studio",
        scope: "plane",
        tenantId: options.configuration.tenantId,
        principalId: options.configuration.publisher.principalId,
      },
      payloadSchema,
      maxAttempts: 5,
    },
  );
}

/** Preparation is explicitly separate from release/activation completion.
 * Both phases call production composition, including fresh resource resolution,
 * compilation and current database authority. No caller-selected actors. */
export function createLocalPublicationPreparationHandler(options: {
  configuration: Configuration;
  transition: Transition;
  release?: (
    hash: string,
  ) => Promise<{ id: string; releaseNo: number; replayed: boolean }>;
  dispatch?: (releaseId: string) => Promise<void>;
}): JobHandler<typeof PREPARE_LOCAL_PUBLICATION_JOB, { requestHash: string }> {
  configured(options.configuration);
  if (Boolean(options.release) !== Boolean(options.dispatch))
    throw Error("LOCAL_PUBLICATION_RELEASE_DISPATCH_REQUIRED");
  return {
    async handle(job, context) {
      const execution = job.execution;
      if (
        job.name !== PREPARE_LOCAL_PUBLICATION_JOB ||
        job.queue !== PUBLICATION_AUTHORITY_QUEUE ||
        !job.data ||
        Object.keys(job.data).join() !== "requestHash" ||
        job.payloadSchema?.name !== payloadSchema.name ||
        job.payloadSchema.version !== payloadSchema.version ||
        execution?.planeKey !== "studio" ||
        execution.scope !== "plane" ||
        execution.tenantId !== options.configuration.tenantId ||
        execution.principalId !== options.configuration.publisher.principalId
      )
        throw Error("LOCAL_PUBLICATION_JOB_SCOPE_DENIED");
      const hash = requestHash(job.data.requestHash);
      for (const phase of ["submit", "review"] as const) {
        context.signal.throwIfAborted();
        const receipt = await options.transition(hash, phase);
        await context.reportProgress({
          phase,
          requestHash: hash,
          revision: receipt.revision,
          status: receipt.status,
        });
      }
      if (options.release && options.dispatch) {
        context.signal.throwIfAborted();
        const release = await options.release(hash);
        await options.dispatch(release.id);
        await context.reportProgress({
          phase: "release",
          requestHash: hash,
          releaseId: release.id,
        });
        return {
          status: "completed",
          output: {
            requestHash: hash,
            stage: "dispatched",
            releaseId: release.id,
            basis: "local_development_authority",
          },
        };
      }
      return {
        status: "completed",
        output: {
          requestHash: hash,
          stage: "approved",
          basis: "local_development_authority",
        },
      };
    },
  };
}
