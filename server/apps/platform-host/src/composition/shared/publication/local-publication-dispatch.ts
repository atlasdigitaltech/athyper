import { sql, type Kysely } from "kysely";
import type { JobHandler, JobPublisher } from "@athyper/server-contract-jobs";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";
import { assertLocalPublicationEnvironment } from "@athyper/server-contract-publication";
import { enqueueLocalPublicationPreparation } from "./local-publication-job.js";
export const DISPATCH_LOCAL_PUBLICATION_REQUESTS_JOB =
  "publication.dispatch-local-requests";
/** Redis delivery is deliberately after durable SQL admission. Discovery uses a
 * restricted function; it never grants source-table reads or treats the queue as
 * publication authority. Deterministic enqueue keys absorb repeated scans. */
export function createLocalPublicationDispatchHandler(options: {
  database: Kysely<Record<string, never>>;
  configuration: PublicationWorkloadConfiguration;
  jobs: JobPublisher;
}): JobHandler<
  typeof DISPATCH_LOCAL_PUBLICATION_REQUESTS_JOB,
  Record<string, never>
> {
  assertLocalPublicationEnvironment(options.configuration);
  if (!options.configuration.localAuthority)
    throw Error("LOCAL_PUBLICATION_AUTHORITY_NOT_CONFIGURED");
  return {
    async handle(job, context) {
      const c = options.configuration;
      if (
        job.name !== DISPATCH_LOCAL_PUBLICATION_REQUESTS_JOB ||
        job.queue !== "publication.authority" ||
        job.payloadSchema?.name !== DISPATCH_LOCAL_PUBLICATION_REQUESTS_JOB ||
        job.payloadSchema.version !== 1 ||
        job.execution?.planeKey !== "studio" ||
        job.execution.scope !== "plane" ||
        job.execution.tenantId !== c.tenantId ||
        job.execution.principalId !== c.publisher.principalId ||
        !job.data ||
        Object.keys(job.data).length
      )
        throw Error("LOCAL_PUBLICATION_JOB_SCOPE_DENIED");
      let after: string | null = null;
      let count = 0;
      while (true) {
        context.signal.throwIfAborted();
        const page = await options.database
          .transaction()
          .execute(async (tx) => {
            await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${c.tenantId},true),set_config('app.current_principal_id',${c.publisher.principalId},true)`.execute(
              tx,
            );
            return (
              await sql<{
                request_hash: string;
              }>`SELECT request_hash FROM publication.pending_local_publication_requests(${after},100)`.execute(
                tx,
              )
            ).rows;
          });
        for (const row of page) {
          context.signal.throwIfAborted();
          if (
            !/^[a-f0-9]{64}$/.test(row.request_hash) ||
            (after !== null && row.request_hash <= after)
          )
            throw Error("LOCAL_PUBLICATION_DISCOVERY_INVALID");
          await enqueueLocalPublicationPreparation({
            configuration: c,
            jobs: options.jobs,
            admittedRequestHash: row.request_hash,
          });
          after = row.request_hash;
          count++;
        }
        if (page.length < 100) break;
      }
      return { status: "completed", output: { enqueued: count } };
    },
  };
}
