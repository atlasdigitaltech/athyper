/**
 * Resolver: supplier.default_payment_term
 *
 * Returns master.supplier.payment_term_id for the given supplier_id, scoped
 * to the caller's tenant. Returns null if no payment term is configured.
 */

import { sql } from "kysely";
import { asResolverCode, type ResolverContract } from "@athyper/cascade";
import { registerResolver, type ServerResolver } from "./registry.js";

const CONTRACT: ResolverContract = {
  code:            asResolverCode("supplier.default_payment_term"),
  description:     "Resolves the default payment term for a supplier (master.supplier.payment_term_id).",
  requiredSources: ["supplier_id"],
  outputType:      "uuid",
  targetEntity:    "payment_term",
};

const impl: ServerResolver<string> = async (inputs, ctx) => {
  const supplierId = readUuid(inputs["supplier_id"]);
  if (!supplierId) return null;

  const row = await sql<{ payment_term_id: string | null }>`
    SELECT payment_term_id
      FROM master.supplier
     WHERE id = ${supplierId}
       AND tenant_id = ${ctx.tenantId}
     LIMIT 1
  `.execute(ctx.db);

  return row.rows[0]?.payment_term_id ?? null;
};

function readUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // shallow shape check; the server registry validates UUID format upstream
  return trimmed;
}

export function registerSupplierDefaultPaymentTerm(): void {
  registerResolver(CONTRACT, impl);
}

export { CONTRACT as supplierDefaultPaymentTermContract };
