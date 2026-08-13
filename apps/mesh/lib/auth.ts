import { createEnvironmentAuthRuntime } from "@athyper/platform-iam-auth-bff/environment";

export const authRuntime = createEnvironmentAuthRuntime({
  plane: "mesh",
  clientId: "mesh-web",
  authorizedRole: "MESH_BUYER_USER",
  origin: process.env.APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000",
});
export const auth = authRuntime.handlers;
