import { readAppEnvironment } from "./environment";
import {
  createEnvironmentAuthRuntime,
  readSessionTtls,
} from "@athyper/platform-iam-auth-bff/environment";

export const authRuntime = createEnvironmentAuthRuntime(() => ({
  plane: "studio",
  clientId: "studio-web",
  authorizedRole: "AUTHORIZED",
  origin: readAppEnvironment().appOrigin,
  configuration: readAppEnvironment(),
  ...readSessionTtls("studio"),
}));
export const auth = authRuntime.handlers;
