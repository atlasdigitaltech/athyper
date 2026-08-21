# Source-Change Resolver Registry â€” Spec

**Version:** v1.0 (locked) Â· **Date:** 2026-06-28
**Scope:** Typed registry for `on_source_change.action="rederive"` resolvers.
**Owner:** `@athyper/cascade-resolvers` (contract types) + `server/packages/services/resolvers/` (server impl) + `packages/shared/runtime-domain/runtime-shared/src/resolvers/` (client adapter).

---

## 1. Why a registry

Free-text `resolver_code` strings rot. The registry gives:

1. **CI-checkable codes.** Every `on_source_change.action="rederive"` rule references a registered code; CI fails red on typos.
2. **Schema cross-check.** A resolver declares `targetEntity` (when output is a UUID); CI verifies the field's `reference_config.target_entity` matches.
3. **Input contract.** A resolver declares `requiredSources`; CI verifies the rule's `sources` superset matches.
4. **Single name across client + server.** Client `callResolver(code, inputs)` hits the BFF endpoint; server registry resolves the same `code` to an impl.

---

## 2. Code naming convention

```
<domain>.<intent>
```

Examples:

- `supplier.default_payment_term`
- `supplier.default_currency`
- `item.procurement_line_defaults`
- `commitment.applicable_payment_method`
- `company_code.default_journal`

Rules:

- Lowercase snake_case segments.
- Exactly one `.` separator.
- Domain segment SHOULD match an existing entity_code where natural; otherwise a logical grouping (`tenant`, `session`).
- Intent segment describes the output value, not the trigger.

---

## 3. Contract type

```ts
// packages/shared/business-domain/cascade-resolvers/src/types.ts
export type ResolverCode = string & { readonly __brand: "ResolverCode" };

export interface ResolverContract {
  code:            ResolverCode;
  description:     string;
  requiredSources: string[];                   // form fields needed as inputs
  outputType:      "uuid" | "string" | "number" | "enum" | "object";
  targetEntity?:   string;                     // when outputType="uuid", FK target entity_code
}
```

---

## 4. Server registry

```ts
// server/packages/services/resolvers/index.ts
type ServerResolver<T = unknown> = (
  inputs: Record<string, unknown>,
  ctx: { tenantId: string; db: Kysely<DB>; userId: string },
) => Promise<T | null>;

export function registerResolver<T>(
  contract: ResolverContract,
  impl:     ServerResolver<T>,
): void;

export function lookupResolver(code: string): ServerResolver | null;
export function lookupResolverContract(code: string): ResolverContract | null;
export function listResolverContracts(): ResolverContract[];
```

Server impls:

- Receive a **tenant-scoped** Kysely connection.
- MUST NOT trust `inputs.tenant_id` â€” always use `ctx.tenantId`.
- Return `null` when the input set is insufficient or no value resolves; never throw.
- Are pure of UI concerns (no string formatting, no labels).

---

## 5. Client adapter

```ts
// packages/shared/runtime-domain/runtime-shared/src/resolvers/client.ts
export async function callResolver(
  code:   string,
  inputs: Record<string, unknown>,
): Promise<unknown | null>;
```

Posts to `POST /api/runtime/v1/resolvers/[code]` with body `{ inputs }`. Returns `body.value` or `null`. Caller (form runtime) handles errors as "leave target as-is."

There are NO pure-client resolvers in v1. All resolution flows through the BFF so tenant scoping, auth, and DB access stay server-side.

---

## 6. BFF endpoint

`POST /api/runtime/v1/resolvers/[code]`

**Request**:
```jsonc
{ "inputs": { "supplier_id": "01HMAâ€¦" } }
```

**Response (200)**:
```jsonc
{ "value": "01HMBâ€¦" | null }
```

**Errors**:

| Status | Code | Cause |
|---|---|---|
| 401 | `UNAUTHENTICATED` | No session |
| 404 | `RESOLVER_NOT_FOUND` | Unknown code |
| 400 | `RESOLVER_MISSING_INPUTS` | `inputs` does not contain all `requiredSources` |
| 422 | `RESOLVER_INPUT_INVALID` | Type mismatch (e.g., UUID malformed) |
| 500 | `RESOLVER_FAILED` | Impl threw â€” should not happen, indicates bug |

---

## 7. CI export

`server/scripts/export-resolver-contracts.ts` dumps `listResolverContracts()` to:

```
server/db/seed/contracts/generated/resolver-contracts.json
```

Committed. The cascade-rule verifier reads this file (no server boot needed) to validate `on_source_change[].resolver` codes against the registry.

The export script is wired into the same CI step that runs `verify-cascade-rule-coverage` â€” regenerating the JSON when the registry changes is a one-line `pnpm` script.

---

## 8. Phase 0 seed set

| Code | requiredSources | outputType | targetEntity | Purpose |
|---|---|---|---|---|
| `supplier.default_payment_term` | `["supplier_id"]` | `uuid` | `payment_term` | PI payment term auto-fill |
| `item.procurement_line_defaults` | `[]` | `object` | â€” | Procurement line UOM/price-per defaults from item or tenant config |
| `supplier.default_currency` | `["supplier_id"]` | `string` | â€” | PI currency auto-fill |

Additional codes are added as new pilot entities adopt `on_source_change`.

---

## 9. Security model

- **Tenant scoping:** server resolvers receive a Kysely instance pre-scoped to `ctx.tenantId`. The instance is the same one used by the records service.
- **Authorization:** the BFF route reuses the standard relay session middleware. No additional permission grants are required â€” resolvers return data the user could already see through the picker.
- **Rate limiting:** out of scope for v1. Resolvers are read-only single-row lookups; abuse is bounded by existing API rate limits on the BFF.

---

## 10. Versioning

- Adding a new resolver: minor change. Update `listResolverContracts()`, regenerate JSON, ship.
- Removing a resolver: requires migrating all seed rules first; CI prevents removal otherwise (orphan reference).
- Changing `requiredSources` or `outputType`: breaking. Bump the code (`supplier.default_payment_term_v2`) and migrate seeds in lockstep.
