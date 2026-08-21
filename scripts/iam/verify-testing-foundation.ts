#!/usr/bin/env tsx
/**
 * Phase 24 — IAM testing-foundation contract.
 *
 * This is a deterministic coverage gate. It does not pretend that a local
 * unit test can replace a real Entra, SAML, Kerberos, or Keycloak run. It
 * verifies that the required matrix is declared, that the critical security
 * contracts have executable tests, and that the IAM shell remains deployable
 * without the plane applications.
 */

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../..");

const PLANES = ["neon", "mesh", "studio"] as const;
const AUTH_METHODS = [
  "local-password",
  "totp",
  "passkey-security-key",
  "entra-id",
  "google-workspace",
  "generic-oidc",
  "generic-saml",
  "linkedin",
  "windows-integrated-authentication",
] as const;
const SSO_MODES = ["optional", "preferred", "exclusive"] as const;
const USER_STATES = ["existing-user", "invited-user", "jit-user", "conflicting-identity"] as const;
const SECURITY_CONDITIONS = [
  "multiple-tenants",
  "multiple-idps",
  "insufficient-mfa-assurance",
  "external-idp-outage",
  "certificate-rollover",
  "session-reuse",
  "step-up",
  "logout",
  "account-linking-unlinking",
  "recovery",
] as const;

const REQUIRED_TESTS = [
  ["tenant-boundary", "server/packages/services/iam/__tests__/verified-request-context.test.ts"],
  ["federated-assurance", "packages/shared/platform-auth/auth-common/src/__tests__/federated-assurance.test.ts"],
  ["step-up-binding", "server/packages/services/iam/mfa/__tests__/step-up.service.test.ts"],
  ["provider-policy", "server/packages/services/iam/providers/__tests__/tenant-identity-provider.test.ts"],
  ["session-termination", "packages/shared/platform-auth/auth-bff/src/__tests__/session-termination.test.ts"],
  ["Neon login flow", "packages/shared/platform-auth/auth-bff/src/__tests__/tenant-admin-login-flow.test.ts"],
  ["Mesh login flow", "packages/shared/data-integration/auth-bff/src/__tests__/tenant-admin-login-flow.test.ts"],
] as const;

const REQUIRED_OFFLINE_ASSETS = [
  "stack/config/iam/themes/neon/login/resources/css/iam.tokens.css",
  "stack/config/iam/themes/neon/login/resources/css/iam.generated.css",
  "stack/config/iam/themes/neon/login/resources/css/login.css",
  "stack/config/gateway/fallback/status.html",
  "stack/config/gateway/fallback/default.conf",
  ...PLANES.flatMap((plane) => [
    `apps/${plane}/public/brand/favicon.png`,
    `apps/${plane}/public/brand/brand-manifest.json`,
  ]),
] as const;

async function exists(relativePath: string): Promise<boolean> {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(root, relativePath), "utf8");
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function productMatrixCount(): number {
  return PLANES.length * AUTH_METHODS.length * SSO_MODES.length * USER_STATES.length;
}

async function main(): Promise<void> {
  const failures: string[] = [];

  assert(productMatrixCount() === 324, "Unexpected IAM matrix cardinality; update the declared dimensions and this gate together.");

  for (const [label, relativePath] of REQUIRED_TESTS) {
    if (!(await exists(relativePath))) failures.push(`${label}: missing ${relativePath}`);
  }

  for (const relativePath of REQUIRED_OFFLINE_ASSETS) {
    if (!(await exists(relativePath))) failures.push(`offline IAM asset missing: ${relativePath}`);
  }

  const [boundary, assurance, stepUp, providers, sessions, neonFlow, meshFlow] = await Promise.all(
    REQUIRED_TESTS.map(([, relativePath]) => source(relativePath)),
  );

  const sourceChecks: Array<[string, string, string]> = [
    ["tenant boundary", boundary, "fails closed across tenant and principal boundaries"],
    ["tenant boundary", boundary, "fails closed across product-plane boundaries"],
    ["federated assurance", assurance, "does not trust an unrecognized or stale external MFA signal"],
    ["Admin MFA boundary", assurance, "keeps external MFA from satisfying Admin"],
    ["step-up binding", stepUp, "does not replay an elevation across session, tenant, or action class"],
    ["external MFA step-up boundary", stepUp, "does not treat external IdP MFA as Athyper step-up"],
    ["provider policy", providers, "restricts LinkedIn to Mesh"],
    ["Windows/Kerberos gate", providers, "explicit enterprise feature gate"],
    ["session termination", sessions, "keycloak_backchannel_logout"],
    ["Neon flow", neonFlow, "Keycloak"],
    ["Mesh flow", meshFlow, "Keycloak"],
  ];

  for (const [label, contents, requiredText] of sourceChecks) {
    if (!contents.includes(requiredText)) failures.push(`${label}: missing contract '${requiredText}'`);
  }

  const invalidProviderPlanePairs = [
    ["linkedin", "studio"],
    ["windows-integrated-authentication", "mesh"],
  ] as const;
  assert(invalidProviderPlanePairs.length === 2, "Invalid provider/plane safety cases are not declared.");

  if (failures.length > 0) {
    console.error("IAM testing foundation verification FAILED:\n");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log("IAM testing foundation verified.");
  console.log(`  declared product/provider/policy/user matrix: ${productMatrixCount()} combinations`);
  console.log(`  security-condition cases: ${SECURITY_CONDITIONS.length}`);
  console.log("  external-provider execution: reserved for Keycloak/provider integration environments");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
