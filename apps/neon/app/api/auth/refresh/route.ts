// POST /api/auth/refresh — exchange the stored refresh token for a new access token (called near access_token expiry).
import { createRefreshPostHandler } from "@athyper/auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const POST = createRefreshPostHandler(PLANE_KEY);
