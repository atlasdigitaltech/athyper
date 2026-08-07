// GET /api/auth/login — start OIDC authorization code flow against the Neon plane's Keycloak realm.
import { createLoginGetHandler } from "@athyper/platform-iam-auth-bff";
import { PLANE_KEY } from "@/lib/plane";

export const GET = createLoginGetHandler(PLANE_KEY);
