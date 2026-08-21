export type AtlasByokBackend = "disabled" | "database_encrypted";

export interface AtlasByokConfig {
  readonly enabled: boolean;
  readonly backend: AtlasByokBackend;
  readonly cacheTtlMs: number;
  readonly fingerprintKey: string | null;
}

/** B3.2 fail-closed application configuration. */
export function readAtlasByokConfig(env: NodeJS.ProcessEnv): AtlasByokConfig {
  const enabled = env["ATLAS_BYOK_ENABLED"] === "true";
  const backend = env["ATLAS_BYOK_BACKEND"] === "database_encrypted"
    ? "database_encrypted" : "disabled";
  const cacheTtlMs = Number(env["ATLAS_BYOK_CACHE_TTL_MS"] ?? "30000");
  const fingerprintKey = env["ATLAS_BYOK_FINGERPRINT_KEY"]?.trim() || null;
  if (enabled && (backend === "disabled" || !fingerprintKey || fingerprintKey.length < 32)) {
    throw new Error("Atlas BYOK requires an approved encrypted backend and fingerprint key.");
  }
  if (!Number.isSafeInteger(cacheTtlMs) || cacheTtlMs < 0 || cacheTtlMs > 300_000) {
    throw new Error("ATLAS_BYOK_CACHE_TTL_MS is invalid.");
  }
  return Object.freeze({ enabled, backend, cacheTtlMs, fingerprintKey });
}
