import { createEnvironmentAuthRuntime, KEYCLOAK_SESSION_TTLS_MS } from "@athyper/platform-iam-auth-bff/environment";

export const authRuntime = createEnvironmentAuthRuntime({
  plane: "mesh",
  clientId: "mesh-web",
  authorizedRole: "AUTHORIZED",
  origin: process.env.APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3100",
  ...KEYCLOAK_SESSION_TTLS_MS.mesh,
});
export const auth = authRuntime.handlers;
