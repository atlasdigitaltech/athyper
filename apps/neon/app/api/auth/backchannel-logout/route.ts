// POST /api/auth/backchannel-logout — Keycloak OIDC back-channel logout endpoint (server-to-server, no UI consumer).
import { createBackchannelLogoutPostHandler } from "@athyper/auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const POST = createBackchannelLogoutPostHandler(PLANE_KEY);
