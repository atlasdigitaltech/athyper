import type {
  JobPublisher,
  JobExecutionCoordinate,
} from "@athyper/server-contract-jobs";
import type {
  MetaEntityPublicationPort,
  MetadataGenerationEvent,
  SignedMetaEntityArtifact,
} from "@athyper/server-contract-meta-entity-authoring";
import { sql, type Kysely } from "kysely";
export interface PublicationServiceAdapterOptions {
  prepare?(input: {
    releaseId: string;
    artifact: SignedMetaEntityArtifact;
    targetPlanes: readonly ("studio" | "neon" | "mesh")[];
  }): Promise<void>;
  jobs: JobPublisher & {
    retry?(queue: string, jobId: string): Promise<boolean>;
  };
  execution(): JobExecutionCoordinate;
  activateLocal(input: {
    releaseId: string;
    plane: "studio" | "neon" | "mesh";
    actorId: string;
  }): Promise<Omit<MetadataGenerationEvent, "eventId">>;
  appendDurableEvent(event: MetadataGenerationEvent): Promise<void>;
  createEventId(): string;
}
export class PublicationServiceMetaEntityAdapter implements MetaEntityPublicationPort {
  constructor(private readonly options: PublicationServiceAdapterOptions) {}
  async publish(input: {
    releaseId: string;
    artifact: SignedMetaEntityArtifact;
    targetPlanes: readonly ("studio" | "neon" | "mesh")[];
  }) {
    await this.options.prepare?.(input);
    const jobId = await this.options.jobs.enqueue(
      "publication.authority",
      "publication.compile-artifact",
      { releaseId: input.releaseId },
      {
        enqueueKey: `publication:${input.releaseId}:compile:1`,
        maxAttempts: 5,
        payloadSchema: { name: "publication.compile-artifact", version: 1 },
        execution: this.options.execution(),
      },
    );
    await this.options.jobs.retry?.("publication.authority", jobId);
  }
  async activate(input: {
    releaseId: string;
    plane: "studio" | "neon" | "mesh";
    actorId: string;
  }) {
    return {
      eventId: this.options.createEventId(),
      ...(await this.options.activateLocal(input)),
    };
  }
  appendGenerationEvent(event: MetadataGenerationEvent) {
    return this.options.appendDurableEvent(event);
  }
}

/** Persists cache-generation messages to the existing durable event.outbox. */
export class KyselyMetadataGenerationEventStore {
  constructor(
    private readonly database: Kysely<Record<string, never>>,
    private readonly actorId: string,
  ) {}
  async append(event: MetadataGenerationEvent): Promise<void> {
    await sql`SELECT publication.fn_emit_outbox(${event.tenantId}::uuid,'metadata.generation.advanced',${event.eventId},'metadata.entity_release',${event.releaseId}::uuid,${this.actorId}::uuid,NULL::uuid,${JSON.stringify(event)}::jsonb)`.execute(
      this.database,
    );
  }
}
