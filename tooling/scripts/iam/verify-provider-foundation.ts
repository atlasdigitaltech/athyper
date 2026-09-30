import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

async function source(path: string): Promise<string> {
  return readFile(resolve(root, path), "utf8");
}

function requireText(label: string, contents: string, text: string): void {
  if (!contents.includes(text)) throw new Error(`${label} is missing required contract: ${text}`);
}

async function main(): Promise<void> {
  const [provider, ddl, route, realm, env] = await Promise.all([
    source("server/packages/platform/iam/src/keycloak-identity-provider.ts"),
    source("server/db/ddl/planes/studio/trustiam/03_tables.sql"),
    source("server/packages/platform/iam/src/iam-routes.ts"),
    source("deploy/config/iam/realm-athyper.json"),
    source("server/.env.example"),
  ]);

  requireText("Keycloak provider", provider, "credentialReference");
  requireText("Keycloak provider", provider, "this.config.secrets.resolve");
  requireText("Keycloak organization membership", provider, "JSON.stringify(input.providerSubject)");
  requireText("Keycloak plane authorization boundary", provider, "Application authorization remains plane-local");
  requireText("IAM provisioning route", route, 'permission: "iam.provisioning.create"');
  requireText("provider registry DDL", ddl, "trustiam.organization_provider");
  requireText("provider registry DDL", ddl, "routing_contract");
  requireText("environment", env, "LINKEDIN_CLIENT_ID=");
  requireText("environment", env, "ATHYPER_ENTERPRISE_WINDOWS_AUTH_ENABLED=false");
  requireText("realm", realm, "${LINKEDIN_CLIENT_SECRET}");
  for (const publicUrl of ["NEON_PUBLIC_WEB_URL", "MESH_PUBLIC_WEB_URL"]) requireText("realm", realm, publicUrl);

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
    if (ddl.toLowerCase().includes(secretName.toLowerCase())) {
      throw new Error(`Tenant provider registry must not store provider secret material: ${secretName}`);
    }
  }

  console.log("Tenant identity-provider foundation contracts verified.");
}

void main();
