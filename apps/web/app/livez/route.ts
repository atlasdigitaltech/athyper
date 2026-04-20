// No deps; excluded from middleware matcher so Docker healthcheck (Host: localhost) bypasses the host-guard. Dep health → /api/admin/health.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ status: "alive", ts: Date.now() }, { status: 200 });
}
