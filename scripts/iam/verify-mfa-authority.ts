import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

async function source(path: string): Promise<string> {
  return readFile(resolve(root, path), "utf8");
}

function executable(contents: string): string {
  return contents
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function requireText(label: string, contents: string, text: string): void {
  if (!contents.includes(text)) throw new Error(`${label} is missing required contract: ${text}`);
}

function forbidText(label: string, contents: string, text: string): void {
  if (contents.includes(text)) throw new Error(`${label} still contains retired local MFA authority: ${text}`);
}

async function main(): Promise<void> {
  const [routes, sync, ddl, realmText, sessionPlane, challenge, mfaSection] = await Promise.all([
    source("server/packages/services/iam/routes/mfa.routes.ts"),
    source("server/packages/services/iam/mfa/mfa-sync.service.ts"),
    source("server/db/ddl/control/01_tables.sql"),
    source("stack/config/iam/realm-athyper.json"),
    source("packages/shared/platform-auth/session-plane/src/index.ts"),
    source("packages/shared/platform-auth/identity-gate/src/mfa-challenge-client.tsx"),
    source("apps/neon/app/(shell)/settings/_sections/mfa-section.tsx"),
  ]);

  const routeCode = executable(routes);
  const syncCode = executable(sync);
  const challengeCode = executable(challenge);
  const mfaSectionCode = executable(mfaSection);

  requireText("TOTP AIA route", routeCode, '"CONFIGURE_TOTP"');
  requireText("WebAuthn AIA route", routeCode, '"webauthn-register"');
  requireText("Keycloak evidence gate", routeCode, '"KEYCLOAK_STEP_UP_REQUIRED"');
  requireText("MFA mirror authority", syncCode, 'authority: "keycloak"');
  requireText("MFA table authority", ddl, "authority           text");
  requireText("MFA table authority constraint", ddl, "mfa_config_authority_chk");
  requireText("Neon/Mesh conditional flow", realmText, '"flowAlias": "Browser - Conditional 2FA"');
  requireText("Admin mandatory second factor", realmText, '"flowAlias": "admin-mfa-required second factor"');
  requireText("Admin OTP execution", realmText, '"authenticator": "auth-otp-form"');
  requireText("Admin WebAuthn execution", realmText, '"authenticator": "webauthn-authenticator"');
  requireText("Neon policy", sessionPlane, 'mandatoryMfa: false');
  requireText("Mesh policy", sessionPlane, 'mandatoryMfa: false');
  requireText("Admin policy", sessionPlane, 'mandatoryMfa: true');
  requireText("Keycloak MFA challenge UI", challengeCode, "Continue with Keycloak");
  requireText("Keycloak TOTP settings UI", mfaSectionCode, "Keycloak securely generates");

  for (const retired of [
    "createTotpEnrollmentService",
    "totp.verifyCode",
    "syncPendingTotp",
    "/iam/mfa/webauthn/assert",
    "credential_hash",
    "secret_base32",
    "qr_svg",
  ]) {
    forbidText("MFA implementation", routeCode + syncCode + challengeCode + mfaSectionCode, retired);
  }
  forbidText("Keycloak credential sync", syncCode, "credentialData");
  forbidText("Keycloak credential sync", syncCode, "secretData");

  if (existsSync(resolve(root, "server/packages/services/iam/mfa/totp-enrollment.service.ts"))) {
    throw new Error("The retired local TOTP enrollment service still exists.");
  }

  const realm = JSON.parse(realmText) as {
    authenticationFlows?: Array<{ alias?: string; authenticationExecutions?: Array<{ flowAlias?: string; requirement?: string }> }>;
  };
  const userForms = realm.authenticationFlows?.find((flow) => flow.alias === "athyper-user-plane-browser forms");
  if (!userForms?.authenticationExecutions?.some((execution) =>
    execution.flowAlias === "Browser - Conditional 2FA" && execution.requirement === "CONDITIONAL")) {
    throw new Error("User-plane browser flow is not conditionally MFA-protected by Keycloak.");
  }
  const admin = realm.authenticationFlows?.find((flow) => flow.alias === "admin-mfa-required");
  if (!admin?.authenticationExecutions?.some((execution) =>
    execution.flowAlias === "admin-mfa-required second factor" && execution.requirement === "REQUIRED")) {
    throw new Error("Admin browser flow does not require its Keycloak second-factor subflow.");
  }

  console.log("Keycloak MFA authority contracts verified.");
}

void main();
