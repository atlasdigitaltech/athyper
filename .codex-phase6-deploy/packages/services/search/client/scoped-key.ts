/**
 * Scoped Meilisearch API key — provisioned at boot and used as the signing
 * secret for tenant tokens. Never the master key, which grants full admin
 * access to every index and every admin action on the Meilisearch cluster.
 *
 * Idempotency strategy:
 *   1. Derive a deterministic UID (UUIDv5 from a fixed namespace + name)
 *      so the same scoped key is found across reboots without any stashed
 *      external state.
 *   2. GET /keys/{uid} — if the key exists, reuse it.
 *   3. If 404, POST /keys with that UID. If POST races another boot and
 *      returns 409 (uid_already_exists), follow up with GET to fetch the
 *      winner.
 *   4. Both steps share the retry loop in SearchService.warmUp() so a
 *      transient Meili outage does not fail bootstrap permanently.
 *
 * The derived UID depends only on the namespace + name, both hard-coded
 * constants, so the same Athyper build always resolves the same UID across
 * every deployment. This is intentional: the scoped key is a cluster-level
 * piece of infrastructure, not a per-tenant secret.
 */

import { createHash } from "node:crypto";
import type { MeilisearchClient, MeilisearchKey } from "./meilisearch-client.js";
import { SEARCH_INDEX_NAME } from "./index-schema.js";

/**
 * DNS namespace (RFC 4122 Appendix C) — stable, publicly documented, and
 * suitable for deriving UUIDv5 identifiers rooted in a project-owned name.
 */
const UUID_NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/** Stable name the scoped key is derived from. Do not change without migrating. */
const TENANT_TOKEN_SIGNER_NAME = "athyper-tenant-token-signer";

/**
 * UUIDv5 — name-based UUID using SHA-1. Deterministic: same namespace + name
 * always yields the same UUID. Small enough to inline rather than pulling in
 * the `uuid` package for one call site.
 */
function uuidv5(name: string, namespaceUuid: string): string {
  const nsBytes = Buffer.from(namespaceUuid.replace(/-/g, ""), "hex");
  const hash = createHash("sha1");
  hash.update(nsBytes);
  hash.update(name);
  const digest = hash.digest();
  // Set version (5) in the high nibble of byte 6
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  // Set IETF variant in the high bits of byte 8
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Deterministic UID for the tenant-token signing key. Computed once at module
 * load; identical for every Athyper process against every Meilisearch cluster.
 */
export const TENANT_TOKEN_SIGNER_KEY_UID = uuidv5(
  TENANT_TOKEN_SIGNER_NAME,
  UUID_NAMESPACE_DNS,
);

export interface ResolvedSignerKey {
  uid:  string;
  key:  string;
}

/**
 * Look up (or create on first boot) the scoped search-only key whose raw
 * value is used to sign tenant tokens. Uses the master key credentials on
 * the supplied admin client for both the GET and the POST.
 *
 * Throws on any non-recoverable Meilisearch response so the warm-up retry
 * loop can back off and retry. A 404 on GET is recoverable — it means the
 * key needs to be created. A 409 on POST is recoverable — it means another
 * process created the key concurrently; we just re-fetch.
 */
export async function ensureTenantTokenSignerKey(
  adminClient: MeilisearchClient,
): Promise<ResolvedSignerKey> {
  const uid = TENANT_TOKEN_SIGNER_KEY_UID;

  const existing = await adminClient.getKey(uid);
  if (existing) {
    return { uid: existing.uid, key: existing.key };
  }

  const created = await adminClient.createKey({
    uid,
    name:        TENANT_TOKEN_SIGNER_NAME,
    description: "Athyper tenant-token signing key — search action on records index",
    actions:     ["search"],
    indexes:     [SEARCH_INDEX_NAME],
    expiresAt:   null,
  });

  if (created) {
    return { uid: created.uid, key: created.key };
  }

  // 409 race with another boot: the key exists but we didn't get the body.
  // Re-fetch authoritatively.
  const winner: MeilisearchKey | null = await adminClient.getKey(uid);
  if (!winner) {
    throw new Error(
      `ensureTenantTokenSignerKey: POST returned 409 but follow-up GET ${uid} returned 404`,
    );
  }
  return { uid: winner.uid, key: winner.key };
}
