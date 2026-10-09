import { sql, type Kysely } from "kysely";
import type { Application } from "express";
import type {
  VerifiedRequestContext,
  Authenticator,
} from "@athyper/server-contract-auth";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import {
  createLocalPublicationRequest,
  assertLocalPublicationEnvironment,
  type LocalPublicationRequest,
} from "@athyper/server-contract-publication";
import {
  createIamAuthenticationMiddleware,
  readVerifiedRequestContext,
  createPermissionAuthorizer,
} from "@athyper/server-platform-iam";
import {
  defineRouteContract,
  registerContractRoute,
  HttpError,
} from "@athyper/server-runtime-http";
import {
  validatePlatformAuthority,
  type PlatformAuthority,
} from "../shared/identity/platform-authority.js";
import { resolveLocalPublicationAuthority } from "../shared/publication/local-publication-policy.js";
import { resolveLocalPublicationInputs } from "../shared/publication/local-publication-inputs.js";
import type { PublicationWorkloadConfiguration } from "../shared/publication/workload-configuration.js";
import type { createNativeReviewSource } from "./native-review-source.js";
type Database = Kysely<Record<string, never>>;
type Options = {
  database: Database;
  authority: PlatformAuthority;
  audit: AuditRecorder<Database>;
  configuration: PublicationWorkloadConfiguration;
  source: ReturnType<typeof createNativeReviewSource>;
  targetDatabases?: Partial<Record<"neon" | "mesh", Database>>;
};
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function createLocalPublicationAdmission(options: Options) {
  assertLocalPublicationEnvironment(options.configuration);
  const platformAuthority = validatePlatformAuthority(options.authority);
  if (
    !options.configuration.localAuthority ||
    options.configuration.tenantId !== options.authority.tenantId
  )
    throw Error("LOCAL_PUBLICATION_AUTHORITY_NOT_CONFIGURED");
  return async (
    context: VerifiedRequestContext,
    id: string,
    command: { requestId: string; expectedRevision: number },
  ) => {
    // This new local-basis action is not a human policy/release review. Preserve
    // verified session assurance and IAM as supplied; do not synthesize elevation
    // or inherit the human-review helper's per-action step-up requirement.
    if (
      context.planeKey !== "studio" ||
      context.realmKey !== platformAuthority.realmKey ||
      context.tenantId !== platformAuthority.tenantId
    )
      throw new HttpError(
        403,
        "LOCAL_PUBLICATION_ADMISSION_DENIED",
        "The configured platform authoring context is required",
      );
    if (
      !uuid.test(id) ||
      !command ||
      Object.keys(command).sort().join() !== "expectedRevision,requestId" ||
      !uuid.test(command.requestId) ||
      !Number.isSafeInteger(command.expectedRevision) ||
      command.expectedRevision < 1
    )
      throw new HttpError(
        400,
        "LOCAL_PUBLICATION_COMMAND_INVALID",
        "A draft, saved revision and unique request ID are required",
      );
    return options.database
      .transaction()
      .setIsolationLevel("serializable")
      .execute(async (tx) => {
        await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${context.tenantId},true),set_config('app.current_principal_id',${context.principalId},true)`.execute(
          tx,
        );
        const actor =
          await sql`SELECT id FROM master.principal WHERE id=${context.principalId}::uuid AND tenant_id=${context.tenantId}::uuid AND principal_type='user' AND status='active' AND auth_epoch=${context.authEpoch}`.execute(
            tx,
          );
        const configuration = options.configuration;
        const authority = await resolveLocalPublicationAuthority({
          transaction: tx,
          context,
          pin: configuration.localAuthority!,
        });
        if (
          authority.authorWorkloadId !== configuration.author.principalId ||
          authority.publisherWorkloadId !== configuration.publisher.principalId
        )
          throw Error("LOCAL_PUBLICATION_WORKLOAD_MISMATCH");
        const decision = await createPermissionAuthorizer({
          policyGate: {
            evaluate: async (input) => ({
              allowed:
                actor.rows.length === 1 &&
                input.context === context &&
                input.permissionCode === "studio.metadata.contract.edit" &&
                input.resource?.tenantId === context.tenantId &&
                input.resource?.changeSetId === id &&
                authority.developerPrincipalIds.includes(context.principalId),
            }),
          },
        }).authorize({
          context,
          permissionCode: "studio.metadata.contract.edit",
          resource: { tenantId: context.tenantId, changeSetId: id },
        });
        if (actor.rows.length !== 1 || !decision.allowed)
          throw new HttpError(
            403,
            "LOCAL_PUBLICATION_ADMISSION_DENIED",
            "Current authoring authority is required",
          );
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${context.tenantId + ":" + context.principalId + ":" + command.requestId},0))`.execute(
          tx,
        );
        const old = (
          await sql<{
            request: LocalPublicationRequest | null;
          }>`SELECT publication.read_local_publication_admission(${command.requestId}::uuid) AS request`.execute(
            tx,
          )
        ).rows[0]?.request;
        if (old) {
          if (
            old.inputs.changeSetId !== id ||
            old.inputs.revision !== command.expectedRevision ||
            old.authority.id !== authority.id ||
            old.authority.version !== authority.version ||
            old.authority.hash !== authority.hash
          )
            throw new HttpError(
              409,
              "LOCAL_PUBLICATION_COMMAND_CONFLICT",
              "The request ID was used for a different saved revision",
            );
          return {
            requestHash: old.hash,
            stage: "admitted" as const,
            replayed: true,
          };
        }
        const root = (
          await sql<{
            revision: string;
            status: string;
            predecessor: string | null;
          }>`SELECT root_json->>'lock_version' AS revision,root_json->>'status' AS status,root_json->>'base_release_id' AS predecessor FROM publication.read_native_product_review_source(${id}::uuid,4194304)`.execute(
            tx,
          )
        ).rows[0];
        if (!root || Number(root.revision) !== command.expectedRevision)
          throw new HttpError(
            409,
            "LOCAL_PUBLICATION_REVISION_CHANGED",
            "Reload the saved draft before publishing",
          );
        if (root.status !== "draft")
          throw new HttpError(
            409,
            "LOCAL_PUBLICATION_DRAFT_REQUIRED",
            "Only a saved draft can start a new publication request",
          );
        const source = await options.source(tx, id);
        const inputs = await resolveLocalPublicationInputs({
          database: tx,
          authority: "control",
          targetDatabases: options.targetDatabases,
          source,
          changeSetId: id,
          revision: command.expectedRevision,
          predecessorReleaseId: root.predecessor,
          instance: configuration.instance,
        });
        const request = createLocalPublicationRequest(
          authority,
          {
            host: {
              environment: configuration.environment,
              instance: configuration.instance,
              domainSuffix: configuration.domainSuffix,
            },
            developerPrincipalId: context.principalId,
            authorWorkloadId: configuration.author.principalId,
            publisherWorkloadId: configuration.publisher.principalId,
            scope: { kind: "product" },
            action: "publish",
            targets: inputs.targets.map(({ plane, instance }) => ({
              plane,
              instance,
            })),
          },
          inputs,
        );
        const admitted = (
          await sql<{
            hash: string;
          }>`SELECT publication.admit_local_publication_command(${JSON.stringify(request)}::jsonb,${command.requestId}::uuid) AS hash`.execute(
            tx,
          )
        ).rows[0];
        if (admitted?.hash !== request.hash)
          throw Error("LOCAL_PUBLICATION_ADMISSION_RECEIPT_INVALID");
        const audit = await options.audit.record(
          {
            eventCode: "metadata.entity.product.publication",
            action: "local_publication_admission",
            outcome: "success",
            severity: "critical",
            actor: { kind: "user", principalId: context.principalId },
            tenantId: context.tenantId,
            entityType: "metadata.entity_change_set",
            entityId: id,
            requestId: command.requestId,
            correlationId: context.correlationId,
            metadata: {
              requestHash: request.hash,
              basis: request.basis,
              authority: request.authority,
              revision: inputs.revision,
              sourceHash: inputs.sourceHash,
            },
          },
          tx,
        );
        if (
          !audit.id ||
          audit.actor.principalId !== context.principalId ||
          audit.tenantId !== context.tenantId
        )
          throw Error("LOCAL_PUBLICATION_AUDIT_NOT_RECORDED");
        return {
          requestHash: request.hash,
          stage: "admitted" as const,
          replayed: false,
        };
      });
  };
}
export function registerLocalPublicationAdmission(
  app: Application,
  options: Options & { authenticator: Authenticator },
) {
  const admit = createLocalPublicationAdmission(options);
  registerContractRoute(
    app,
    defineRouteContract({
      method: "post",
      path: "/api/platform-control/meta-entity-authoring/change-sets/:id/local-publication",
      operationId: "studio.entity.local_publication.admit",
      summary: "Admit an exact local DEV Entity publication request",
      authenticated: true,
      tags: ["Studio"],
      responses: {
        202: {
          description: "Durable request admitted for worker delivery",
          body: { type: "object", additionalProperties: true },
        },
        403: { description: "Current local authoring authority required" },
        409: { description: "Saved revision or request identity conflict" },
      },
    }),
    createIamAuthenticationMiddleware(options.authenticator),
    async (req, res, next) => {
      try {
        if (Object.keys(req.query).length)
          throw new HttpError(
            400,
            "LOCAL_PUBLICATION_COMMAND_INVALID",
            "Query parameters are not accepted",
          );
        res.setHeader("Cache-Control", "private, no-store");
        res
          .status(202)
          .json(
            await admit(
              readVerifiedRequestContext(res),
              String(req.params.id),
              req.body,
            ),
          );
      } catch (error) {
        if (error instanceof HttpError) return next(error);
        const code = (error as { code?: string })?.code;
        const message = error instanceof Error ? error.message : "";
        if (
          code === "40001" ||
          code === "40P01" ||
          code === "23505" ||
          /LOCAL_PUBLICATION_(COMMAND_CONFLICT|REVISION_CHANGED|SOURCE_CHANGED|REQUEST_EXPIRED)/.test(
            message,
          )
        )
          return next(
            new HttpError(
              409,
              "LOCAL_PUBLICATION_RETRY_REQUIRED",
              "Reload the saved draft and retry with a new request ID if the previous request expired",
            ),
          );
        if (
          code === "42501" ||
          /LOCAL_PUBLICATION_(ADMISSION_DENIED|AUTHORITY_|DEVELOPER_DENIED|ACTOR_|DEV_ONLY)/.test(
            message,
          )
        )
          return next(
            new HttpError(
              403,
              "LOCAL_PUBLICATION_ADMISSION_DENIED",
              "Current local publication authority is required",
            ),
          );
        next(error);
      }
    },
  );
}
