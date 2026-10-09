import { sql, type Kysely } from "kysely";
import type { ArtifactSigner } from "@athyper/server-contract-meta-entity-authoring";
import type { LocalPublicationRequest } from "@athyper/server-contract-publication";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import {
  compileNativePublication,
  KyselyMetaEntityAuthoringRepository,
  prepareSystemReferenceRelease,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  createKyselyPermissionResolver,
  createPermissionAuthorizer,
} from "@athyper/server-platform-iam";
import type { createNativeReviewSource } from "../../control-plane/native-review-source.js";
import type { PublicationWorkloadConfiguration } from "./workload-configuration.js";
type Database = Kysely<Record<string, never>>;
/** Invoked only inside withLocalPublicationRequest: signature, release, target
 * snapshots, link, request progress and audit commit in the same transaction.
 * Dispatch occurs after this callback returns and the outer transaction commits. */
export async function createLocalNativeRelease(options: {
  transaction: Database;
  request: LocalPublicationRequest;
  configuration: PublicationWorkloadConfiguration;
  source: ReturnType<typeof createNativeReviewSource>;
  signer: ArtifactSigner;
  audit: AuditRecorder<Database>;
}) {
  const { transaction: tx, request, configuration: config } = options;
  if (!tx.isTransaction || !request.inputs.release)
    throw Error("LOCAL_PUBLICATION_RELEASE_PINS_REQUIRED");
  const identity = {
    planeKey: "studio" as const,
    tenantId: config.tenantId,
    realmKey: config.realmKey,
    principalId: config.publisher.principalId,
    authEpoch: config.publisher.authEpoch,
  };
  const permissions = await createKyselyPermissionResolver({
    run: (_identity, work) => work(tx),
  }).resolve(identity);
  const decision = await createPermissionAuthorizer({
    policyGate: {
      evaluate: async (input) => ({
        allowed:
          input.context.principalId === request.admission.publisherWorkloadId &&
          input.context.tenantId === config.tenantId &&
          input.permissionCode ===
            "studio.metadata.contract.publish_automated" &&
          input.resource?.changeSetId === request.inputs.changeSetId,
        sodSatisfied:
          request.admission.authorWorkloadId !==
            request.admission.publisherWorkloadId &&
          request.admission.developerPrincipalId !==
            request.admission.publisherWorkloadId,
      }),
    },
  }).authorize({
    context: {
      ...identity,
      permissions,
      profileHash: permissions.profileHash,
      requestId: request.hash,
      correlationId: request.hash,
    },
    permissionCode: "studio.metadata.contract.publish_automated",
    resource: {
      tenantId: config.tenantId,
      changeSetId: request.inputs.changeSetId,
    },
  });
  if (!decision.allowed) throw Error("LOCAL_PUBLICATION_IAM_DENIED");
  const existing = (
    await sql<{
      receipt: { id: string; releaseNo: number } | null;
    }>`SELECT publication.local_publication_release_receipt(${request.hash}) receipt`.execute(
      tx,
    )
  ).rows[0]?.receipt;
  if (existing) return { ...existing, replayed: true };
  const source = await options.source(tx, request.inputs.changeSetId);
  const compiled = compileNativePublication(source);
  if (
    compiled.contractHash !== request.inputs.sourceHash ||
    compiled.descriptorHash !== request.inputs.release.descriptorHash
  )
    throw Error("LOCAL_PUBLICATION_SIGNED_SOURCE_CHANGED");
  const repository = new KyselyMetaEntityAuthoringRepository(
    tx,
    async (db, input) => {
      if (!(await prepareSystemReferenceRelease(db, input)))
        throw Error("LOCAL_PUBLICATION_NATIVE_PREPARATION_REQUIRED");
    },
  );
  const current = await repository.get(request.inputs.changeSetId);
  if (!current || current.status !== "approved")
    throw Error("LOCAL_PUBLICATION_APPROVED_SOURCE_REQUIRED");
  await repository.recordValidation(
    current.id,
    current.revision,
    { contractHash: compiled.contractHash, issues: [], deterministic: true },
    config.publisher.principalId,
    source.graph,
  );
  const signature = await options.signer.sign(compiled);
  const release = await repository.createRelease({
    changeSetId: current.id,
    expectedRevision: current.revision,
    expectedSourceReleaseId: request.inputs.release.predecessorReleaseId,
    expectedContractHash: compiled.contractHash,
    releaseKind: "publish",
    actorId: config.publisher.principalId,
    targetPlanes: request.inputs.targets.map((t) => t.plane),
    artifact: { ...compiled, ...signature },
  });
  const receipt = await options.audit.record(
    {
      eventCode: "metadata.entity.product.publication",
      action: "local_publication_release",
      outcome: "success",
      severity: "critical",
      actor: { kind: "service", principalId: config.publisher.principalId },
      tenantId: config.tenantId,
      requestId: request.hash,
      correlationId: request.hash,
      entityType: "metadata.entity_release",
      entityId: release.id,
      metadata: {
        basis: request.basis,
        requestHash: request.hash,
        authority: request.authority,
        developerPrincipalId: request.admission.developerPrincipalId,
        sourceHash: request.inputs.sourceHash,
      },
    },
    tx,
  );
  if (
    !receipt.id ||
    receipt.actor.principalId !== config.publisher.principalId ||
    receipt.tenantId !== config.tenantId
  )
    throw Error("LOCAL_PUBLICATION_AUDIT_NOT_RECORDED");
  return { ...release, replayed: false };
}
