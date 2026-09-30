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
  const [gate, bff, resolver, projectionDdl, identityDdl] = await Promise.all([
    source("packages/platform/iam/identity-gate/src/index.tsx"),
    source("packages/platform/iam/auth-bff/src/index.ts"),
    source("server/packages/platform/iam/src/kysely-identity-context-resolver.ts"),
    source("server/db/ddl/common/authz/03_tables.sql"),
    source("server/db/ddl/common/master/03_platform_tables.sql"),
  ]);

  requireText("identity gate", gate, 'kind: "select-context"');
  requireText("identity gate", gate, "Only active contexts authorized for this identity are shown");
  requireText("identity gate", gate, "safeReturnTo");
  requireText("identity gate", gate, "requiredActions");

  requireText("auth BFF", bff, "sanitizeReturnTo");
  requireText("auth BFF", bff, "config.resolveContexts");
  requireText("auth BFF", bff, 'AuthFlowError("auth.context_not_allowed"');
  requireText("auth BFF", bff, "sessionVersion: current.sessionVersion + 1");

  requireText("identity resolver", resolver, "REPEATABLE READ, READ ONLY");
  requireText("identity resolver", resolver, "authz.fn_resolve_active_application_projections");
  requireText("identity resolver", resolver, "master.fn_resolve_principal_identity");
  requireText("identity resolver", resolver, "createKyselyPermissionResolver");

  for (const secretName of ["client_secret", "clientSecret", "access_token", "refresh_token", "saml_signing_key"]) {
    if ((projectionDdl + identityDdl).toLowerCase().includes(secretName.toLowerCase())) {
      throw new Error(`Tenant identity registry must not contain provider secret material: ${secretName}`);
    }
  }

  requireText("application projection registry", projectionDdl, "authz.application_projection");
  requireText("application projection registry", projectionDdl, "external_organization_id");
  requireText("principal identity registry", identityDdl, "master.principal_identity_binding");
  requireText("principal identity registry", identityDdl, "subject_id");

  console.log("Identity-first discovery contracts verified.");
}

void main();
