/**
 * Resolver: item.procurement_line_defaults
 *
 * Returns line-authoring defaults for a selected master.item. When item_id is
 * blank, it falls back to the tenant's configured procurement UOM parameter.
 */

import { sql } from "kysely";
import { asResolverCode, type ResolverContract } from "@athyper/cascade";
import { registerResolver, type ResolverContext, type ServerResolver } from "./registry.js";

const DEFAULT_PROCUREMENT_LINE_UOM_PARAMETER_CODE = "finance.ap.default_procurement_line_uom";
const DEFAULT_PROCUREMENT_LINE_UOM_FALLBACK = "EA";

const CONTRACT: ResolverContract = {
  code:            asResolverCode("item.procurement_line_defaults"),
  description:     "Resolves procurement line defaults from master.item, falling back to the tenant procurement UOM parameter when item is blank.",
  requiredSources: [],
  outputType:      "object",
};

interface ItemDefaultsRow {
  uom_code: string | null;
  metadata: unknown;
}

type ProcurementLineDefaultsPatch = {
  __patch: true;
  uom_code?: string;
  price_unit: number;
};

const impl: ServerResolver<ProcurementLineDefaultsPatch> = async (inputs, ctx) => {
  const itemId = readUuid(inputs["item_id"]);
  const item = itemId ? await loadItemDefaults(ctx, itemId) : null;
  const uomCode = normalizeUomCode(item?.uom_code) ?? await resolveDefaultProcurementLineUom(ctx);
  const priceUnit = readPositiveNumber(readRecord(item?.metadata)?.["price_unit"])
    ?? readPositiveNumber(readRecord(item?.metadata)?.["default_price_unit"])
    ?? 1;

  return {
    __patch: true,
    ...(uomCode ? { uom_code: uomCode } : {}),
    price_unit: priceUnit,
  };
};

async function loadItemDefaults(
  ctx: ResolverContext,
  itemId: string,
): Promise<ItemDefaultsRow | null> {
  const result = await sql<ItemDefaultsRow>`
    SELECT uom_code, metadata
      FROM master.item
     WHERE tenant_id = ${ctx.tenantId}::uuid
       AND id = ${itemId}::uuid
       AND status = 'active'
     LIMIT 1
  `.execute(ctx.db);
  return result.rows[0] ?? null;
}

async function resolveDefaultProcurementLineUom(ctx: ResolverContext): Promise<string> {
  const result = await sql<{ value: unknown }>`
    SELECT COALESCE(
             CASE
               WHEN tv.override_enabled = true AND tv.value IS NOT NULL THEN tv.value
               ELSE COALESCE(d.product_value, d.default_value)
             END,
             to_jsonb(${DEFAULT_PROCUREMENT_LINE_UOM_FALLBACK}::text)
           ) AS value
      FROM control.parameter_definition d
      LEFT JOIN master.tenant_parameter_value tv
        ON tv.tenant_id = ${ctx.tenantId}::uuid
       AND tv.parameter_code = d.code
       AND tv.status = 'active'
       AND now() >= tv.effective_from
       AND (tv.effective_to IS NULL OR now() < tv.effective_to)
     WHERE d.code = ${DEFAULT_PROCUREMENT_LINE_UOM_PARAMETER_CODE}
       AND d.status = 'active'
       AND d.is_enabled = true
     LIMIT 1
  `.execute(ctx.db);

  return normalizeUomCode(result.rows[0]?.value) ?? DEFAULT_PROCUREMENT_LINE_UOM_FALLBACK;
}

function normalizeUomCode(value: unknown): string | null {
  const text = readString(value);
  if (!text) return null;
  if (text.toLowerCase() === "each") return DEFAULT_PROCUREMENT_LINE_UOM_FALLBACK;
  return text.toUpperCase();
}

function readUuid(value: unknown): string | null {
  const text = readString(value);
  return text || null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readPositiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function registerItemProcurementLineDefaults(): void {
  registerResolver(CONTRACT, impl);
}

export { CONTRACT as itemProcurementLineDefaultsContract };
