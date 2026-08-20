import { createEnvironmentAuthRuntime, KEYCLOAK_SESSION_TTLS_MS } from "@athyper/platform-iam-auth-bff/environment";

export const authRuntime = createEnvironmentAuthRuntime({
  plane: "neon",
  clientId: "neon-web",
  authorizedRole: "AUTHORIZED",
  origin: process.env.APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000",
  ...KEYCLOAK_SESSION_TTLS_MS.neon,
});
export const auth = authRuntime.handlers;
