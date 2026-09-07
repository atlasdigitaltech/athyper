import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { ParameterRepository } from "@athyper/server-contract-control-admin";
import type { ExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";
import { HttpError } from "@athyper/server-runtime-http";
import { validateParameterValue } from "./parameter-control.js";
/** Internal, allowlisted consumer; never grants callers access to the administration API. */
export function createExperienceParameterConsumer(
  repositories: ExactPlaneRepositoryProvider<ParameterRepository>,
) {
  return async (context: VerifiedRequestContext, at: Date) => {
    const repo = repositories.require(context.planeKey);
    if (!repo.readEffective)
      throw new HttpError(
        503,
        "PARAMETER_ATOMIC_READ_REQUIRED",
        "Runtime requires an atomic configuration snapshot",
      );
    const result = await repo.readEffective(
      context.tenantId,
      "experience.profile.default_density",
      at.toISOString(),
    );
    if (!result)
      throw new HttpError(
        503,
        "PARAMETER_DEFINITION_REQUIRED",
        "Experience parameter catalog is not installed",
      );
    const { definition: d, value: v } = result;
    if (
      d.status !== "active" ||
      d.reloadMode !== "next_request" ||
      d.valueType !== "enum"
    )
      throw new HttpError(
        503,
        "PARAMETER_RELOAD_MODE_MISMATCH",
        "Experience density requires an active next_request enum",
      );
    const value = v ? v.value : d.defaultValue;
    try {
      validateParameterValue(d, value);
    } catch {
      throw new HttpError(
        503,
        "PARAMETER_CONSUMER_VALUE_INVALID",
        "Invalid experience density configuration",
      );
    }
    if (value !== "comfortable" && value !== "compact")
      throw new HttpError(
        503,
        "PARAMETER_CONSUMER_VALUE_INVALID",
        "Invalid experience density",
      );
    return {
      densityCode: value as "comfortable" | "compact",
      configurationRevision: JSON.stringify([
        d.id,
        d.revision,
        v?.id ?? null,
        v?.version ?? null,
      ]),
    };
  };
}
