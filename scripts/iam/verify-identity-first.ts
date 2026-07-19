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
  const [gate, bff, resolver, registry] = await Promise.all([
    source("packages/shared/platform-auth/identity-gate/src/login-gate-client.tsx"),
    source("packages/shared/platform-auth/auth-bff/src/index.ts"),
    source("server/packages/services/iam/discovery/discovery.service.ts"),
    source("server/db/ddl/master/01w_tables_tenant_identity_registry.sql"),
  ]);

  requireText("identity gate", gate, "Work email or user ID");
  requireText("identity gate", gate, "candidate.authMethodLabel");
  requireText("identity gate", gate, "Organization route found");
  requireText("identity gate", gate, "More than one organization matches this work email domain.");

  requireText("auth BFF", bff, "body[\"action\"] === \"select\"");
  requireText("auth BFF", bff, "const returnUrl = sanitizeReturnUrl(payload.returnUrl");
  requireText("auth BFF", bff, "status: verifiedDomainRoute ? \"routed\" : \"verified\"");
  requireText("auth BFF", bff, "resolutionKind === \"identity\"");

  requireText("tenant resolver", resolver, "tenant_identity_domain");
  requireText("tenant resolver", resolver, "resolution_kind");
  requireText("tenant resolver", resolver, "result.rows.length > 0 || identifier.kind !== \"email\"");

  for (const secretName of ["client_secret", "clientSecret", "access_token", "refresh_token", "saml_signing_key"]) {
    if (registry.toLowerCase().includes(secretName.toLowerCase())) {
      throw new Error(`Tenant identity registry must not contain provider secret material: ${secretName}`);
    }
  }

  requireText("tenant identity provider registry", registry, "keycloak_alias");
  requireText("tenant identity provider registry", registry, "allowed_planes");
  requireText("tenant identity domain registry", registry, "verification_status");

  console.log("Identity-first discovery contracts verified.");
}

void main();
