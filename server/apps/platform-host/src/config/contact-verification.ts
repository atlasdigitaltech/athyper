import { createPrivateKey } from "node:crypto";
import { parseProviderVerificationKeys, type ProviderVerificationKey } from "@athyper/server-platform-verification";

export type ContactVerificationConfiguration =
  | { readonly status: "disabled"; readonly reason: "NOT_ENABLED" }
  | { readonly status: "unavailable"; readonly reason: "INVALID_CONFIGURATION" }
  | { readonly status: "configured"; readonly keys: readonly ProviderVerificationKey[] };

/** Optional configuration must never prevent IAM startup. Do not log raw input,
 * private keys, provider payloads or exception messages from cryptographic parsers.
 * A configured trust store alone is not an available verification service.
 */
export function loadContactVerificationConfiguration(env: NodeJS.ProcessEnv, environment: string, notificationCapture: boolean): ContactVerificationConfiguration {
  const enabled = env.CONTACT_VERIFICATION_ENABLED ?? env.LOCAL_CONTACT_CHALLENGE_ENABLED ?? "false";
  if (["false", "0", ""].includes(enabled)) return { status: "disabled", reason: "NOT_ENABLED" };
  try {
    if (!["true", "1"].includes(enabled)) throw new Error();
    const keys = parseProviderVerificationKeys(JSON.parse(env.CONTACT_VERIFICATION_KEYS_JSON ?? env.MASTER_DATA_VERIFICATION_KEYS_JSON ?? "[]"));
    if (!keys.length) throw new Error();
    const local = env.LOCAL_CONTACT_CHALLENGE_ENABLED ?? "false";
    if (!["true", "1", "false", "0", ""].includes(local)) throw new Error();
    if (["true", "1"].includes(local)) {
      if (environment !== "local" || !notificationCapture ||
          Buffer.from(env.LOCAL_CONTACT_CHALLENGE_DELIVERY_KEY ?? "", "base64").length !== 32 ||
          createPrivateKey(env.LOCAL_CONTACT_CHALLENGE_PRIVATE_KEY ?? "").asymmetricKeyType !== "ed25519") throw new Error();
      // The deleted local challenge implementation is not restored by configuration.
    }
    return { status: "configured", keys };
  } catch { return { status: "unavailable", reason: "INVALID_CONFIGURATION" }; }
}
