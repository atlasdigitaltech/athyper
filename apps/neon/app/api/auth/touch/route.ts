// POST /api/auth/touch — extend rolling session expiry on user activity (no token refresh, just cookie touch).
import { createTouchPostHandler } from "@athyper/auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const POST = createTouchPostHandler(PLANE_KEY);
