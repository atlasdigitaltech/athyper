import { sql, type Kysely } from "kysely";
import type { Application } from "express";
import type {
  Authenticator,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import {
  prepareEntitySuccessorDraft,
  type EntitySuccessorDraftAuthority,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  defineRouteContract,
  registerContractRoute,
  HttpError,
} from "@athyper/server-runtime-http";
import {
  createIamAuthenticationMiddleware,
  readVerifiedRequestContext,
} from "@athyper/server-platform-iam";
import {
  assertPlatformAuthority,
  type PlatformAuthority,
} from "../shared/identity/platform-authority.js";
import { resolveLocalPublicationAuthority } from "../shared/publication/local-publication-policy.js";
import type { PublicationWorkloadConfiguration } from "../shared/publication/workload-configuration.js";

type Database = Kysely<Record<string, never>>;
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

type Options = {
  database: Database;
  authority: PlatformAuthority;
  audit: AuditRecorder<Database>;
  configuration: PublicationWorkloadConfiguration;
};

type Predecessor = {
  authoringReleaseId: string;
  authoringReleaseNo: number;
  authoringReleaseHash: string;
  publicationReleaseId: string;
  publicationReleaseNo: number;
  publicationReleaseHash: string;
  contractHash: string;
  revisionId: string;
  publicationKey: string;
};

function invalid(message: string): never {
  throw new HttpError(400, "LOCAL_SUCCESSOR_COMMAND_INVALID", message);
}

function command(value: unknown): { requestId: string } {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== "requestId" ||
    !uuid.test((value as { requestId?: unknown }).requestId as string)
  )
    invalid("A single UUID request ID is required");
  return { requestId: (value as { requestId: string }).requestId };
}

async function predecessor(
  tx: Database,
  entityId: string,
): Promise<Predecessor> {
  const rows = await sql<{
    authoring_release_id: string;
    authoring_release_no: number | string;
    authoring_release_hash: string;
    publication_release_id: string;
    publication_release_no: number | string;
    publication_release_hash: string;
    contract_hash: string;
    revision_id: string;
    publication_key: string;
  }>`SELECT * FROM publication.read_local_successor_predecessor(${entityId}::uuid)`.execute(tx);
  if (rows.rows.length !== 1) {
    throw new HttpError(
      409,
      "LOCAL_SUCCESSOR_PREDECESSOR_REQUIRED",
      "Exactly one current published product release is required",
    );
  }
  const row = rows.rows[0]!;
  return {
    authoringReleaseId: row.authoring_release_id,
    authoringReleaseNo: Number(row.authoring_release_no),
    authoringReleaseHash: row.authoring_release_hash,
    publicationReleaseId: row.publication_release_id,
    publicationReleaseNo: Number(row.publication_release_no),
    publicationReleaseHash: row.publication_release_hash,
    contractHash: row.contract_hash,
    revisionId: row.revision_id,
    publicationKey: row.publication_key,
  };
}

/** Creates a draft from a sealed native product release. The request contains
 * no source graph or release pin: those are resolved and rechecked in the
 * database inside the same transaction as the draft write. */
export function createLocalSuccessorPreparation(options: Options) {
  return async (
    context: VerifiedRequestContext,
    entityId: string,
    value: unknown,
  ) => {
    if (!uuid.test(entityId)) invalid("A UUID entity ID is required");
    const input = command(value);
    try {
      assertPlatformAuthority(context, options.authority);
    } catch {
      throw new HttpError(
        403,
        "LOCAL_SUCCESSOR_ADMISSION_DENIED",
        "The configured platform authoring context is required",
      );
    }
    if (
      context.planeKey !== "studio" ||
      context.tenantId !== options.authority.tenantId ||
      context.realmKey !== options.authority.realmKey
    )
      throw new HttpError(
        403,
        "LOCAL_SUCCESSOR_ADMISSION_DENIED",
        "The configured platform authoring context is required",
      );
    return options.database
      .transaction()
      .setIsolationLevel("serializable")
      .execute(async (tx) => {
        await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${context.tenantId},true),set_config('app.current_principal_id',${context.principalId},true)`.execute(
          tx,
        );
        const actor = await sql<{ id: string }>`SELECT id FROM master.principal
        WHERE id=${context.principalId}::uuid AND tenant_id=${context.tenantId}::uuid
          AND principal_type='user' AND status='active' AND auth_epoch=${context.authEpoch}`.execute(
          tx,
        );
        const authority = await resolveLocalPublicationAuthority({
          transaction: tx,
          context,
          pin: options.configuration.localAuthority!,
        });
        if (
          actor.rows.length !== 1 ||
          !authority.actions.includes("publish") ||
          !authority.developerPrincipalIds.includes(context.principalId)
        )
          throw new HttpError(
            403,
            "LOCAL_SUCCESSOR_ADMISSION_DENIED",
            "Current local authoring authority is required",
          );
        const source = await predecessor(tx, entityId);
        const draftAuthority: EntitySuccessorDraftAuthority = {
          async assertAuthorized(request) {
            if (
              request.action !== "metadata.entity.successor.prepare" ||
              request.requestId !== input.requestId ||
              request.entityId !== entityId ||
              request.actorId !== context.principalId ||
              request.authorityTenantId !== context.tenantId
            )
              throw Error("LOCAL_SUCCESSOR_ADMISSION_CHANGED");
          },
        };
        const result = await prepareEntitySuccessorDraft(tx, draftAuthority, {
          requestId: input.requestId,
          authorityTenantId: context.tenantId,
          entityId,
          actorId: context.principalId,
          publicationKey: source.publicationKey,
          predecessor: source,
        });
        const event = await options.audit.record(
          {
            eventCode: "metadata.entity.local.successor_prepared",
            action: "local_successor_prepare",
            outcome: "success",
            severity: "critical",
            actor: { kind: "user", principalId: context.principalId },
            tenantId: context.tenantId,
            entityType: "metadata.entity_change_set",
            entityId: result.changeSet.id,
            requestId: input.requestId,
            correlationId: context.correlationId,
            metadata: {
              basis: "local_development_authority",
              predecessor: source.authoringReleaseId,
              reused: result.reused,
            },
          },
          tx,
        );
        if (
          !event.id ||
          event.tenantId !== context.tenantId ||
          event.actor.principalId !== context.principalId
        )
          throw Error("LOCAL_SUCCESSOR_AUDIT_NOT_RECORDED");
        return {
          changeSetId: result.changeSet.id,
          revision: result.changeSet.revision,
          contractHash: result.artifact.contractHash,
          descriptorHash: result.artifact.descriptorHash,
          reused: result.reused,
        };
      });
  };
}

export function registerLocalSuccessorPreparation(
  app: Application,
  options: Options & { authenticator: Authenticator },
) {
  const prepare = createLocalSuccessorPreparation(options);
  registerContractRoute(
    app,
    defineRouteContract({
      method: "post",
      path: "/api/platform-control/meta-entity-authoring/entities/:id/local-successor",
      operationId: "studio.entity.local_successor.prepare",
      summary:
        "Prepare a native product successor from the current sealed release",
      authenticated: true,
      tags: ["Studio"],
      responses: {
        201: {
          description: "Draft prepared",
          body: { type: "object", additionalProperties: true },
        },
        403: { description: "Current local authoring authority required" },
        409: { description: "Current source release changed" },
      },
    }),
    createIamAuthenticationMiddleware(options.authenticator),
    async (req, res, next) => {
      try {
        if (Object.keys(req.query).length)
          invalid("Query parameters are not accepted");
        res.setHeader("Cache-Control", "private, no-store");
        res
          .status(201)
          .json(
            await prepare(
              readVerifiedRequestContext(res),
              String(req.params.id),
              req.body,
            ),
          );
      } catch (error) {
        next(error);
      }
    },
  );
}
