import { validatePlatformAuthority } from "../composition/shared/identity/platform-authority.js";

/** Separate configuration vocabulary: no fallback to tenant API credentials. */
export function readControlPlaneConfiguration(environment: NodeJS.ProcessEnv) {
  const required = (key: string) => {
    const value = environment[key]?.trim();
    if (!value) throw Error(`CONTROL_PLANE_CONFIGURATION_REQUIRED:${key}`);
    return value;
  };
  if (
    required("ATHYPER_ENV") !== "local" ||
    required("ATHYPER_INSTANCE") !== "dev" ||
    required("ATHYPER_DOMAIN_SUFFIX") !== "dev.athyper.test"
  )
    throw Error("CONTROL_PLANE_DEV_ONLY");
  const authority = validatePlatformAuthority({
    tenantId: required("PLATFORM_AUTHORITY_TENANT_ID"),
    realmKey: required("PLATFORM_CONTROL_REALM"),
    issuer: required("PLATFORM_CONTROL_ISSUER_URL"),
    audience: required("PLATFORM_CONTROL_AUDIENCE"),
  });
  if (
    authority.issuer !== "https://iam.dev.athyper.test/realms/platform-control"
  )
    throw Error("CONTROL_PLANE_DEV_ISSUER_REQUIRED");
  const port = Number(environment.PLATFORM_CONTROL_PORT ?? "4010");
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw Error("CONTROL_PLANE_PORT_INVALID");
  const listenHost = environment.PLATFORM_CONTROL_LISTEN_HOST ?? "127.0.0.1";
  if (!["127.0.0.1", "0.0.0.0"].includes(listenHost))
    throw Error("CONTROL_PLANE_LISTEN_HOST_INVALID");
  const secretProvider =
    environment.PLATFORM_CONTROL_SECRET_PROVIDER ?? "files";
  if (!["files", "infisical"].includes(secretProvider))
    throw Error("CONTROL_PLANE_SECRET_PROVIDER_INVALID");
  const secretStore =
    secretProvider === "infisical"
      ? {
          tokenFile: required("PLATFORM_CONTROL_INFISICAL_TOKEN_FILE"),
          workspaceId: required("PLATFORM_CONTROL_INFISICAL_PROJECT_ID"),
          endpoint: "https://secrets.dev.athyper.test:8443",
        }
      : undefined;
  const commandKeys = [
    "PLATFORM_CONTROL_COMMAND_ISSUER_DATABASE_URL_FILE",
    "PLATFORM_CONTROL_COMMAND_APPLICATION_DATABASE_URL_FILE",
    "PLATFORM_CONTROL_COMMAND_APPLICATION_LOGIN",
    "PLATFORM_CONTROL_COMMAND_LABEL_POLICY_FILE",
  ] as const;
  const productCommands = commandKeys.some(
    (key) => environment[key] !== undefined,
  )
    ? {
        issuerDatabaseUrlFile: required(commandKeys[0]),
        applicationDatabaseUrlFile: required(commandKeys[1]),
        applicationLogin: required(commandKeys[2]),
        labelPolicyFile: required(commandKeys[3]),
      }
    : undefined;
  const referenceResourcePolicyFile =
    environment.PLATFORM_CONTROL_REFERENCE_RESOURCE_POLICY_FILE?.trim();
  if (
    environment.PLATFORM_CONTROL_REFERENCE_RESOURCE_POLICY_FILE !== undefined &&
    (!referenceResourcePolicyFile || !productCommands)
  )
    throw Error("CONTROL_REFERENCE_CONFIGURATION_REQUIRED");
  const sourceDirectory =
      environment.PLATFORM_CONTROL_RESOURCE_SOURCE_DIRECTORY?.trim(),
    descriptorHash =
      environment.PLATFORM_CONTROL_RESOURCE_DESCRIPTOR_HASH?.trim();
  if (
    (sourceDirectory || descriptorHash) &&
    (!sourceDirectory ||
      !descriptorHash ||
      !/^\/[\s\S]+/.test(sourceDirectory) ||
      !/^[a-f0-9]{64}$/.test(descriptorHash))
  )
    throw Error("CONTROL_RESOURCE_PRODUCER_CONFIGURATION_INVALID");
  return Object.freeze({
    authority,
    port,
    productCommands,
    referenceResourcePolicyFile,
    resourceProducer:
      sourceDirectory && descriptorHash
        ? { sourceDirectory, descriptorHash }
        : undefined,
    listenHost,
    secretStore,
    databaseUrlFile: required("PLATFORM_CONTROL_DATABASE_URL_FILE"),
    jwksUrl:
      environment.PLATFORM_CONTROL_INTERNAL_JWKS === "1"
        ? "http://iam:8080/realms/platform-control/protocol/openid-connect/certs"
        : authority.issuer + "/protocol/openid-connect/certs",
    // A separate process consumes mounted, least-privileged runtime credentials.
    trustManifestFile: required("PLATFORM_CONTROL_TRUST_MANIFEST_FILE"),
    signingKeyId: required("PLATFORM_CONTROL_SIGNING_KEY_ID"),
    privateKeyFile: secretStore
      ? undefined
      : required("PLATFORM_CONTROL_SIGNING_KEY_FILE"),
    publicKeyFile: secretStore
      ? undefined
      : required("PLATFORM_CONTROL_VERIFICATION_KEY_FILE"),
  });
}
