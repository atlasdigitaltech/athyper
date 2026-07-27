const MIN_CURSOR_SECRET_BYTES = 32;

export type EntityQueryCursorSecretSource =
  | "entity_query_cursor_secret"
  | "export_token_secret";

export type EntityQueryRuntimeDisabledReason =
  | "missing_cursor_secret"
  | "cursor_secret_too_short";

export interface EntityQueryRuntimeConfig {
  enabled: boolean;
  cursorSecret?: string;
  cursorSecretSource?: EntityQueryCursorSecretSource;
  cursorSecretBytes: number;
  disabledReason?: EntityQueryRuntimeDisabledReason;
}

/**
 * Resolve the Query V1 cursor key without treating a blank dedicated value as
 * configured. Keeping this outside API startup makes the environment contract
 * testable and prevents a regression to nullish-coalescing semantics.
 */
export function resolveEntityQueryRuntimeConfig(
  env: Readonly<Record<string, string | undefined>>,
): EntityQueryRuntimeConfig {
  const dedicated = normalizeSecret(env["ENTITY_QUERY_CURSOR_SECRET"]);
  if (dedicated) {
    return validateSecret(dedicated, "entity_query_cursor_secret");
  }

  const legacyFallback = normalizeSecret(env["EXPORT_TOKEN_SECRET"]);
  if (legacyFallback) {
    return validateSecret(legacyFallback, "export_token_secret");
  }

  return {
    enabled: false,
    cursorSecretBytes: 0,
    disabledReason: "missing_cursor_secret",
  };
}

function validateSecret(
  cursorSecret: string,
  cursorSecretSource: EntityQueryCursorSecretSource,
): EntityQueryRuntimeConfig {
  const cursorSecretBytes = Buffer.byteLength(cursorSecret, "utf8");
  if (cursorSecretBytes < MIN_CURSOR_SECRET_BYTES) {
    return {
      enabled: false,
      cursorSecretSource,
      cursorSecretBytes,
      disabledReason: "cursor_secret_too_short",
    };
  }

  return {
    enabled: true,
    cursorSecret,
    cursorSecretSource,
    cursorSecretBytes,
  };
}

function normalizeSecret(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
