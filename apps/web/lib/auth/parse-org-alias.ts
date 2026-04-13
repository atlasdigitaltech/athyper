/**
 * Parse a KC org alias "{tenant}--{entity}" into its parts.
 * e.g. "athyper--ATHQ" → { tenant: "athyper", entity: "ATHQ" }
 *
 * indexOf("--") finds the FIRST occurrence to correctly handle
 * hyphens within tenant codes (e.g. "demo-corp--HQ").
 *
 * This is a pure utility — no server-only restriction — safe to import
 * from both Server Components and Client Components.
 */
export function parseOrgAlias(alias: string): { tenant: string; entity: string } {
  const idx = alias.indexOf("--");
  if (idx < 1) return { tenant: alias, entity: alias };
  return { tenant: alias.slice(0, idx), entity: alias.slice(idx + 2) };
}
