import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * PATCH /api/finance/journals/[jeId]
 *
 * BFF proxy — update a draft (status='created') journal entry.
 *
 * Body (all optional):
 *   description?  — header description
 *   posting_date? — ISO date string
 *   lines?[]      — full line replacement (minimum 2, must be balanced)
 *
 * Responses from runtime:
 *   200 { journal_entry_id, je_number, status: "created" }
 *   404 JOURNAL_NOT_FOUND   — JE not found
 *   409 INVALID_JE_STATUS   — JE is not in 'created' status
 *   400 UNBALANCED / ACCOUNT_NOT_FOUND
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ jeId: string }> },
) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jeId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/journals/${jeId}`, {
      method: "PATCH",
      headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/finance/journals/[jeId] PATCH]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 502 });
  }
}
