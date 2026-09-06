import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

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
  const [mfaRoute, realmText, sessionPlane, authBff, authEnvironment, trustedDeviceContract, authFoundationContract, runtimeIam, otpFactory, stepUpCondition] = await Promise.all([
    source("apps/neon/app/api/auth/mfa/verify/route.ts"),
    source("deploy/config/iam/realm-athyper.json"),
    source("packages/platform/iam/session/src/index.ts"),
    source("packages/platform/iam/auth-bff/src/index.ts"),
    source("packages/platform/iam/auth-bff/src/environment.ts"),
    source("tests/contracts/trusted-device-authentication.test.ts"),
    source("tests/contracts/auth-session-foundation.test.ts"),
    source("server/apps/platform-host/src/composition/register-platform.ts"),
    source("deploy/config/iam/extensions/iam-presentation-context/src/main/java/com/athyper/iam/presentation/IamPresentationOtpFormFactory.java"),
    source("deploy/config/iam/extensions/iam-presentation-context/src/main/java/com/athyper/iam/presentation/IamMfaStepUpCondition.java"),
  ]);

  const routeCode = executable(mfaRoute);
  const authBffCode = executable(authBff);
  const otpFactoryCode = executable(otpFactory);
  const stepUpConditionCode = executable(stepUpCondition);

  requireText("MFA route delegates to the BFF", routeCode, "auth.mfaVerify");
  requireText("Neon/Mesh organization MFA flow", realmText, '"flowAlias": "athyper-user-plane-step-up-2fa"');
  requireText("Athyper OTP execution", realmText, '"authenticator": "athyper-iam-otp-form"');
  requireText("First-time OTP enrollment capability", otpFactoryCode, "boolean isUserSetupAllowed()");
  requireText("First-time OTP enrollment enabled", otpFactoryCode, "return true;");
  requireText("Fresh step-up condition", stepUpConditionCode, "OIDCLoginProtocol.MAX_AGE_PARAM");
  requireText("BFF step-up transaction marker", authBffCode, 'purpose: "step_up"');
  requireText("BFF fresh-authentication request", authBffCode, 'max_age: "0"');
  requireText("BFF session binding", authBffCode, "sessionIdHash");
  requireText("BFF issuer-derived MFA proof", authBffCode, "validateStepUpAssurance(identity)");
  requireText("Password-only proof rejection contract", authFoundationContract, "rejects password-only step-up tokens");
  requireText("Session elevation expiry", sessionPlane, 'session.assurance === "elevated"');
  requireText("Trusted-device runtime verifier", authEnvironment, "/api/iam/trusted-devices/verify");
  requireText("Trusted-device runtime enrollment client", authEnvironment, "/api/iam/trusted-devices");
  requireText("Trusted-device exact-plane enrollment", runtimeIam, 'path: "/api/iam/trusted-devices"');
  requireText("Trusted-device runtime MFA proof", runtimeIam, "hasSecondFactor(context.authenticationMethods)");
  requireText("Trusted-device hash-only persistence", runtimeIam, "device_token_hash");
  requireText("Trusted-device registration audit", runtimeIam, "iam.trusted_device.registered");
  requireText("Exact trusted-device contract", trustedDeviceContract, "exact-device decision elevates the session");

  for (const retired of [
    "createTotpEnrollmentService",
    "totp.verifyCode",
    "syncPendingTotp",
    "/iam/mfa/webauthn/assert",
    "credential_hash",
    "secret_base32",
    "qr_svg",
  ]) {
    forbidText("MFA implementation", routeCode + authBffCode + authEnvironment, retired);
  }

  const realm = JSON.parse(realmText) as {
    clients?: Array<{ clientId?: string; defaultClientScopes?: string[] }>;
    clientScopes?: Array<{ name?: string; protocolMappers?: Array<{ protocolMapper?: string; config?: Record<string, string> }> }>;
    authenticationFlows?: Array<{
      alias?: string;
      authenticationExecutions?: Array<{
        authenticator?: string;
        flowAlias?: string;
        requirement?: string;
        userSetupAllowed?: boolean;
      }>;
    }>;
    authenticatorConfig?: Array<{ alias?: string; config?: Record<string, string> }>;
    requiredActions?: Array<{ alias?: string; enabled?: boolean }>;
  };
  const assuranceScope = realm.clientScopes?.find((scope) => scope.name === "acr");
  const amrMapper = assuranceScope?.protocolMappers?.find((mapper) => mapper.protocolMapper === "oidc-amr-mapper");
  if (amrMapper?.config?.["id.token.claim"] !== "true") throw new Error("The Keycloak AMR mapper is not enabled for ID tokens.");
  for (const clientId of ["neon-web", "mesh-web", "studio-web"]) {
    const client = realm.clients?.find((candidate) => candidate.clientId === clientId);
    if (!client?.defaultClientScopes?.includes("acr")) throw new Error(`${clientId} does not receive the AMR/ACR client scope by default.`);
  }
  for (const [alias, expected] of [["athyper-amr-otp", "otp"], ["athyper-amr-webauthn", "webauthn"]] as const) {
    if (!realm.authenticatorConfig?.some((configuration) => configuration.alias === alias && configuration.config?.["default.reference.value"] === expected)) throw new Error(`${alias} does not emit the expected AMR reference.`);
  }
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
  const adminFlow = realm.authenticationFlows?.find((flow) => flow.alias === "admin-mfa-required");
  if (!adminFlow?.authenticationExecutions?.some((execution) => execution.flowAlias === "admin-mfa-required second factor" && execution.requirement === "REQUIRED")) {
    throw new Error("Admin browser flow does not require its second-factor subflow.");
  }
  const adminSecondFactor = realm.authenticationFlows?.find((flow) => flow.alias === "admin-mfa-required second factor");
  if (!adminSecondFactor?.authenticationExecutions?.some((execution) => execution.authenticator === "athyper-iam-otp-form" && execution.requirement === "REQUIRED" && execution.userSetupAllowed === true)) {
    throw new Error("Admin second-factor flow lacks enrollment-aware OTP.");
  }
  if (!realm.requiredActions?.some((action) => action.alias === "CONFIGURE_TOTP" && action.enabled === true)) {
    throw new Error("CONFIGURE_TOTP required action is not enabled.");
  }

  console.log("Keycloak MFA authority contracts verified.");
}

void main();
