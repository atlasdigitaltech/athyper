/**
 * GET /api/entity-capabilities/{entityKey}
 *
 * Returns capabilities for a single entity type.
 * Used by detail/list pages to determine available operations.
 */

import { EntityCapabilitiesService } from "@athyper/runtime/services/platform/meta/capabilities";

import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";



import {
  getApiContext,
  resolveTenantUuid,
  unauthorizedResponse,
  successResponse,
  errorResponse,
} from "@/lib/api-context";

function isStubMode(): boolean {
  return !process.env.DATABASE_URL && process.env.ENABLE_DEV_STUBS === "true";
}

async function getDbClient(): Promise<Kysely<DB>> {
  const { Pool } = await import("pg");
  const { Kysely: K, PostgresDialect } = await import("kysely");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  return new K<DB>({
    dialect: new PostgresDialect({ pool }),
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ entityKey: string }> },
) {
  const { entityKey } = await params;

  if (isStubMode()) {
    return successResponse(null);
  }

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    const { context } = apiCtx;

    if (!context) {
      return unauthorizedResponse();
    }

    const db = await getDbClient();
    const tenantUuid = await resolveTenantUuid(db, context.tenantId);
    const service = new EntityCapabilitiesService(db);

    const capabilities = await service.getEntityCapabilities(
      entityKey,
      tenantUuid,
    );

    await db.destroy();

    if (!capabilities) {
      return errorResponse("NOT_FOUND", `Entity not found: ${entityKey}`, 404);
    }

    return successResponse(capabilities);
  } catch (err) {
    console.error(
      `[GET /api/entity-capabilities/${entityKey}] Error:`,
      err,
    );
    return errorResponse(
      "INTERNAL_ERROR",
      "Failed to fetch entity capabilities",
    );
  } finally {
    await redis?.quit();
  }
}
