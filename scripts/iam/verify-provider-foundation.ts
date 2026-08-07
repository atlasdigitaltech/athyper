import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

async function source(path: string): Promise<string> {
  return readFile(resolve(root, path), "utf8");
}

function requireText(label: string, contents: string, text: string): void {
  if (!contents.includes(text)) throw new Error(`${label} is missing required contract: ${text}`);
}

async function main(): Promise<void> {
  const [catalog, contract, registryService, ddl, route, realm, env, importScript] = await Promise.all([
    source("server/packages/services/iam/providers/tenant-identity-provider.ts"),
    source("server/packages/services/iam/providers/keycloak-provider.contract.ts"),
    source("server/packages/services/iam/providers/tenant-identity-provider.service.ts"),
    source("server/db/ddl/planes/neon/master/03_tables.sql"),
    source("server/packages/services/iam/routes/identity-provider.routes.ts"),
    source("stack/config/iam/realm-athyper.json"),
    source("stack/env/.env.example"),
    source("stack/scripts/db/session/iam/import-iam.sh"),
  ]);

  for (const providerType of ["generic", "entra-id", "google-workspace", "linkedin", "windows-kerberos"]) {
    requireText("provider catalog", catalog, `"${providerType}"`);
  }
  for (const protocol of ["oidc", "saml", "kerberos"]) requireText("provider catalog", catalog, `"${protocol}"`);
  requireText("provider catalog", catalog, "LinkedIn must always require Athyper MFA");
  requireText("provider catalog", catalog, "ATHYPER_ENTERPRISE_WINDOWS_AUTH_ENABLED=true");
  requireText("Keycloak provisioning contract", contract, "externalClaimsAuthorize: false");
  requireText("Keycloak provisioning contract", contract, "saml-signing-certificate");
  requireText("registry service", registryService, "configurationRef");
  requireText("registry route", route, "IAM.IDP.MANAGE");
  requireText("registry DDL", ddl, "configuration_ref");
  requireText("registry DDL", ddl, "tenant_identity_provider_policy_chk");
  requireText("environment", env, "LINKEDIN_CLIENT_ID=");
  requireText("environment", env, "ATHYPER_ENTERPRISE_WINDOWS_AUTH_ENABLED=false");
  requireText("import script", importScript, "LINKEDIN_CLIENT_SECRET");
  for (const publicUrl of ["NEON_PUBLIC_WEB_URL", "MESH_PUBLIC_WEB_URL", "ADMIN_PUBLIC_WEB_URL"]) {
    requireText("import script", importScript, publicUrl);
  }

  const parsedRealm = JSON.parse(realm) as {
    identityProviders?: Array<{ alias?: string; providerId?: string; enabled?: boolean; trustEmail?: boolean }>;
  };
  const linkedin = parsedRealm.identityProviders?.find((provider) => provider.alias === "linkedin");
  if (
    !linkedin
    || linkedin.providerId !== "linkedin-openid-connect"
    || linkedin.enabled !== false
    || linkedin.trustEmail !== false
  ) {
    throw new Error("Keycloak LinkedIn broker must be present, disabled by default, and must not trust email implicitly.");
  }

  for (const secretName of ["client_secret", "access_token", "refresh_token", "saml_signing_key", "keytab"]) {
    if (ddl.toLowerCase().includes(secretName.toLowerCase()) || registryService.toLowerCase().includes(secretName.toLowerCase())) {
      throw new Error(`Tenant provider registry must not store provider secret material: ${secretName}`);
    }
  }

  console.log("Tenant identity-provider foundation contracts verified.");
}

void main();
