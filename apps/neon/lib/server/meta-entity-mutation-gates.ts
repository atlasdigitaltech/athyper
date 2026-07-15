import { NextResponse } from "next/server";

/** Public generic CRUD is never a ledger posting surface. */
export function rejectPublicLedgerMutation(renderer: unknown): NextResponse | null {
  if (renderer !== "ledger") return null;
  return NextResponse.json(
    {
      error: "LEDGER_READ_ONLY",
      message: "Ledger records are read-only. Use an authorized posting, reversal, or adjustment command.",
    },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "X-Entity-Mutation-Policy": "ledger-read-only",
      },
    },
  );
}
