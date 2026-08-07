import "server-only";

import { buildRelayHandler } from "@athyper/platform-bff-relay";
import { getAdminServerSession } from "@/lib/server/session";

const RUNTIME_API_URL = process.env.RUNTIME_API_URL ?? "http://localhost:4000";

// Relays /api/admin/<segments> → runtime /api/platform/admin/<segments>.
// Runtime enforces the tenant_admin group check; this relay just bridges the
// session. The "platform/admin" prefix matches neon's same-named BFF route
// so <TenantAdminSection> works identically across all three planes.
const handler = buildRelayHandler({
  resolveSession: () => getAdminServerSession(),
  runtimeApiUrl: RUNTIME_API_URL,
  appLabel: "admin:admin-relay",
  routePrefix: "platform/admin",
});

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
