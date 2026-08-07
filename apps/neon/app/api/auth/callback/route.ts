// GET /api/auth/callback — OIDC redirect_uri: exchanges authorization code for tokens and mints the Neon session cookie.
import { createCallbackGetHandler } from "@athyper/platform-iam-auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const GET = createCallbackGetHandler(PLANE_KEY);
