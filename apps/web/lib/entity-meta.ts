import "server-only";
import { cache } from "react";
import { CompiledEntitySchema, type CompiledEntity } from "@athyper/api-contracts/metadata";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * Fetch the compiled entity descriptor for a given entity code.
 *
 * Server-only. Wrapped in React cache() so multiple Server Components in the
 * same render tree share one network round-trip per entity code.
 *
 * Revalidates every 5 minutes (matches staleTime in useCompiledEntity).
 * Returns null when the session is absent or the entity code is unknown.
 */
export const getCompiledEntity = cache(
  async (entityCode: string): Promise<CompiledEntity | null> => {
    const session = await getServerSession();
    if (!session) return null;

    const url = `${RUNTIME_API_URL}/api/metadata/entities/${encodeURIComponent(entityCode)}/compiled`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: buildRuntimeHeaders(session),
        next: { revalidate: 300 },
      });
    } catch {
      return null;
    }

    if (!res.ok) return null;

    const json = await res.json() as unknown;
    const parsed = CompiledEntitySchema.safeParse(json);
    if (!parsed.success) return null;

    warnIfMisconfiguredInDev(entityCode, parsed.data);
    return parsed.data;
  },
);

// ── Dev-mode BFF compliance assertions ────────────────────────────────────────
// Mirrors the server-side 10-point checklist at the BFF layer.
// Fires once per entity code per render tree (cache() deduplicates calls).
// Never throws — misconfigured entities degrade gracefully; warnings guide fixes.

function warnIfMisconfiguredInDev(entityCode: string, entity: CompiledEntity): void {
  if (process.env["NODE_ENV"] !== "development") return;

  const warnings: string[] = [];

  if (!entity.fields.length) {
    warnings.push("no compiled fields — entity may not render correctly");
  }
  if (!entity.display_config.list_columns?.length) {
    warnings.push("display_config.list_columns is empty — list page will show no columns");
  }
  if (!entity.display_config.detail_renderer && !entity.feature_flags?.is_approvable) {
    warnings.push("display_config.detail_renderer not set — detail renderer falls back to structural heuristics");
  }
  if (!entity.display_config.title_field) {
    warnings.push("display_config.title_field not set — detail page title will fall back to entity_code");
  }

  if (warnings.length > 0) {
    console.warn(
      `[entity-meta] RUNTIME_ROUTING_SPEC §10 — compliance warnings for '${entityCode}':\n` +
        warnings.map((w) => `  • ${w}`).join("\n"),
    );
  }
}
