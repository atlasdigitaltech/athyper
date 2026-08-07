/**
 * BFF relay: GET /api/master/company-code/:id/profile
 *
 * Forwards to the runtime API which reads the company_code temporal profile
 * (timezone, locale, date format, week start). Consumed by
 * useTemporalContext() to drive DatePicker localisation per document owner.
 */

import "server-only";
import { buildRelayHandler } from "@athyper/platform-bff-relay";
import { getNeonServerSession } from "@/lib/server/session";

const handler = buildRelayHandler({
  resolveSession: () => getNeonServerSession(),
  runtimeApiUrl: process.env["RUNTIME_API_URL"] ?? "http://localhost:4000",
  appLabel: "neon:master:company-code-profile",
});

export async function GET(req: Parameters<typeof handler>[0], ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // The bff-relay generic handler expects { path: string[] } — rebuild it from the dynamic [id] segment.
  return handler(req, { params: Promise.resolve({ path: ["master", "company-code", id, "profile"] }) });
}
