#!/usr/bin/env tsx
/**
 * Realm Strict-MFA Verification (CI gate)
 *
 * Asserts that stack/config/iam/realm-athyper.json continues to enforce
 * Keycloak-side MFA for the admin plane. Each rule maps to a specific
 * regression we have already paid for at runtime — failing any of them
 * silently breaks the strict admin-MFA contract from rb-18.
 *
 * Rules:
 *
 *   1. The `acr` client scope contains an `oidc-amr-mapper` with
 *      id.token.claim=true. Without it, KC does not emit the `amr` claim.
 *      The BFF still trusts its forced admin Keycloak login path, but this
 *      mapper remains important for token observability and regression checks.
 *
 *   2. The `admin-web` client lists `acr` in defaultClientScopes. Without
 *      it the mapper from rule 1 does not apply to admin-web tokens.
 *
 *   3. The `admin-web` client has authenticationFlowBindingOverrides.browser
 *      pointing at the `admin-mfa-required` flow. Without it admin-web
 *      falls back to the default browser flow, which only triggers OTP for
 *      already-enrolled users.
 *
 *   4. The `admin-mfa-required` top-level flow exists and points at the
 *      `admin-mfa-required forms` sub-flow.
 *
 *   5. The `admin-mfa-required forms` sub-flow contains `auth-otp-form`
 *      with requirement=REQUIRED. Demotion to ALTERNATIVE or CONDITIONAL
 *      lets password-only admin logins succeed.
 *
 * Usage:
 *   npx tsx server/scripts/verify-realm-strict-mfa.ts
 *
 *   # JSON output for CI:
 *   npx tsx server/scripts/verify-realm-strict-mfa.ts --json
 *
 * Exit code:
 *   0 — every rule passes
 *   1 — at least one rule failed (CI red)
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REALM_PATH = resolve(REPO_ROOT, "stack", "config", "iam", "realm-athyper.json");

interface ProtocolMapper {
  name?: string;
  protocolMapper?: string;
  config?: Record<string, string>;
}

interface ClientScope {
  name?: string;
  protocolMappers?: ProtocolMapper[];
}

interface AuthExecution {
  authenticator?: string;
  authenticatorFlow?: boolean;
  flowAlias?: string;
  requirement?: string;
}

interface AuthFlow {
  id?: string;
  alias?: string;
  topLevel?: boolean;
  authenticationExecutions?: AuthExecution[];
}

interface Client {
  clientId?: string;
  defaultClientScopes?: string[];
  authenticationFlowBindingOverrides?: Record<string, string>;
}

interface Realm {
  clients?: Client[];
  clientScopes?: ClientScope[];
  authenticationFlows?: AuthFlow[];
}

type CheckResult = { name: string; ok: true } | { name: string; ok: false; reason: string };

function loadRealm(): Realm {
  const raw = readFileSync(REALM_PATH, "utf8");
  return JSON.parse(raw) as Realm;
}

function checkAmrMapperOnAcrScope(realm: Realm): CheckResult {
  const name = "acr client scope includes oidc-amr-mapper on id_token";
  const acr = realm.clientScopes?.find((scope) => scope.name === "acr");
  if (!acr) return { name, ok: false, reason: "no client scope named 'acr'" };
  const mapper = acr.protocolMappers?.find((m) => m.protocolMapper === "oidc-amr-mapper");
  if (!mapper) {
    return { name, ok: false, reason: "no protocolMapper of type oidc-amr-mapper on the acr scope" };
  }
  if (mapper.config?.["id.token.claim"] !== "true") {
    return { name, ok: false, reason: "oidc-amr-mapper has id.token.claim != 'true'" };
  }
  return { name, ok: true };
}

function checkAdminWebConsumesAcr(realm: Realm): CheckResult {
  const name = "admin-web client includes 'acr' in defaultClientScopes";
  const client = realm.clients?.find((c) => c.clientId === "admin-web");
  if (!client) return { name, ok: false, reason: "no client with clientId='admin-web'" };
  if (!client.defaultClientScopes?.includes("acr")) {
    return { name, ok: false, reason: "'acr' missing from defaultClientScopes" };
  }
  return { name, ok: true };
}

function checkAdminWebFlowOverride(realm: Realm): CheckResult {
  const name = "admin-web client overrides browser flow to admin-mfa-required";
  const client = realm.clients?.find((c) => c.clientId === "admin-web");
  if (!client) return { name, ok: false, reason: "no client with clientId='admin-web'" };
  const override = client.authenticationFlowBindingOverrides?.["browser"];
  if (!override) {
    return { name, ok: false, reason: "authenticationFlowBindingOverrides.browser is not set" };
  }
  const targetFlow = realm.authenticationFlows?.find((f) => f.alias === "admin-mfa-required");
  if (!targetFlow) {
    return { name, ok: false, reason: "no authenticationFlow with alias='admin-mfa-required'" };
  }
  if (!targetFlow.id) {
    return { name, ok: false, reason: "admin-mfa-required flow has no id to compare against browser override" };
  }
  if (override !== targetFlow.id) {
    return {
      name,
      ok: false,
      reason: `browser override points to '${override}' but admin-mfa-required id is '${targetFlow.id}'`,
    };
  }
  return { name, ok: true };
}

function checkAdminMfaRequiredFlowExists(realm: Realm): CheckResult {
  const name = "admin-mfa-required top-level flow references its forms sub-flow";
  const flow = realm.authenticationFlows?.find((f) => f.alias === "admin-mfa-required");
  if (!flow) return { name, ok: false, reason: "no authenticationFlow with alias='admin-mfa-required'" };
  if (flow.topLevel !== true) return { name, ok: false, reason: "admin-mfa-required is not topLevel" };
  const refsForms = flow.authenticationExecutions?.some(
    (e) => e.authenticatorFlow === true && e.flowAlias === "admin-mfa-required forms",
  );
  if (!refsForms) {
    return { name, ok: false, reason: "admin-mfa-required does not invoke 'admin-mfa-required forms'" };
  }
  return { name, ok: true };
}

function checkOtpFormRequired(realm: Realm): CheckResult {
  const name = "admin-mfa-required forms keeps auth-otp-form as REQUIRED";
  const flow = realm.authenticationFlows?.find((f) => f.alias === "admin-mfa-required forms");
  if (!flow) {
    return { name, ok: false, reason: "no sub-flow with alias='admin-mfa-required forms'" };
  }
  const otp = flow.authenticationExecutions?.find((e) => e.authenticator === "auth-otp-form");
  if (!otp) {
    return { name, ok: false, reason: "auth-otp-form execution is missing from the forms sub-flow" };
  }
  if (otp.requirement !== "REQUIRED") {
    return {
      name,
      ok: false,
      reason: `auth-otp-form requirement is '${otp.requirement ?? "(undefined)"}' (expected REQUIRED)`,
    };
  }
  return { name, ok: true };
}

function main(): void {
  const json = process.argv.includes("--json");
  const realm = loadRealm();

  const checks: CheckResult[] = [
    checkAmrMapperOnAcrScope(realm),
    checkAdminWebConsumesAcr(realm),
    checkAdminWebFlowOverride(realm),
    checkAdminMfaRequiredFlowExists(realm),
    checkOtpFormRequired(realm),
  ];

  const failed = checks.filter((c): c is Extract<CheckResult, { ok: false }> => !c.ok);

  if (json) {
    console.log(JSON.stringify({
      realm: REALM_PATH,
      passed: checks.length - failed.length,
      failed: failed.length,
      results: checks,
    }, null, 2));
  } else {
    for (const check of checks) {
      if (check.ok) {
        console.log(`  ok    ${check.name}`);
      } else {
        console.error(`  FAIL  ${check.name}\n        ${check.reason}`);
      }
    }
    console.log(
      failed.length === 0
        ? `\nrealm-strict-mfa: ${checks.length}/${checks.length} checks passed`
        : `\nrealm-strict-mfa: ${failed.length} of ${checks.length} checks failed — see rb-18-admin-mfa-keycloak-fallback.md`,
    );
  }

  process.exit(failed.length === 0 ? 0 : 1);
}

main();
