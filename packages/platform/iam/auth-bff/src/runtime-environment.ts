export type RuntimeEnvironmentInput = Readonly<
  Record<string, string | undefined>
>;
export const REQUIRED_BFF_ENVIRONMENT = Object.freeze([
  "APP_ORIGIN",
  "RUNTIME_API_URL",
  "REDIS_URL",
  "KEYCLOAK_BASE_URL",
  "SESSION_TOKEN_ENCRYPTION_KEY",
] as const);
export interface EnvironmentValidation {
  readonly ready: boolean;
  readonly missing: readonly string[];
  readonly invalid: readonly string[];
}
export interface BffRuntimeEnvironment {
  readonly appOrigin: string;
  readonly runtimeApiUrl: string;
  readonly redisUrl: string;
  readonly keycloakBaseUrl: string;
  readonly sessionTokenEncryptionKey: string;
}
export function validateRuntimeEnvironment(
  environment: RuntimeEnvironmentInput = process.env,
): EnvironmentValidation {
  const missing = REQUIRED_BFF_ENVIRONMENT.filter(
    (name) => !environment[name]?.trim(),
  );
  const invalid: string[] = [];
  for (const name of [
    "APP_ORIGIN",
    "RUNTIME_API_URL",
    "KEYCLOAK_BASE_URL",
    "REDIS_URL",
  ] as const) {
    const value = environment[name]?.trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      const protocols =
        name === "REDIS_URL" ? ["redis:", "rediss:"] : ["http:", "https:"];
      if (
        !protocols.includes(url.protocol) ||
        (name !== "REDIS_URL" && (url.username || url.password)) ||
        (name === "APP_ORIGIN" &&
          (url.pathname !== "/" || url.search || url.hash))
      )
        invalid.push(name);
    } catch {
      invalid.push(name);
    }
  }
  const key = environment.SESSION_TOKEN_ENCRYPTION_KEY?.trim();
  if (
    key &&
    (!/^[A-Za-z0-9+/]{43}=$/.test(key) ||
      Buffer.from(key, "base64").byteLength !== 32 ||
      Buffer.from(key, "base64").toString("base64") !== key)
  )
    invalid.push("SESSION_TOKEN_ENCRYPTION_KEY");
  return Object.freeze({
    ready: !missing.length && !invalid.length,
    missing: Object.freeze(missing),
    invalid: Object.freeze(invalid),
  });
}
export function assertRuntimeEnvironment(
  environment: RuntimeEnvironmentInput = process.env,
): void {
  const result = validateRuntimeEnvironment(environment);
  if (!result.ready)
    throw new Error(
      `Frontend BFF environment is invalid (missing=${result.missing.join(",") || "none"}; invalid=${result.invalid.join(",") || "none"})`,
    );
}
export function readRuntimeEnvironment(
  environment: RuntimeEnvironmentInput = process.env,
  developmentOrigin?: string,
): BffRuntimeEnvironment {
  const values = effectiveEnvironment(environment, developmentOrigin);
  assertRuntimeEnvironment(values);
  return Object.freeze({
    appOrigin: new URL(values.APP_ORIGIN!.trim()).origin,
    runtimeApiUrl: values.RUNTIME_API_URL!.trim(),
    redisUrl: values.REDIS_URL!.trim(),
    keycloakBaseUrl: values.KEYCLOAK_BASE_URL!.trim(),
    sessionTokenEncryptionKey: values.SESSION_TOKEN_ENCRYPTION_KEY!.trim(),
  });
}
export function createAppEnvironment(developmentOrigin: string) {
  let configuration: BffRuntimeEnvironment | undefined;
  // Runtime-only: importing routes during a build never requires deployment secrets.
  return Object.assign(
    () =>
      (configuration ??= readRuntimeEnvironment(
        process.env,
        developmentOrigin,
      )),
    {
      validate: (environment: RuntimeEnvironmentInput = process.env) =>
        validateRuntimeEnvironment(
          effectiveEnvironment(environment, developmentOrigin),
        ),
      assert: (environment: RuntimeEnvironmentInput = process.env) =>
        assertRuntimeEnvironment(
          effectiveEnvironment(environment, developmentOrigin),
        ),
    },
  );
}

function effectiveEnvironment(
  environment: RuntimeEnvironmentInput,
  developmentOrigin?: string,
) {
  const values = { ...environment };
  if (
    !values.APP_ORIGIN?.trim() &&
    values.NODE_ENV === "development" &&
    developmentOrigin
  )
    values.APP_ORIGIN = developmentOrigin;
  return values;
}
