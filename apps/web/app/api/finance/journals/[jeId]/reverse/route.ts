import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/server/get-server-session";
import { RUNTIME_API_URL, buildRuntimeHeaders } from "@/lib/server/runtime-headers";

/**
 * POST /api/finance/journals/[jeId]/reverse
 *
 * BFF proxy — creates a mirror reversal of a posted journal entry.
 *
 * Body (optional):
 *   posting_date?  — reversal posting date (defaults to today)
 *   description?   — override description (defaults to "Reversal of {jeNumber}")
 *
 * Responses from runtime:
 *   201 { reversal_journal_entry_id, je_number, status: "posted", reversal_of }
 *   404 JOURNAL_NOT_FOUND  — JE not found
 *   409 ALREADY_REVERSED   — JE already has a reversal
 *   409 INVALID_JE_STATUS  — JE is not in 'posted' status
 */
export async function POST(
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
    const res = await fetch(`${RUNTIME_API_URL}/api/finance/journals/${jeId}/reverse`, {
      method: "POST",
      headers: { ...buildRuntimeHeaders(session), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[api/finance/journals/[jeId]/reverse POST]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 502 });
  }
}
