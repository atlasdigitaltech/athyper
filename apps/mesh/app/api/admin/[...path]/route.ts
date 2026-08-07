import "server-only";

import { buildRelayHandler } from "@athyper/platform-bff-relay";
import { getMeshServerSession } from "@/lib/server/session";

const RUNTIME_API_URL = process.env.RUNTIME_API_URL ?? "http://localhost:4000";

// Relays /api/admin/<segments> → runtime /api/platform/admin/<segments>.
// Mesh is read-only (PLANE_CONFIGS.mesh.mutationMode), so this route exists to
// let partner-tier tenant_admin principals view their own tenant configuration.
// The runtime's tenant_admin group check is the authorization gate; this relay
// only bridges the session.
const handler = buildRelayHandler({
  resolveSession: () => getMeshServerSession(),
  runtimeApiUrl: RUNTIME_API_URL,
  appLabel: "mesh:admin-relay",
  routePrefix: "platform/admin",
});

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
