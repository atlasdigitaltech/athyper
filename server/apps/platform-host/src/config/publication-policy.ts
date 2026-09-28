import { readFileSync } from "node:fs";
import { parsePublicationTrustManifest, type PublicationTrustManifest, type PublicationTrustDomain } from "@athyper/server-adapter-publication-signing";

export interface PublicationSecretStoreConfiguration {
  endpoint: string; workspaceId: string; environment: string; tokenFile: string;
}
export function loadPublicationSecretStore(environment: Readonly<NodeJS.ProcessEnv>): PublicationSecretStoreConfiguration | undefined {
  const endpoint = environment.PUBLICATION_INFISICAL_URL, workspaceId = environment.PUBLICATION_INFISICAL_PROJECT_ID,
    target = environment.PUBLICATION_INFISICAL_ENVIRONMENT, tokenFile = environment.PUBLICATION_INFISICAL_TOKEN_FILE;
  if (![endpoint, workspaceId, target, tokenFile].some(Boolean)) return undefined;
  if (!endpoint || !workspaceId || !target || !tokenFile || !tokenFile.startsWith("/")
    || new URL(endpoint).protocol !== "https:" || !environment.PUBLICATION_TRUST_DOMAIN)
    throw Error("PUBLICATION_SECRET_STORE_CONFIGURATION_INVALID");
  if (target !== environment.ATHYPER_INSTANCE) throw Error("PUBLICATION_SECRET_STORE_ENVIRONMENT_MISMATCH");
  return { endpoint, workspaceId, environment: target, tokenFile };
}

export interface PublicationTrustConfiguration {
  readonly domain: PublicationTrustDomain;
  readonly manifest: PublicationTrustManifest;
}
/** Public fingerprints only; no key bytes. Local legacy operation is transitional,
 * never an automatic DEV authorization path. STG/PROD publication requires trust.
 */
export function loadPublicationTrustConfiguration(environment: Readonly<NodeJS.ProcessEnv>, enabled: boolean): PublicationTrustConfiguration | undefined {
  if (environment.PUBLICATION_TRUST_MANIFEST_JSON && environment.PUBLICATION_TRUST_MANIFEST_FILE)
    throw Error("PUBLICATION_TRUST_MANIFEST_AMBIGUOUS");
  const raw = environment.PUBLICATION_TRUST_MANIFEST_FILE
    ? readFileSync(environment.PUBLICATION_TRUST_MANIFEST_FILE, "utf8") : environment.PUBLICATION_TRUST_MANIFEST_JSON;
  const domain = environment.PUBLICATION_TRUST_DOMAIN;
  const deployment = environment.ATHYPER_ENV;
  if (enabled && deployment !== "local" && deployment !== "staging" && deployment !== "production")
    throw Error("PUBLICATION_TRUST_ENVIRONMENT_REQUIRED");
  if (raw === undefined && domain === undefined) {
    if (enabled && (deployment === "staging" || deployment === "production")) throw Error("PUBLICATION_TRUST_CONFIGURATION_REQUIRED");
    return undefined;
  }
  if (!raw || !domain || (domain !== "dev" && domain !== "production")) throw Error("PUBLICATION_TRUST_CONFIGURATION_INVALID");
  if ((domain === "dev" && deployment !== "local") || (domain === "production" && deployment !== "staging" && deployment !== "production")) throw Error("PUBLICATION_TRUST_ENVIRONMENT_MISMATCH");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw Error("PUBLICATION_TRUST_MANIFEST_JSON_INVALID"); }
  const manifest = parsePublicationTrustManifest(value);
  if (manifest.schema === "athyper.dev-publication-trust/1" && (deployment !== "local" || domain !== "dev")) throw Error("PUBLICATION_TRUST_ENVIRONMENT_MISMATCH");
  return Object.freeze({ domain, manifest });
}
