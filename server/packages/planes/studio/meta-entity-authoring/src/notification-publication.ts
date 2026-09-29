import { sql, type Kysely } from "kysely";
import {
  AuthoringPolicyError,
  type SignedMetaEntityArtifact,
  type MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  parseEntityNotificationConfiguration,
  parseNotificationPublicationDescriptor,
} from "@athyper/server-contract-publication";
import { compileGraph, sha256 } from "./deterministic.js";

/** A notification-only draft publishes on a separate activation head. It cannot
 * replace an application's entity_runtime descriptor or execute domain operations. */
export function notificationPublicationDescriptor(graph: MetaEntityGraph) {
  if (graph.capabilities?.some(member => member.capabilityKey === "activity" && member.declaration.enabled)) return null;
  const configured = (graph.capabilities ?? []).filter(
    (m) => m.capabilityKey !== "activity" && m.binding?.notifications !== undefined,
  );
  if (!configured.length) return null;
  const nonempty = Object.entries(graph).filter(
    ([key, value]) =>
      Array.isArray(value) &&
      value.length &&
      !["capabilities", "runtimeProfiles", "tests"].includes(key),
  );
  if (
    graph.entity.entityClass !== "configuration" ||
    nonempty.length ||
    graph.runtimeProfiles?.length !== 1 ||
    graph.runtimeProfiles[0]?.backingKind !== "virtual" ||
    graph.runtimeProfiles[0]?.apiExposure !== "catalog_only" ||
    graph.runtimeProfiles[0]?.readMode !== "none" ||
    graph.runtimeProfiles[0]?.writeMode !== "none"
  )
    return null;
  const notifications = Object.fromEntries(
    configured.map((m) => [
      m.capabilityKey,
      parseEntityNotificationConfiguration(
        m.binding!.notifications,
        m.capabilityKey as "comments" | "attachments",
      ),
    ]),
  );
  return parseNotificationPublicationDescriptor({
    schema: "athyper.entity-notifications/1",
    sourceEntityCode: graph.entity.entityCode,
    entityCode: Object.values(notifications)[0]?.targetEntityCode,
    notifications,
  });
}
export async function prepareNotificationConfigurationRelease(
  db: Kysely<Record<string, never>>,
  input: {
    releaseId: string;
    artifact: SignedMetaEntityArtifact;
    targetPlanes: readonly string[];
  },
): Promise<boolean> {
  if (!input.artifact.descriptor.notificationPolicies) return false;
  const row = (
    await sql<
      Record<string, any>
    >`SELECT s.contract_json,r.contract_signature,r.signature_algorithm,r.signing_key_id FROM metadata.entity_release r JOIN snapshot.entity_contract_revision s ON s.id=r.revision_id WHERE r.id=${input.releaseId}::uuid AND r.tenant_id=shared.current_tenant_id() AND r.published_by=master.current_principal_id_soft()`.execute(
      db,
    )
  ).rows[0];
  if (!row)
    throw new AuthoringPolicyError(
      "NOTIFICATION_RELEASE_UNAVAILABLE",
      "Notification release is unavailable",
    );
  const descriptor = notificationPublicationDescriptor(
    row.contract_json as MetaEntityGraph,
  );
  if (!descriptor) return false;
  const compiled = compileGraph(row.contract_json as MetaEntityGraph);
  if (
    compiled.contractHash !== input.artifact.contractHash ||
    compiled.descriptorHash !== input.artifact.descriptorHash ||
    sha256(compiled.descriptor) !== sha256(input.artifact.descriptor) ||
    row.contract_signature !== input.artifact.signature ||
    row.signature_algorithm !== input.artifact.signatureAlgorithm ||
    row.signing_key_id !== input.artifact.signingKeyId
  )
    throw new AuthoringPolicyError(
      "NOTIFICATION_SIGNED_SOURCE_MISMATCH",
      "Signed notification configuration does not match its saved source",
    );
  await sql`SELECT publication.fn_prepare_notification_configuration_release(${input.releaseId}::uuid,${JSON.stringify(descriptor)}::jsonb)`.execute(
    db,
  );
  return true;
}
