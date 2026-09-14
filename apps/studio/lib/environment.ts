import { createAppEnvironment } from "@athyper/platform-iam-auth-bff/runtime-environment";
export {
  REQUIRED_BFF_ENVIRONMENT,
  type EnvironmentValidation,
} from "@athyper/platform-iam-auth-bff/runtime-environment";

export const DEFAULT_APP_ORIGIN = "http://localhost:3200";
export const readAppEnvironment = createAppEnvironment(DEFAULT_APP_ORIGIN);
export const validateRuntimeEnvironment = readAppEnvironment.validate;
export const assertRuntimeEnvironment = readAppEnvironment.assert;
