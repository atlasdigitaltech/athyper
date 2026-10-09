import { randomUUID } from "node:crypto";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import {
  createKyselyPermissionResolver,
  createPermissionAuthorizer,
} from "@athyper/server-platform-iam";
import { assertLocalPublicationEnvironment } from "@athyper/server-contract-publication";
import { withLocalPublicationRequest } from "./local-publication-database.js";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { sql, type Kysely, type Transaction } from "kysely";
import { resolveLocalPublicationInputs } from "./local-publication-inputs.js";
import { resolveLocalPublicationAuthority } from "./local-publication-policy.js";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";
import { createNativeReviewSource } from "../../control-plane/native-review-source.js";
import type { ComponentLoaderOptions } from "./active-component-source.js";
import type { AuthoringServiceOptions } from "@athyper/server-plane-studio-meta-entity-authoring";

/** Production host composition for native publication. Configuration is a private
 * deployment file, not request data or a source of publication authority. The SQL
 * reader requires the current enrolled workload for each locked source read. */
export function createNativePublicationStartup(options: {
  environment: NodeJS.ProcessEnv;
  audit?: AuditRecorder<Kysely<Record<string, never>>>;
  loader: ComponentLoaderOptions;
  targetDatabases?: Partial<
    Record<"neon" | "mesh", Kysely<Record<string, never>>>
  >;
  localConfiguration?: PublicationWorkloadConfiguration;
  localRequests?: {
    host: Parameters<typeof withLocalPublicationRequest>[0]["host"];
    resolveCurrent: Parameters<
      typeof withLocalPublicationRequest
    >[0]["resolveCurrent"];
    run<T>(
      work: (
        tx: import("kysely").Transaction<Record<string, never>>,
      ) => Promise<T>,
    ): Promise<T>;
  };
  run<T>(work: (tx: Kysely<Record<string, never>>) => Promise<T>): Promise<T>;
}): Pick<AuthoringServiceOptions, "nativePublicationSource"> & {
  readNativeSource?: ReturnType<typeof createNativeReviewSource>;
  transitionLocalNativeSource?: (
    requestHash: string,
    phase: "submit" | "review",
  ) => Promise<{
    basis: "local_development_authority";
    requestHash: string;
    revision: number;
    status: "in_review" | "approved";
    replayed: boolean;
  }>;
  readLocalNativeSource?: (
    requestHash: string,
  ) => ReturnType<ReturnType<typeof createNativeReviewSource>>;
} {
  const path = options.environment.PUBLICATION_NATIVE_SOURCE_CONFIGURATION_FILE;
  if (options.localConfiguration?.localAuthority) {
    assertLocalPublicationEnvironment(options.localConfiguration);
    if (path === undefined)
      throw Error("LOCAL_PUBLICATION_NATIVE_CONFIGURATION_REQUIRED");
  }
  if (path === undefined) return {};
  if (!isAbsolute(path))
    throw Error("NATIVE_PUBLICATION_CONFIGURATION_INVALID");
  const info = statSync(path);
  if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > 65536)
    throw Error("NATIVE_PUBLICATION_CONFIGURATION_INVALID");
  if (!options.loader.uiComponents)
    throw Error("NATIVE_PUBLICATION_COMPONENT_QUALIFICATION_REQUIRED");
  const source = createNativeReviewSource({
    configuration: JSON.parse(readFileSync(path, "utf8")),
    loader: options.loader,
    authority: "publication-worker",
    targetDatabases: options.targetDatabases,
  });
  const local = options.localConfiguration;
  if (local?.localAuthority && options.localRequests)
    throw Error("LOCAL_PUBLICATION_CONFIGURATION_AMBIGUOUS");
  const localRequests = local?.localAuthority
    ? {
        host: {
          environment: local.environment,
          instance: local.instance,
          domainSuffix: local.domainSuffix,
        },
        run: <T>(
          work: (tx: Transaction<Record<string, never>>) => Promise<T>,
        ) =>
          options.run(async (database) => {
            if (!database.isTransaction)
              throw Error("LOCAL_PUBLICATION_TRANSACTION_REQUIRED");
            const tx = database as Transaction<Record<string, never>>;
            await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${local.tenantId},true),
        set_config('app.current_principal_id',${local.publisher.principalId},true)`.execute(
              tx,
            );
            const actor =
              await sql`SELECT id FROM master.principal WHERE tenant_id=${local.tenantId}::uuid
        AND id=${local.publisher.principalId}::uuid AND code=${local.publisher.code} AND principal_type='service_account'
        AND status='active' AND auth_epoch=${local.publisher.authEpoch}`.execute(
                tx,
              );
            if (actor.rows.length !== 1)
              throw Error("LOCAL_PUBLICATION_WORKLOAD_REVOKED");
            return work(tx);
          }),
        resolveCurrent: async (
          request: Parameters<
            NonNullable<typeof options.localRequests>["resolveCurrent"]
          >[0],
          tx: Transaction<Record<string, never>>,
        ) => {
          const authority = await resolveLocalPublicationAuthority({
            transaction: tx,
            context: {
              tenantId: local.tenantId,
              principalId: local.publisher.principalId,
              planeKey: "studio",
            },
            pin: local.localAuthority!,
          });
          if (
            authority.authorWorkloadId !== local.author.principalId ||
            authority.publisherWorkloadId !== local.publisher.principalId
          )
            throw Error("LOCAL_PUBLICATION_WORKLOAD_MISMATCH");
          const resolved = await source(tx, request.inputs.changeSetId);
          const current = await sql<{
            lock_version: string | number;
          }>`SELECT root_json->>'lock_version' AS lock_version FROM publication.read_native_worker_source(${request.inputs.changeSetId}::uuid,4194304)`.execute(
            tx,
          );
          if (current.rows.length !== 1)
            throw Error("LOCAL_PUBLICATION_SOURCE_UNAVAILABLE");
          return {
            authority,
            inputs: await resolveLocalPublicationInputs({
              database: tx,
              targetDatabases: options.targetDatabases,
              source: resolved,
              changeSetId: request.inputs.changeSetId,
              revision: request.inputs.revision,
              instance: local.instance,
            }),
          };
        },
      }
    : options.localRequests;
  return {
    ...(local?.localAuthority && localRequests
      ? {
          transitionLocalNativeSource: (
            requestHash: string,
            phase: "submit" | "review",
          ) =>
            localRequests.run((tx) =>
              withLocalPublicationRequest({
                transaction: tx,
                host: localRequests.host,
                requestHash,
                resolveCurrent: localRequests.resolveCurrent,
                execute: async (request, transaction) => {
                  if (!options.audit)
                    throw Error("LOCAL_PUBLICATION_AUDIT_REQUIRED");
                  // Full production resource resolution/compilation already ran above.
                  // Never accept a caller's "valid" report or actor in this command.
                  const actor =
                    phase === "submit" ? local.author : local.publisher;
                  const active =
                    await sql`SELECT id FROM master.principal WHERE tenant_id=${local.tenantId}::uuid
              AND id=${actor.principalId}::uuid AND code=${actor.code} AND principal_type='service_account'
              AND status='active' AND auth_epoch=${actor.authEpoch}`.execute(
                      transaction,
                    );
                  if (active.rows.length !== 1)
                    throw Error("LOCAL_PUBLICATION_WORKLOAD_REVOKED");
                  await sql`SELECT set_config('app.current_principal_id',${actor.principalId},true)`.execute(
                    transaction,
                  );
                  const identity = {
                    planeKey: "studio" as const,
                    realmKey: local.realmKey,
                    tenantId: local.tenantId,
                    principalId: actor.principalId,
                    authEpoch: actor.authEpoch,
                  };
                  const permissions = await createKyselyPermissionResolver({
                    run: (_identity, work) => work(transaction),
                  }).resolve(identity);
                  // Existing workflow permissions and assurance rules remain intact.
                  // The scoped standing authority supplies the policy decision only.
                  const permissionCode =
                    phase === "submit"
                      ? "studio.metadata.contract.submit"
                      : "studio.metadata.contract.review";
                  const decision = await createPermissionAuthorizer({
                    policyGate: {
                      async evaluate(input) {
                        const allowed =
                          input.permissionCode === permissionCode &&
                          input.context.principalId === actor.principalId &&
                          input.context.tenantId === local.tenantId &&
                          input.context.planeKey === "studio" &&
                          input.resource?.changeSetId ===
                            request.inputs.changeSetId;
                        return {
                          allowed,
                          sodSatisfied: allowed,
                          reason: allowed
                            ? undefined
                            : "local_publication_scope_denied",
                        };
                      },
                    },
                  }).authorize({
                    context: {
                      ...identity,
                      permissions,
                      profileHash: permissions.profileHash,
                      requestId: request.hash,
                      correlationId: request.hash,
                    },
                    permissionCode,
                    resource: {
                      tenantId: local.tenantId,
                      resourceCode: "metadata.entity_change_set",
                      recordId: request.inputs.changeSetId,
                      changeSetId: request.inputs.changeSetId,
                    },
                  });
                  if (!decision.allowed)
                    throw Error("LOCAL_PUBLICATION_IAM_DENIED");
                  const result = await sql<{
                    receipt: {
                      basis: "local_development_authority";
                      requestHash: string;
                      revision: number;
                      status: "in_review" | "approved";
                      replayed: boolean;
                    };
                  }>`SELECT publication.transition_local_publication_request(
              ${request.hash},${phase},${JSON.stringify({ contractHash: request.inputs.sourceHash, issues: [] })}::jsonb) AS receipt`.execute(
                    transaction,
                  );
                  const receipt = result.rows[0]?.receipt;
                  if (
                    result.rows.length !== 1 ||
                    !receipt ||
                    receipt.requestHash !== request.hash ||
                    receipt.basis !== "local_development_authority" ||
                    !Number.isSafeInteger(receipt.revision) ||
                    receipt.revision <= request.inputs.revision ||
                    !["in_review", "approved"].includes(receipt.status) ||
                    (phase === "review" && receipt.status !== "approved") ||
                    typeof receipt.replayed !== "boolean"
                  )
                    throw Error("LOCAL_PUBLICATION_TRANSITION_RECEIPT_INVALID");
                  if (!receipt.replayed) {
                    const auditId = randomUUID();
                    const recorded = await options.audit.record(
                      {
                        eventCode: "metadata.entity.product.publication",
                        action: "local_publication_" + phase,
                        actor: {
                          kind: "service",
                          principalId: actor.principalId,
                        },
                        tenantId: local.tenantId,
                        outcome: "success",
                        severity: "critical",
                        requestId: auditId,
                        correlationId: auditId,
                        entityType: "metadata.entity_change_set",
                        entityId: request.inputs.changeSetId,
                        metadata: {
                          ...receipt,
                          developerPrincipalId:
                            request.admission.developerPrincipalId,
                          authority: request.authority,
                          sourceHash: request.inputs.sourceHash,
                          sourceRevision: request.inputs.revision,
                        },
                      },
                      transaction,
                    );
                    if (
                      !recorded.id ||
                      recorded.actor.principalId !== actor.principalId ||
                      recorded.tenantId !== local.tenantId
                    )
                      throw Error("LOCAL_PUBLICATION_AUDIT_NOT_RECORDED");
                  }
                  await sql`SELECT set_config('app.current_principal_id',${local.publisher.principalId},true)`.execute(
                    transaction,
                  );
                  return receipt;
                },
              }),
            ),
        }
      : {}),
    ...(localRequests
      ? {
          readLocalNativeSource: (requestHash: string) =>
            localRequests!.run((tx) =>
              withLocalPublicationRequest({
                transaction: tx,
                host: localRequests!.host,
                requestHash,
                resolveCurrent: localRequests!.resolveCurrent,
                execute: (request, transaction) =>
                  source(transaction, request.inputs.changeSetId),
              }),
            ),
        }
      : {}),
    readNativeSource: source,
    nativePublicationSource: (id) => options.run((tx) => source(tx, id)),
  };
}
