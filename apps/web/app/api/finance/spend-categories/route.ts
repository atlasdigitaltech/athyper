import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders, forwardSearchParams } from "@/lib/server/runtime-headers";

const ALLOWED = [
  "id",
  "parentId",
  "q",
  "status",
  "procurementType",
  "visibility",
  "rootCode",
  "limit",
  "summary",
  "includeAncestors",
] as const;

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const qs = forwardSearchParams(req.url, ALLOWED);
    const suffix = qs ? `?${qs}` : "";
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/spend-categories${suffix}`, {
      headers: buildRuntimeHeaders(session),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({ items: [], summary: {} }));
    return NextResponse.json(body, { status: res.status });
  } catch (e) {
    console.error("[api/finance/spend-categories]", e instanceof Error ? e.message : e);
    return NextResponse.json({ items: [], summary: {} }, { status: 503 });
  }
}
