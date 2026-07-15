// {GET|POST|PUT|PATCH|DELETE} /api/records/[...path] — BFF relay to runtime /api/records/*.
//
// LIFECYCLE: Used ONLY by packages/product-deprecated/runtime-ui/. Delete this
// file alongside the deprecated tree. Tied to the server-side /records/* legacy
// aliases that exist for the same reason — see server/packages/services/records/
// routes/records.route.ts and the sibling sub-resource route files
// (action-dispatcher, versions, bulk-preflight, bulk-action, bulk-crud). All of
// those mounts come out in the same PR. After deletion, narrow the allowlist in
// apps/neon/scripts/check-runtime-api-paths.ts and server/scripts/
// check-runtime-server-paths.ts so strict guards enforce true cleanliness.
import { type NextRequest } from "next/server";
import type { RelayParams } from "@athyper/bff-relay";
import { makeModuleRelay } from "@/lib/server/make-module-relay";

const relay = makeModuleRelay("records", {
  passthroughHeaders: ["Idempotency-Key", "X-Idempotency-Key", "If-Match"],
});

export async function GET(request: NextRequest, context: RelayParams) {
  const { path } = await context.params;
  recordLegacyRecordsCall(request, path);
  return relay.GET(request, { params: Promise.resolve({ path }) });
}

export async function POST(request: NextRequest, context: RelayParams) {
  const { path } = await context.params;
  recordLegacyRecordsCall(request, path);
  return relay.POST(request, { params: Promise.resolve({ path }) });
}

export async function PUT(request: NextRequest, context: RelayParams) {
  const { path } = await context.params;
  recordLegacyRecordsCall(request, path);
  return relay.PUT(request, { params: Promise.resolve({ path }) });
}

export async function PATCH(request: NextRequest, context: RelayParams) {
  const { path } = await context.params;
  recordLegacyRecordsCall(request, path);
  return relay.PATCH(request, { params: Promise.resolve({ path }) });
}

export async function DELETE(request: NextRequest, context: RelayParams) {
  const { path } = await context.params;
  recordLegacyRecordsCall(request, path);
  return relay.DELETE(request, { params: Promise.resolve({ path }) });
}

function recordLegacyRecordsCall(request: NextRequest, path: readonly string[]): void {
  const referer = request.headers.get("referer");
  let callerRoute = request.headers.get("x-athyper-caller-route")?.slice(0, 160) ?? "unknown";
  if (callerRoute === "unknown" && referer) {
    try { callerRoute = new URL(referer).pathname.slice(0, 160) || "unknown"; } catch { /* untrusted telemetry hint */ }
  }
  console.warn("[legacy-runtime/records]", {
    event: "legacy_records_call",
    method: request.method,
    callerRoute,
    entity: path[0] ?? "unknown",
    migrationBlocker: "product-deprecated/runtime-ui retirement",
  });
}
