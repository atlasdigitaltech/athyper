// F8 Phase 3 — liveness probe for the containerised web app.
//
// Mirrors the server runtime convention at server/src/runtimes/liveness.ts:
//   - No dependency access (no Redis, no BFF fetch, no session lookup).
//   - Always 200 — reports "the Node event loop is responsive".
//   - Excluded from apps/web/middleware.ts matcher so the host-guard and
//     CSRF/session gates don't touch it (healthcheck requests from Docker
//     carry `Host: localhost:3000`, not the gateway host).
//
// Used by:
//   - Docker Compose healthcheck on the athyper-neon-web service.
//   - Any orchestrator liveness probe for the web tier.
//
// For dependency health (Redis reachability, BFF reachability) use
// /api/admin/health — that route is session-gated and lives in Node runtime.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ status: "alive", ts: Date.now() }, { status: 200 });
}
