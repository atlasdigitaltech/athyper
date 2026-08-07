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
  const [routes, sync, ddl, realmText, sessionPlane, challenge, mfaSection, authBff, otpFactory, stepUpCondition] = await Promise.all([
    source("server/packages/services/iam/routes/mfa.routes.ts"),
    source("server/packages/services/iam/mfa/mfa-sync.service.ts"),
    source("server/db/ddl/planes/neon/control/03_tables.sql"),
    source("stack/config/iam/realm-athyper.json"),
    source("packages/shared/platform-auth/session-plane/src/index.ts"),
    source("packages/shared/platform-auth/identity-gate/src/mfa-challenge-client.tsx"),
    source("apps/neon/app/(shell)/settings/_sections/mfa-section.tsx"),
    source("packages/shared/platform-auth/auth-bff/src/index.ts"),
    source("stack/config/iam/extensions/iam-presentation-context/src/main/java/com/athyper/iam/presentation/IamPresentationOtpFormFactory.java"),
    source("stack/config/iam/extensions/iam-presentation-context/src/main/java/com/athyper/iam/presentation/IamMfaStepUpCondition.java"),
  ]);

  const routeCode = executable(routes);
  const syncCode = executable(sync);
  const challengeCode = executable(challenge);
  const mfaSectionCode = executable(mfaSection);
  const authBffCode = executable(authBff);
  const otpFactoryCode = executable(otpFactory);
  const stepUpConditionCode = executable(stepUpCondition);

  requireText("TOTP AIA route", routeCode, '"CONFIGURE_TOTP"');
  requireText("WebAuthn AIA route", routeCode, '"webauthn-register"');
  requireText("Keycloak evidence gate", routeCode, '"KEYCLOAK_STEP_UP_REQUIRED"');
  requireText("MFA mirror authority", syncCode, 'authority: "keycloak"');
  requireText("MFA table authority", ddl, "authority           text");
  requireText("MFA table authority constraint", ddl, "mfa_config_authority_chk");
  requireText("Neon/Mesh organization MFA flow", realmText, '"flowAlias": "athyper-user-plane-step-up-2fa"');
  requireText("Athyper OTP execution", realmText, '"authenticator": "athyper-iam-otp-form"');
  requireText("First-time OTP enrollment capability", otpFactoryCode, "boolean isUserSetupAllowed()");
  requireText("First-time OTP enrollment enabled", otpFactoryCode, "return true;");
  requireText("Fresh step-up condition", stepUpConditionCode, "OIDCLoginProtocol.MAX_AGE_PARAM");
  requireText("BFF MFA step-up marker", authBffCode, '"mfa_step_up"');
  requireText("BFF fresh-authentication request", authBffCode, 'finalUrl.searchParams.set("max_age", "0")');
  requireText("Neon policy", sessionPlane, 'mandatoryMfa: false');
  requireText("Mesh policy", sessionPlane, 'mandatoryMfa: false');
  requireText("Admin policy", sessionPlane, 'mandatoryMfa: true');
  requireText("Keycloak MFA challenge UI", challengeCode, "Continue to verification");
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
    authenticationFlows?: Array<{
      alias?: string;
      authenticationExecutions?: Array<{
        authenticator?: string;
        flowAlias?: string;
        requirement?: string;
        userSetupAllowed?: boolean;
      }>;
    }>;
    requiredActions?: Array<{ alias?: string; enabled?: boolean }>;
  };
  const userForms = realm.authenticationFlows?.find((flow) => flow.alias === "athyper-user-plane-browser forms");
  if (!userForms?.authenticationExecutions?.some((execution) =>
    execution.flowAlias === "athyper-user-plane-step-up-2fa" && execution.requirement === "CONDITIONAL")) {
    throw new Error("User-plane browser flow is not protected by the organization-driven fresh-MFA subflow.");
  }
  const userStepUp = realm.authenticationFlows?.find((flow) => flow.alias === "athyper-user-plane-step-up-2fa");
  if (!userStepUp?.authenticationExecutions?.some((execution) =>
    execution.authenticator === "athyper-mfa-step-up-condition" && execution.requirement === "REQUIRED")) {
    throw new Error("User-plane MFA subflow does not require the fresh step-up condition.");
  }
  if (!userStepUp?.authenticationExecutions?.some((execution) =>
    execution.authenticator === "athyper-iam-otp-form"
      && execution.requirement === "REQUIRED"
      && execution.userSetupAllowed === true)) {
    throw new Error("User-plane MFA subflow does not challenge or enroll OTP.");
  }
  const adminForms = realm.authenticationFlows?.find((flow) => flow.alias === "admin-mfa-required forms");
  if (!adminForms?.authenticationExecutions?.some((execution) =>
    execution.authenticator === "athyper-iam-otp-form"
      && execution.requirement === "REQUIRED"
      && execution.userSetupAllowed === true)) {
    throw new Error("Admin browser flow does not require an enrollment-aware OTP execution.");
  }
  if (!realm.requiredActions?.some((action) => action.alias === "CONFIGURE_TOTP" && action.enabled === true)) {
    throw new Error("CONFIGURE_TOTP required action is not enabled.");
  }

  console.log("Keycloak MFA authority contracts verified.");
}

void main();
