import { readFileSync, statSync } from "node:fs";
import type { DevelopmentPublicationWorkloadConfiguration } from "../../../development/publication-workload.js";

export type PublicationWorkloadConfiguration = Omit<DevelopmentPublicationWorkloadConfiguration, "policy" | "policyHash" | "machinePolicy">;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function requireValue(value: unknown, code: string): asserts value { if (!value) throw Error(code); }

/** Dedicated publication identity, never the ordinary request tenant or legacy
 * product configuration. Source and target authority come from enrolled policy. */
export function parsePublicationWorkloadConfiguration(value: unknown, env: NodeJS.ProcessEnv, environment: string): PublicationWorkloadConfiguration {
  requireValue(environment === "local" && env.ATHYPER_ENV === "local" && env.ATHYPER_DEV_PRESET === "devfull"
    && env.ATHYPER_DOMAIN_SUFFIX === "dev.athyper.test", "PUBLICATION_WORKLOAD_DEV_ONLY");
  requireValue(value && typeof value === "object" && !Array.isArray(value), "PUBLICATION_WORKLOAD_CONFIG_INVALID");
  const input = value as Record<string, unknown>;
  requireValue(Object.keys(input).sort().join() === "author,instance,publisher,realmKey,schemaVersion,tenantId"
    && input.schemaVersion === 1 && input.instance === "dev"
    && typeof input.tenantId === "string" && uuid.test(input.tenantId)
    && input.tenantId === env.PLATFORM_AUTHORITY_TENANT_ID
    && typeof input.realmKey === "string" && /^[a-z][a-z0-9_.-]{0,127}$/.test(input.realmKey), "PUBLICATION_WORKLOAD_AUTHORITY_INVALID");
  for (const role of ["author", "publisher"] as const) {
    const actor = input[role] as Record<string, unknown> | undefined;
    requireValue(actor && Object.keys(actor).sort().join() === "authEpoch,code,credentialSha256,principalId"
      && typeof actor.principalId === "string" && uuid.test(actor.principalId)
      && actor.code === `dev.metadata.${role}` && Number.isSafeInteger(actor.authEpoch) && Number(actor.authEpoch) >= 0
      && typeof actor.credentialSha256 === "string" && /^[a-f0-9]{64}$/.test(actor.credentialSha256), "PUBLICATION_WORKLOAD_CREDENTIAL_INVALID");
  }
  const author = input.author as PublicationWorkloadConfiguration["author"], publisher = input.publisher as PublicationWorkloadConfiguration["publisher"];
  requireValue(author.principalId !== publisher.principalId && author.credentialSha256 !== publisher.credentialSha256, "PUBLICATION_WORKLOAD_DISTINCT_IDENTITIES_REQUIRED");
  return structuredClone({ environment, instance: "dev", domainSuffix: env.ATHYPER_DOMAIN_SUFFIX,
    tenantId: input.tenantId, realmKey: input.realmKey, author, publisher });
}

export function loadPublicationWorkloadConfiguration(env: NodeJS.ProcessEnv, environment: string): PublicationWorkloadConfiguration | undefined {
  const path = env.PUBLICATION_WORKLOAD_CONFIG;
  if (!path) return undefined;
  const stat = statSync(path);
  requireValue(stat.isFile() && stat.size > 0 && stat.size < 16384 && !(stat.mode & 0o022), "PUBLICATION_WORKLOAD_CONFIG_UNTRUSTED");
  return parsePublicationWorkloadConfiguration(JSON.parse(readFileSync(path, "utf8")), env, environment);
}
