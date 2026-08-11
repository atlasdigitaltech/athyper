export type ClaimContextMode = "off" | "shadow" | "enforce";

export interface IamConfigInput {
  readonly environment: "local" | "staging" | "production";
  readonly defaultRealmKey?: string;
  readonly claimContextMode?: ClaimContextMode | "on";
  readonly requireAuthorizedRole?: boolean;
  readonly enforceRequiredActions?: boolean;
  readonly requiredActionsMatrix?: Readonly<Record<string, readonly string[]>>;
}

export interface IamConfig {
  readonly defaultRealmKey: string;
  readonly claimContextMode: ClaimContextMode;
  readonly requireAuthorizedRole: boolean;
  readonly enforceRequiredActions: boolean;
  readonly requiredActionsMatrix: Readonly<Record<string, readonly string[]>>;
}

const DEFAULT_MATRIX: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "*": ["/api/auth/logout", "/api/auth/session", "/api/auth/required-actions"],
  UPDATE_PASSWORD: ["/api/auth/logout", "/api/auth/session", "/api/auth/required-actions", "/api/auth/required-actions/update-password"],
  VERIFY_EMAIL: ["/api/auth/logout", "/api/auth/session", "/api/auth/required-actions", "/api/auth/required-actions/verify-email"],
  CONFIGURE_TOTP: ["/api/auth/logout", "/api/auth/session", "/api/auth/required-actions", "/api/auth/required-actions/configure-totp"],
});

export function createIamConfig(input: IamConfigInput): IamConfig {
  const realm = input.defaultRealmKey?.trim() || "default";
  const legacyMode = input.claimContextMode;
  const mode: ClaimContextMode = legacyMode === "on" ? "enforce" : legacyMode ?? (input.environment === "production" ? "enforce" : "shadow");
  if (!(["off", "shadow", "enforce"] as const).includes(mode)) {
    throw new TypeError(`Invalid IAM claim-context mode: ${mode}`);
  }
  const matrix = input.requiredActionsMatrix ?? DEFAULT_MATRIX;
  for (const [action, prefixes] of Object.entries(matrix)) {
    if (!(action === "*" || /^[A-Z][A-Z0-9_]{0,63}$/.test(action)) || !Array.isArray(prefixes)
      || prefixes.some((prefix) => typeof prefix !== "string" || !prefix.startsWith("/"))) {
      throw new TypeError(`Invalid IAM required-action matrix entry: ${action}`);
    }
  }
  return Object.freeze({
    defaultRealmKey: realm,
    claimContextMode: mode,
    requireAuthorizedRole: input.requireAuthorizedRole ?? true,
    enforceRequiredActions: input.enforceRequiredActions ?? true,
    requiredActionsMatrix: matrix,
  });
}
