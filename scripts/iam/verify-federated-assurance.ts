#!/usr/bin/env tsx
/**
 * Phase 6 federated-assurance regression gate.
 *
 * The realm must publish broker provenance and the external OIDC/SAML
 * assurance evidence consumed by @athyper/auth-common. The application still
 * evaluates the evidence against the tenant policy; these checks only prevent
 * a realm import from silently dropping the claims.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const realmPath = resolve(root, "stack", "config", "iam", "realm-athyper.json");

type Mapper = {
  protocolMapper?: string;
  config?: Record<string, string>;
};

type Scope = {
  name?: string;
  protocolMappers?: Mapper[];
};

type Execution = {
  authenticator?: string;
  authenticatorFlow?: boolean;
  flowAlias?: string;
  requirement?: string;
  priority?: number;
};

type Flow = {
  alias?: string;
  topLevel?: boolean;
  authenticationExecutions?: Execution[];
};

type Realm = {
  clientScopes?: Scope[];
  defaultDefaultClientScopes?: string[];
  authenticationFlows?: Flow[];
};

function loadRealm(): Realm {
  return JSON.parse(readFileSync(realmPath, "utf8")) as Realm;
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function main(): void {
  const realm = loadRealm();
  const scope = realm.clientScopes?.find((entry) => entry.name === "federated-assurance");
  if (!scope) fail("federated-assurance client scope is missing");
  if (!realm.defaultDefaultClientScopes?.includes("federated-assurance")) {
    fail("federated-assurance is not a default client scope");
  }

  const requiredClaims = new Set([
    "athyper.identity_provider",
    "athyper.external_acr",
    "athyper.external_amr",
    "athyper.saml_authn_context",
    "athyper.mfa_source",
  ]);
  for (const claim of requiredClaims) {
    const mapper = scope!.protocolMappers?.find((entry) => entry.config?.["claim.name"] === claim);
    if (!mapper || mapper.protocolMapper !== "oidc-usersessionmodel-note-mapper") {
      fail(`${claim} must be a Keycloak user-session-note mapper`);
    }
    if (mapper.config?.["access.token.claim"] !== "true" || mapper.config?.["id.token.claim"] !== "true") {
      fail(`${claim} must be emitted in both access and ID tokens`);
    }
  }

  const admin = realm.authenticationFlows?.find((entry) => entry.alias === "admin-mfa-required");
  if (!admin) fail("admin-mfa-required flow is missing");
  const secondFactor = realm.authenticationFlows?.find((entry) => entry.alias === "admin-mfa-required second factor");
  if (!secondFactor) fail("admin-mfa-required second factor flow is missing");
  const requiredSecondFactor = admin!.authenticationExecutions?.some(
    (entry) => entry.authenticatorFlow === true
      && entry.flowAlias === "admin-mfa-required second factor"
      && entry.requirement === "REQUIRED",
  );
  if (!requiredSecondFactor) fail("Admin second-factor subflow is not REQUIRED");
  const hasPhishingResistantOption = secondFactor!.authenticationExecutions?.some(
    (entry) => entry.authenticator === "webauthn-authenticator"
      && ["ALTERNATIVE", "REQUIRED"].includes(entry.requirement ?? ""),
  );
  if (!hasPhishingResistantOption) fail("Admin second-factor flow has no WebAuthn option");
  const webauthnPriority = secondFactor!.authenticationExecutions?.find(
    (entry) => entry.authenticator === "webauthn-authenticator",
  )?.priority ?? Number.POSITIVE_INFINITY;
  const otpPriority = secondFactor!.authenticationExecutions?.find(
    (entry) => entry.authenticator === "auth-otp-form",
  )?.priority ?? Number.NEGATIVE_INFINITY;
  if (webauthnPriority >= otpPriority) fail("Admin second-factor flow must prefer WebAuthn before OTP");

  console.log("Federated assurance realm verification passed.");
}

main();
