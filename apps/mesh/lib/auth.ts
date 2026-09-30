import { readAppEnvironment } from "./environment";
import {
  createEnvironmentAuthRuntime,
  readSessionTtls,
} from "@athyper/platform-iam-auth-bff/environment";

export const authRuntime = createEnvironmentAuthRuntime(() => ({
  plane: "mesh",
  clientId: "mesh-web",
  authorizedRole: "AUTHORIZED",
  origin: readAppEnvironment().appOrigin,
  configuration: readAppEnvironment(),
  ...readSessionTtls("mesh"),
}));
export const auth = authRuntime.handlers;
