/**
 * GET /api/lookup/:entity
 *
 * Dedicated typeahead search endpoint for reference field pickers.
 * Returns relevance-ranked results with display labels and sublabels.
 *
 * Query params:
 *   q       - Search query (required, min 1 char)
 *   limit   - Page size (default 20, max 100)
 *   cursor  - Opaque cursor for pagination
 *   fields  - Comma-separated extra fields to return as meta
 *   filters - JSON-encoded filter object
 *   context - "create" | "edit" | "view" (drives context-aware filtering)
 *   sourceEntity - Source entity name (for server-authoritative profile resolution)
 *   fieldName    - Source field name (for server-authoritative profile resolution)
 *   profile      - JSON-encoded lookup profile (fallback if sourceEntity/fieldName absent)
 */

export const runtime = "nodejs";

import {
    getApiContext,
    resolveTenantUuid,
    successResponse,
    errorResponse,
    unauthorizedResponse,
} from "@/lib/api-context";
import { getDb } from "@/lib/db";
import { resolveEntityMeta } from "@/lib/entity-meta";
import { executeLookupSearch, resolveServerLookupProfile } from "@/lib/lookup-search";
import type { LookupSearchParams, RawLookupProfile } from "@/lib/lookup-search";

interface RouteContext {
    params: Promise<{ entity: string }>;
}

export async function GET(req: Request, context: RouteContext) {
    const db = getDb();
    if (!db) {
        return errorResponse("SERVICE_UNAVAILABLE", "Database not configured", 503);
    }

    let redis: { quit: () => Promise<void> } | null = null;
    try {
        const apiCtx = await getApiContext();
        redis = apiCtx.redis;
        const { context: authContext } = apiCtx;

        if (!authContext) return unauthorizedResponse();

        const tenantUuid = await resolveTenantUuid(db, authContext.tenantId);
        const { entity } = await context.params;

        // ── Parse query params ──
        const url = new URL(req.url);
        const q = url.searchParams.get("q") ?? "";
        const limitParam = parseInt(url.searchParams.get("limit") ?? "20", 10);
        const limit = Math.min(Math.max(limitParam || 20, 1), 100);
        const cursor = url.searchParams.get("cursor") ?? undefined;
        const contextParam = url.searchParams.get("context") ?? "create";
        const fieldsParam = url.searchParams.get("fields");
        const filtersParam = url.searchParams.get("filters");

        // Validate search query
        if (!q || q.trim().length === 0) {
            return errorResponse("INVALID_QUERY", "Query parameter 'q' is required", 400);
        }

        // Validate context
        const validContexts = ["create", "edit", "view"];
        if (!validContexts.includes(contextParam)) {
            return errorResponse("INVALID_CONTEXT", "Context must be 'create', 'edit', or 'view'", 400);
        }

        // Parse optional filters
        let filters: Record<string, unknown> | undefined;
        if (filtersParam) {
            try {
                filters = JSON.parse(filtersParam);
            } catch {
                return errorResponse("INVALID_FILTERS", "Filters must be valid JSON", 400);
            }
        }

        // ── Resolve lookup profile (server-authoritative) ──
        // Prefer server-side resolution from sourceEntity + fieldName.
        // Falls back to client-supplied profile only if source params are absent.
        const sourceEntity = url.searchParams.get("sourceEntity");
        const fieldName = url.searchParams.get("fieldName");
        let lookupProfile: RawLookupProfile | undefined;

        if (sourceEntity && fieldName) {
            // Server-authoritative: load from compiled field metadata
            const serverProfile = await resolveServerLookupProfile(
                db, sourceEntity, fieldName, tenantUuid,
            );
            if (serverProfile) lookupProfile = serverProfile;
        } else {
            // Fallback: client-supplied profile (validated but less trusted)
            const profileParam = url.searchParams.get("profile");
            if (profileParam) {
                try {
                    lookupProfile = JSON.parse(profileParam) as RawLookupProfile;
                } catch {
                    return errorResponse("INVALID_PROFILE", "Profile must be valid JSON", 400);
                }
            }
        }

        // Parse optional fields
        const fields = fieldsParam
            ? fieldsParam.split(",").map((f) => f.trim()).filter(Boolean)
            : undefined;

        // ── Resolve entity metadata ──
        const entityMeta = await resolveEntityMeta(db, entity, tenantUuid);
        if (!entityMeta) {
            return errorResponse("ENTITY_NOT_FOUND", `Entity '${entity}' not found`, 404);
        }

        // ── Execute search ──
        const startTime = Date.now();
        const searchParams: LookupSearchParams = {
            query: q,
            limit,
            cursor,
            context: contextParam as "create" | "edit" | "view",
            filters,
            fields,
            lookupProfile,
        };

        const result = await executeLookupSearch(db, entityMeta, tenantUuid, searchParams);
        const durationMs = Date.now() - startTime;

        // ── Observability ──
        console.info(JSON.stringify({
            event: "lookup_search",
            route: `lookup/${entity}`,
            query: q,
            context: contextParam,
            results: result.items.length,
            has_more: !!result.nextCursor,
            zero_results: result.items.length === 0,
            profile_source: sourceEntity && fieldName ? "server" : lookupProfile ? "client" : "none",
            duration_ms: durationMs,
        }));

        return successResponse({
            items: result.items,
            nextCursor: result.nextCursor,
        });
    } catch (error) {
        console.error("[GET /api/lookup/:entity] Error:", error);
        return errorResponse("INTERNAL_ERROR", "Failed to execute lookup search");
    } finally {
        await redis?.quit();
    }
}
