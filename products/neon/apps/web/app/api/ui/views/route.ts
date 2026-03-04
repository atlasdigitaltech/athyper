/**
 * GET  /api/ui/views?entity_key=X  — List saved views for an entity
 * POST /api/ui/views               — Create a new saved view
 */

import { SavedViewRepository } from "@athyper/runtime/services/platform/ui/saved-view.repository";
import { SavedViewService } from "@athyper/runtime/services/platform/ui/saved-view.service";

import type { ApiContext } from "@/lib/api-context";
import type { DB } from "@athyper/adapter-db";
import type { Kysely } from "kysely";

import {
  getApiContext,
  unauthorizedResponse,
  successResponse,
  errorResponse,
} from "@/lib/api-context";

// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────

const stubLogger = {
  info() {},
  warn: console.warn,
  debug() {},
  error: console.error,
} as any;

function isStubMode(): boolean {
  return !process.env.DATABASE_URL && process.env.ENABLE_DEV_STUBS === "true";
}

async function getDbClient(): Promise<Kysely<DB>> {
  const { Pool } = await import("pg");
  const { Kysely: K, PostgresDialect } = await import("kysely");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return new K<DB>({ dialect: new PostgresDialect({ pool }) });
}

function createService(db: Kysely<DB>): SavedViewService {
  const repo = new SavedViewRepository(db);
  return new SavedViewService(repo, stubLogger);
}

/**
 * Resolve a Keycloak subject (session userId) to the internal core.principal.id.
 * Looks up via core.idp_identity first; auto-provisions principal + identity if not found.
 */
async function resolvePrincipalId(
  db: Kysely<DB>,
  context: ApiContext,
): Promise<string> {
  // Look up existing identity mapping
  const existing = await (db as Kysely<any>)
    .selectFrom("core.idp_identity")
    .select("principal_id")
    .where("tenant_id", "=", context.tenantId)
    .where("idp_name", "=", "keycloak")
    .where("idp_subject", "=", context.userId)
    .executeTakeFirst();

  if (existing) return existing.principal_id as string;

  // Auto-provision: create principal + idp_identity link
  const principalCode = context.username || context.userId;

  // Check if principal already exists by code (globally unique, not tenant-scoped)
  const existingPrincipal = await (db as Kysely<any>)
    .selectFrom("core.principal")
    .select("id")
    .where("principal_code", "=", principalCode)
    .executeTakeFirst();

  const principalId = existingPrincipal
    ? (existingPrincipal.id as string)
    : crypto.randomUUID();

  if (!existingPrincipal) {
    await (db as Kysely<any>)
      .insertInto("core.principal")
      .values({
        id: principalId,
        tenant_id: context.tenantId,
        principal_type: "user",
        principal_code: principalCode,
        display_name: context.displayName || principalCode,
        email: null,
        is_active: true,
        created_by: "system",
      })
      .execute();
  }

  // Link the idp_identity (idempotent — skip if already exists)
  // Cannot use ON CONFLICT because the unique constraint is DEFERRABLE
  const existingIdentity = await (db as Kysely<any>)
    .selectFrom("core.idp_identity")
    .select("id")
    .where("tenant_id", "=", context.tenantId)
    .where("idp_name", "=", "keycloak")
    .where("idp_subject", "=", context.userId)
    .executeTakeFirst();

  if (!existingIdentity) {
    await (db as Kysely<any>)
      .insertInto("core.idp_identity")
      .values({
        id: crypto.randomUUID(),
        tenant_id: context.tenantId,
        principal_id: principalId,
        idp_name: "keycloak",
        idp_subject: context.userId,
        created_by: "system",
      })
      .execute();
  }

  return principalId;
}

// ─────────────────────────────────────────────
// GET /api/ui/views?entity_key=X
// ─────────────────────────────────────────────

export async function GET(req: Request) {
  if (isStubMode()) {
    return successResponse([]);
  }

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    const { context } = apiCtx;

    if (!context) return unauthorizedResponse();

    const url = new URL(req.url);
    const entityKey = url.searchParams.get("entity_key");

    if (!entityKey) {
      return errorResponse(
        "MISSING_ENTITY_KEY",
        "entity_key query parameter is required",
        400,
      );
    }

    const db = await getDbClient();
    try {
      const principalId = await resolvePrincipalId(db, context);
      const service = createService(db);
      const views = await service.listViews(
        {
          tenantId: context.tenantId,
          userId: principalId,
          roles: context.roles,
        },
        entityKey,
      );
      return successResponse(views);
    } finally {
      await db.destroy();
    }
  } catch (err: unknown) {
    // Suppress noisy "column does not exist" errors from un-provisioned schemas
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist")) {
      console.warn(
        "[GET /api/ui/views] Schema mismatch — re-provision DB (120_ui.sql). Returning empty.",
      );
    } else {
      console.error("[GET /api/ui/views] Error:", err);
    }
    // Return empty array as graceful fallback
    return successResponse([]);
  } finally {
    await redis?.quit();
  }
}

// ─────────────────────────────────────────────
// POST /api/ui/views
// ─────────────────────────────────────────────

export async function POST(req: Request) {
  if (isStubMode()) {
    return errorResponse(
      "STUB_MODE",
      "Write operations not available in stub mode",
      501,
    );
  }

  let redis: { quit: () => Promise<void> } | null = null;
  try {
    const apiCtx = await getApiContext();
    redis = apiCtx.redis;
    const { context } = apiCtx;

    if (!context) return unauthorizedResponse();

    const body = (await req.json()) as Record<string, unknown>;

    if (!body.entityKey || !body.name || body.stateJson === undefined) {
      return errorResponse(
        "MISSING_REQUIRED_FIELDS",
        "entityKey, name, and stateJson are required",
        400,
      );
    }

    const db = await getDbClient();
    try {
      const principalId = await resolvePrincipalId(db, context);
      const service = createService(db);
      const result = await service.createView(
        {
          tenantId: context.tenantId,
          userId: principalId,
          roles: context.roles,
        },
        {
          entityKey: body.entityKey as string,
          scope: (body.scope as string) ?? "USER",
          name: body.name as string,
          isPinned: body.isPinned as boolean | undefined,
          isDefault: body.isDefault as boolean | undefined,
          stateJson: body.stateJson,
        },
      );
      return successResponse(result, 201);
    } finally {
      await db.destroy();
    }
  } catch (err: unknown) {
    const errObj = err instanceof Error ? err : undefined;
    const status = (err as Record<string, unknown>)?.status;
    const code = (err as Record<string, unknown>)?.code as string | undefined;
    const message = errObj?.message ?? "Unknown error";
    if (status) {
      return errorResponse(code ?? "ERROR", message, status as number);
    }
    console.error("[POST /api/ui/views] Error:", err);
    return errorResponse("INTERNAL_ERROR", "Failed to create view");
  } finally {
    await redis?.quit();
  }
}
