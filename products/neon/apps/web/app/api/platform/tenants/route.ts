// products/neon/apps/web/app/api/platform/tenants/route.ts
//
// GET /api/platform/tenants
//
// Returns the list of tenants visible to the platform admin.
// Requires a platform admin session with "tenant:list" permission.

import { NextResponse } from "next/server";

import { hasPlatformPermission, requirePlatformSession } from "../helpers";

/**
 * GET /api/platform/tenants
 *
 * Fetches the tenant list from the runtime API and returns it.
 * Platform admins use this to populate the tenant selector UI.
 *
 * Security:
 *   - Requires platform admin session (neon_realm=platform)
 *   - Requires "tenant:list" permission
 *   - Proxies the request to the runtime API with the platform admin's access token
 */
export async function GET() {
  const auth = await requirePlatformSession();
  if (!auth.ok) return auth.response;

  if (!hasPlatformPermission(auth.platformRoles, "tenant:list")) {
    return NextResponse.json(
      {
        error: "FORBIDDEN",
        message: "Insufficient platform role for tenant:list",
      },
      { status: 403 },
    );
  }

  // Try runtime API first; fallback for development when runtime is down
  const runtimeApiUrl = process.env.RUNTIME_API_URL ?? "https://api.athyper.local";

  try {
    const res = await fetch(`${runtimeApiUrl}/api/platform/tenants`, {
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        "X-Realm": auth.realmKey,
      },
      signal: AbortSignal.timeout(5_000),
    });

    if (res.ok) {
      const data = (await res.json()) as { tenants?: unknown[] };
      return NextResponse.json({ tenants: data.tenants ?? [] });
    }
  } catch {
    // Runtime unreachable — fall through to fallback
  }

  // Fallback: query core.tenant table directly (dev-only, runtime unavailable)
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    try {
      const { Client } = await import("pg");
      const db = new Client(databaseUrl);
      await db.connect();
      try {
        const result = await db.query(
          "SELECT id, code, name, status FROM core.tenant ORDER BY name",
        );
        const tenants = result.rows.map(
          (row: {
            id: string;
            code: string;
            name: string;
            status: string;
          }) => ({
            id: row.id,
            code: row.code,
            name: row.name,
            status: row.status,
            region: "local",
          }),
        );
        return NextResponse.json({ tenants });
      } finally {
        await db.end();
      }
    } catch {
      // DB also unavailable — use env fallback
    }
  }

  // Final fallback: return the default tenant from env config
  const defaultTenantId = process.env.DEFAULT_TENANT_ID ?? "default";
  return NextResponse.json({
    tenants: [
      {
        id: defaultTenantId,
        code: defaultTenantId,
        name: defaultTenantId,
        status: "active",
      },
    ],
  });
}
