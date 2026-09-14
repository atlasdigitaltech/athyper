import { readAppEnvironment } from "./environment";
import {
  createEnvironmentAuthRuntime,
  readSessionTtls,
} from "@athyper/platform-iam-auth-bff/environment";

export const authRuntime = createEnvironmentAuthRuntime(() => ({
  plane: "neon",
  clientId: "neon-web",
  authorizedRole: "AUTHORIZED",
  origin: readAppEnvironment().appOrigin,
  configuration: readAppEnvironment(),
  ...readSessionTtls("neon"),
}));
export const auth = authRuntime.handlers;
