import { sql, type Kysely, type Transaction } from "kysely";
import {
  assertLocalPublicationEnvironment,
  type LocalDevelopmentAuthority,
} from "@athyper/server-contract-publication";

/** Enrollment contains scope, never a client-supplied active state or approval.
 * The policy store supplies identity/version/hash and enrollment provenance. */
export interface LocalPublicationPolicy {
  schema: "athyper.local-publication-policy/1";
  policyId: string;
  revision: 1;
  authorPrincipalId: string;
  publisherPrincipalId: string;
  authority: Pick<
    LocalDevelopmentAuthority,
    | "host"
    | "scope"
    | "validFrom"
    | "expiresAt"
    | "developerPrincipalIds"
    | "actions"
    | "destinations"
  >;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function exact(
  value: unknown,
  keys: string[],
): asserts value is Record<string, any> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== [...keys].sort().join()
  )
    throw Error("LOCAL_PUBLICATION_POLICY_INVALID");
}
export function parseLocalPublicationPolicy(
  value: unknown,
): LocalPublicationPolicy {
  exact(value, [
    "schema",
    "policyId",
    "revision",
    "authorPrincipalId",
    "publisherPrincipalId",
    "authority",
  ]);
  exact(value.authority, [
    "host",
    "scope",
    "validFrom",
    "expiresAt",
    "developerPrincipalIds",
    "actions",
    "destinations",
  ]);
  const a = value.authority;
  exact(a.host, ["environment", "instance", "domainSuffix"]);
  assertLocalPublicationEnvironment(a.host as any);
  exact(a.scope, ["kind"]);
  if (
    value.schema !== "athyper.local-publication-policy/1" ||
    value.revision !== 1 ||
    typeof value.policyId !== "string" ||
    !/^[a-z][a-z0-9._-]{2,127}$/.test(value.policyId) ||
    !uuid.test(value.authorPrincipalId) ||
    !uuid.test(value.publisherPrincipalId) ||
    value.authorPrincipalId === value.publisherPrincipalId ||
    a.scope.kind !== "product" ||
    typeof a.validFrom !== "string" ||
    typeof a.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(a.validFrom)) ||
    !Number.isFinite(Date.parse(a.expiresAt)) ||
    Date.parse(a.expiresAt) <= Date.parse(a.validFrom) ||
    !Array.isArray(a.developerPrincipalIds) ||
    !a.developerPrincipalIds.length ||
    new Set(a.developerPrincipalIds).size !== a.developerPrincipalIds.length ||
    a.developerPrincipalIds.some(
      (id: unknown) =>
        typeof id !== "string" ||
        !uuid.test(id) ||
        id === value.authorPrincipalId ||
        id === value.publisherPrincipalId,
    ) ||
    !Array.isArray(a.actions) ||
    !a.actions.length ||
    new Set(a.actions).size !== a.actions.length ||
    a.actions.some(
      (action: string) =>
        !["publish", "retry", "recover", "rollback"].includes(action),
    ) ||
    !Array.isArray(a.destinations) ||
    !a.destinations.length
  )
    throw Error("LOCAL_PUBLICATION_POLICY_INVALID");
  for (const target of a.destinations) {
    exact(target, ["plane", "instance"]);
    if (
      !["studio", "neon", "mesh"].includes(target.plane) ||
      target.instance !== a.host.instance
    )
      throw Error("LOCAL_PUBLICATION_POLICY_TARGET_INVALID");
  }
  if (
    new Set(a.destinations.map((d: any) => d.plane)).size !==
    a.destinations.length
  )
    throw Error("LOCAL_PUBLICATION_POLICY_TARGET_INVALID");
  return structuredClone(value) as LocalPublicationPolicy;
}

/** Called at both proposal and activation, inside the existing IAM transaction. */
export async function assertLocalPublicationEnrollment(
  tx: Kysely<Record<string, never>>,
  policy: LocalPublicationPolicy,
  tenantId: string,
  now = Date.now(),
): Promise<void> {
  if (
    Date.parse(policy.authority.validFrom) > now ||
    Date.parse(policy.authority.expiresAt) <= now
  )
    throw Error("LOCAL_PUBLICATION_POLICY_EXPIRED");
  const users = policy.authority.developerPrincipalIds;
  const workloads = [policy.authorPrincipalId, policy.publisherPrincipalId];
  const result = await sql<{ id: string; principal_type: string }>`
    SELECT id,principal_type FROM master.principal WHERE tenant_id=${tenantId}::uuid
    AND status='active' AND id=ANY(${[...users, ...workloads]}::uuid[]) FOR SHARE`.execute(
    tx,
  );
  if (
    result.rows.length !== users.length + 2 ||
    result.rows.some(
      (row) =>
        row.principal_type !==
        (users.includes(row.id) ? "user" : "service_account"),
    )
  )
    throw Error("LOCAL_PUBLICATION_POLICY_ACTOR_REVOKED");
}

/** Reconstruct current authority from an independently activated stored policy;
 * a deployment pin identifies the row but does not grant or activate anything. */
export async function resolveLocalPublicationAuthority(options: {
  transaction: Transaction<Record<string, never>>;
  context: Pick<
    import("@athyper/server-contract-auth").VerifiedRequestContext,
    "tenantId" | "principalId" | "planeKey"
  >;
  pin: { id: string; version: number; hash: string };
}): Promise<LocalDevelopmentAuthority> {
  const { createKyselyPolicyAuthoringRepository, calculateDefinitionHash } =
    await import("@athyper/server-platform-policy");
  if (
    !options.transaction.isTransaction ||
    options.context.planeKey !== "studio"
  )
    throw Error("LOCAL_PUBLICATION_AUTHORITY_CONTEXT_INVALID");
  const definition = await createKyselyPolicyAuthoringRepository(
    options.context,
  ).getDefinition(options.pin.id, options.transaction);
  if (
    !definition ||
    definition.entityType !== "metadata.publication" ||
    definition.versionNo !== options.pin.version ||
    calculateDefinitionHash(definition) !== options.pin.hash ||
    definition.rules.length !== 1
  )
    throw Error("LOCAL_PUBLICATION_AUTHORITY_CHANGED");
  const rule = definition.rules[0]!;
  const config = rule.actionConfig;
  if (
    rule.action !== "allow" ||
    config.schema !== "athyper.machine-publication-enrollment/1" ||
    config.environment !== "dev" ||
    config.tenantId !== options.context.tenantId
  )
    throw Error("LOCAL_PUBLICATION_AUTHORITY_CHANGED");
  const policy = parseLocalPublicationPolicy(config.policy);
  await assertLocalPublicationEnrollment(
    options.transaction,
    policy,
    options.context.tenantId,
  );
  const { canonicalJson, sha256 } =
    await import("@athyper/server-plane-studio-meta-entity-authoring");
  const facts = {
    environment: "dev",
    tenantId: options.context.tenantId,
    policyHash: sha256(canonicalJson(policy)),
  };
  if (
    canonicalJson(rule.condition) !==
    canonicalJson({
      and: Object.entries(facts).map(([k, v]) => ({ "===": [{ var: k }, v] })),
    })
  )
    throw Error("LOCAL_PUBLICATION_AUTHORITY_CHANGED");
  // Database execution also checks independent enrollment actors and supersession.
  const live = await sql<{ valid: boolean }>`SELECT d.created_by<>d.updated_by
    AND (SELECT count(*) FROM master.principal p WHERE p.tenant_id=d.tenant_id AND p.id IN(d.created_by,d.updated_by)
      AND p.status='active' AND p.principal_type='user')=2
    AND d.status='active' AND d.definition_hash=${options.pin.hash} AND d.version_no=${options.pin.version}
    AND d.effective_from<=CURRENT_DATE AND (d.effective_until IS NULL OR d.effective_until>=CURRENT_DATE)
    AND NOT EXISTS(SELECT 1 FROM control.policy_definition n WHERE n.tenant_id=d.tenant_id AND n.entity_type=d.entity_type
      AND n.name=d.name AND n.id<>d.id AND n.status='active' AND n.version_no>=d.version_no) AS valid
    FROM control.policy_definition d WHERE d.id=${options.pin.id}::uuid AND d.tenant_id=${options.context.tenantId}::uuid FOR SHARE OF d`.execute(
    options.transaction,
  );
  if (live.rows.length !== 1 || live.rows[0]?.valid !== true)
    throw Error("LOCAL_PUBLICATION_AUTHORITY_CHANGED");
  return {
    schema: "athyper.local-development-authority/1",
    ...options.pin,
    active: true,
    ...policy.authority,
    enrollmentReceiptId: definition.id,
    authorWorkloadId: policy.authorPrincipalId,
    publisherWorkloadId: policy.publisherPrincipalId,
  };
}
