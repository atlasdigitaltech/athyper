import { createEnvironmentAuthRuntime } from "@athyper/platform-iam-auth-bff/environment";

export const authRuntime = createEnvironmentAuthRuntime({
  plane: "studio",
  clientId: "studio-web",
  authorizedRole: "STUDIO_USER",
  origin: process.env.APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000",
});
export const auth = authRuntime.handlers;
