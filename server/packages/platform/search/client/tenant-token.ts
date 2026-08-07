/**
 * Meilisearch tenant tokens — per-request JWTs that bake a tenant filter
 * into the request itself. Meilisearch enforces the filter before running
 * the query, so a leaked token cannot be used to query across tenants.
 *
 * Format (Meilisearch v1.x tenant token spec):
 *   alg: HS256
 *   header: { "typ": "JWT", "alg": "HS256" }
 *   payload:
 *     searchRules: { "<indexUid>": { filter: "_tenant_id = <uuid>" } }
 *     apiKeyUid:   <parent-api-key-uid>   // required since Meili v1.0 —
 *                                         // identifies the signing key so
 *                                         // Meili can look up its value and
 *                                         // verify the HS256 signature
 *     exp:         <unix-seconds>
 *
 * Signing key is the raw `key` value of a Meilisearch API key. In production
 * this is a scoped search-only key provisioned in bootstrap (see
 * scoped-key.ts) — never the master key, which grants full admin access.
 */

import * as jose from "jose";

export interface MintTenantTokenOptions {
  tenantId:    string;
  indexUid:    string;
  /** UID of the Meilisearch API key whose raw value is used to sign the token. */
  apiKeyUid:   string;
  /** Unix-seconds expiry. Default: 1 hour from now. */
  expiresAt?:  number;
  /** Additional filter expressions AND'd with the tenant filter. */
  extraFilters?: string[];
}

/**
 * Mint a Meilisearch tenant token. `signingKey` must be the raw value of the
 * API key identified by `apiKeyUid`. Tokens are stateless — Meilisearch does
 * not track them; it verifies the signature against the stored key and
 * enforces the embedded searchRules.
 */
export async function mintMeilisearchTenantToken(
  signingKey: string,
  options:    MintTenantTokenOptions,
): Promise<string> {
  const { tenantId, indexUid, apiKeyUid, expiresAt, extraFilters = [] } = options;

  const filters = [
    `_tenant_id = "${tenantId.replace(/"/g, '\\"')}"`,
    ...extraFilters,
  ];
  const filterExpr = filters.map((f) => `(${f})`).join(" AND ");

  const secret = new TextEncoder().encode(signingKey);
  const jwt = new jose.SignJWT({
    searchRules: {
      [indexUid]: { filter: filterExpr },
    },
    apiKeyUid,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expiresAt ?? Math.floor(Date.now() / 1000) + 3600);

  return jwt.sign(secret);
}
