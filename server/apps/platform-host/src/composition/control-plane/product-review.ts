import { sql, type Kysely } from "kysely";
import type { Application } from "express";
import type {
  Authenticator,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import {
  AuthoringConflictError,
  AuthoringPolicyError,
} from "@athyper/server-contract-meta-entity-authoring";
import type { MetaEntityAuthoringRepository } from "@athyper/server-contract-meta-entity-authoring";
import {
  KyselyMetaEntityAuthoringRepository,
  createProductReviewService,
  registerProductReviewRoutes,
  type ProductReviewAction,
  type ProductReviewCommand,
  type ProductReviewReceipt,
  type ProductReviewPorts,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  createIamAuthenticationMiddleware,
  readVerifiedRequestContext,
  createPermissionAuthorizer,
} from "@athyper/server-platform-iam";
import {
  assertPlatformAuthority,
  validatePlatformAuthority,
  type PlatformAuthority,
} from "../shared/identity/platform-authority.js";

type Database = Kysely<Record<string, never>>;
const denied = () =>
  new AuthoringPolicyError(
    "FORBIDDEN",
    "Platform product review authority is required",
  );

/** Normal native lifecycle, using the receipt-bound native transition command rather
 * than the unrelated service-account publication command. */
class ProductReviewRepository extends KyselyMetaEntityAuthoringRepository {
  constructor(private readonly tx: Database) {
    super(tx);
  }
  override async transition(
    input: Parameters<MetaEntityAuthoringRepository["transition"]>[0],
  ) {
    if (
      input.breakGlass ||
      !(
        (input.from === "draft" && input.to === "in_review") ||
        (input.from === "in_review" && input.to === "approved")
      )
    )
      throw denied();
    const result =
      await sql`SELECT publication.transition_native_product_review(${input.changeSetId}::uuid,
      ${input.expectedRevision}::bigint,${input.from},${input.to},${input.actorId}::uuid) AS id`.execute(
        this.tx,
      );
    if (result.rows.length !== 1)
      throw new AuthoringConflictError("Stale authoring revision or state");
    return (await this.get(input.changeSetId))!;
  }
}

export function createControlProductReview(options: {
  database: Database;
  authority: PlatformAuthority;
  audit: AuditRecorder<Database>;
  nativeSource?: (
    tx: Database,
    id: string,
  ) => ReturnType<ProductReviewPorts["nativeSource"]>;
}) {
  const authority = validatePlatformAuthority(options.authority);
  async function run(
    context: VerifiedRequestContext,
    id: string,
    action: ProductReviewAction | "read",
    command?: ProductReviewCommand,
  ) {
    try {
      assertPlatformAuthority(context, authority);
    } catch {
      throw denied();
    }
    return options.database
      .transaction()
      .setIsolationLevel("serializable")
      .execute(async (tx) => {
        await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${context.tenantId},true),
        set_config('app.current_principal_id',${context.principalId},true)`.execute(
          tx,
        );
        const actors =
          await sql`SELECT id FROM master.principal WHERE id=${context.principalId}::uuid AND tenant_id=${authority.tenantId}::uuid
        AND principal_type='user' AND status='active' AND auth_epoch=${context.authEpoch}`.execute(
            tx,
          );
        if (actors.rows.length !== 1) throw denied();
        // Serialize product commands with publication. Do not SELECT FOR UPDATE:
        // the control role's UPDATE policy intentionally excludes approved rows.
        // Native transitions lock on UPDATE; serializable isolation rejects drift.
        await sql`SELECT pg_advisory_xact_lock(hashtextextended('system-entity-release:'||entity_id::text,0))
        FROM metadata.entity_change_set WHERE id=${id}::uuid AND tenant_id IS NULL`.execute(
          tx,
        );
        const rows = await sql<{
          created_by: string;
          submitted_by: string | null;
          status: string;
          base_release_id: string | null;
          current_release_id: string | null;
        }>`
        SELECT c.created_by,c.submitted_by,c.status,c.base_release_id,
          (SELECT r.id FROM metadata.entity_release r WHERE r.entity_id=c.entity_id AND r.tenant_id IS NULL ORDER BY r.release_no DESC LIMIT 1) current_release_id
        FROM metadata.entity_change_set c JOIN metadata.entity e ON e.id=c.entity_id
        WHERE c.id=${id}::uuid AND c.tenant_id IS NULL AND e.tenant_id IS NULL AND e.ownership_model='system'`.execute(
          tx,
        );
        const row = rows.rows[0];
        if (!row) throw denied();
        const separated =
          row.created_by !== context.principalId &&
          row.submitted_by !== context.principalId;
        const permissionCode = {
          read: "studio.metadata.contract.view",
          submit: "studio.metadata.contract.submit",
          approve: "studio.metadata.contract.review",
        }[action];
        const decision = await createPermissionAuthorizer({
          policyGate: {
            async evaluate() {
              return {
                allowed: action !== "approve" || separated,
                sodSatisfied: action === "approve" && separated,
              };
            },
          },
        }).authorize({
          context,
          permissionCode,
          resource: { tenantId: authority.tenantId, changeSetId: id },
        });
        if (!decision.allowed) throw denied();
        const service = createProductReviewService({
          repository: new ProductReviewRepository(tx),
          async receipt(requestId) {
            const r = await sql<{
              receipt: ProductReviewReceipt;
            }>`SELECT receipt FROM metadata.entity_product_review_receipt
            WHERE authority_tenant_id=${authority.tenantId}::uuid AND request_id=${requestId}::uuid`.execute(
              tx,
            );
            return r.rows[0]?.receipt ?? null;
          },
          nativeSource: async (changeSetId) => {
            if (!options.nativeSource)
              throw new AuthoringPolicyError(
                "NATIVE_REVIEW_HOST_NOT_CONFIGURED",
                "Native compilation source is not installed",
              );
            return options.nativeSource(tx, changeSetId);
          },
          submitted: (changeSetId, revision, hash, actorId) =>
            has("submit", changeSetId, revision, hash, actorId),
          async record(receipt) {
            if (row.base_release_id !== row.current_release_id)
              throw new AuthoringConflictError(
                "Published predecessor changed; prepare a current successor",
              );
            await sql`INSERT INTO metadata.entity_product_review_receipt(authority_tenant_id,request_id,change_set_id,actor_id,action,expected_revision,contract_hash,receipt)
            VALUES(${authority.tenantId}::uuid,${receipt.requestId}::uuid,${id}::uuid,${context.principalId}::uuid,${receipt.action},${receipt.expectedRevision},${receipt.expectedContractHash},${JSON.stringify(receipt)}::jsonb)`.execute(
              tx,
            );
            const audit = await options.audit.record(
              {
                eventCode: "metadata.entity.product.review",
                action: receipt.action,
                outcome: "success",
                severity: "critical",
                tenantId: authority.tenantId,
                actor: { kind: "user", principalId: context.principalId },
                entityType: "metadata.entity_change_set",
                entityId: id,
                requestId: context.requestId,
                metadata: {
                  ...receipt,
                  schema: "athyper.product-human-review/1",
                  seedProvenancePreserved: true,
                },
              },
              tx,
            );
            if (
              !audit.id ||
              audit.actor.principalId !== context.principalId ||
              audit.tenantId !== authority.tenantId
            )
              throw new Error("PRODUCT_REVIEW_AUDIT_REQUIRED");
          },
        });
        async function has(
          kind: "submit",
          changeSetId: string,
          revision: number,
          hash: string,
          actorId: string,
        ) {
          const r =
            await sql`SELECT request_id FROM metadata.entity_product_review_receipt WHERE authority_tenant_id=${authority.tenantId}::uuid
          AND change_set_id=${changeSetId}::uuid AND actor_id=${actorId}::uuid AND action=${kind} AND expected_revision=${revision} AND contract_hash=${hash}`.execute(
              tx,
            );
          return r.rows.length > 0;
        }
        return action === "read"
          ? service.inspect(id)
          : service.execute(id, context.principalId, action, command!);
      });
  }
  return {
    inspect: (context: VerifiedRequestContext, id: string) =>
      run(context, id, "read"),
    execute: (
      context: VerifiedRequestContext,
      id: string,
      action: ProductReviewAction,
      command: ProductReviewCommand,
    ) => run(context, id, action, command),
  };
}

export function registerControlProductReview(
  app: Application,
  options: {
    database: Database;
    authority: PlatformAuthority;
    audit: AuditRecorder<Database>;
    authenticator: Authenticator;
    nativeSource?: (
      tx: Database,
      id: string,
    ) => ReturnType<ProductReviewPorts["nativeSource"]>;
  },
) {
  registerProductReviewRoutes(app, {
    basePath: "/api/platform-control/meta-entity-authoring",
    authenticate: createIamAuthenticationMiddleware(options.authenticator),
    readContext: readVerifiedRequestContext,
    ...createControlProductReview(options),
  });
}
