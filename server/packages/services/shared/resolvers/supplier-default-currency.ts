/**
 * Resolver: supplier.default_currency
 *
 * Returns master.company_code_supplier_profile.currency_code for the
 * (supplier_id, company_code_id) pair, scoped to the caller's tenant.
 * Returns null if no override is configured for that company code.
 *
 * Note: requires both supplier_id and company_code_id. Falls back to null
 * (no global supplier default currency exists today).
 */

import { sql } from "kysely";
import { asResolverCode, type ResolverContract } from "@athyper/cascade";
import { registerResolver, type ServerResolver } from "./registry.js";

const CONTRACT: ResolverContract = {
  code:            asResolverCode("supplier.default_currency"),
  description:     "Resolves the default currency code for a (supplier, company_code) pair (master.company_code_supplier_profile.currency_code).",
  requiredSources: ["supplier_id", "company_code_id"],
  outputType:      "string",
};

const impl: ServerResolver<string> = async (inputs, ctx) => {
  const supplierId    = readUuid(inputs["supplier_id"]);
  const companyCodeId = readUuid(inputs["company_code_id"]);
  if (!supplierId || !companyCodeId) return null;

  const row = await sql<{ currency_code: string | null }>`
    SELECT currency_code
      FROM master.company_code_supplier_profile
     WHERE supplier_id     = ${supplierId}
       AND company_code_id = ${companyCodeId}
       AND tenant_id       = ${ctx.tenantId}
       AND is_active       = true
     LIMIT 1
  `.execute(ctx.db);

  return row.rows[0]?.currency_code ?? null;
};

function readUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function registerSupplierDefaultCurrency(): void {
  registerResolver(CONTRACT, impl);
}

export { CONTRACT as supplierDefaultCurrencyContract };
