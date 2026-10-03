import { createHash } from "node:crypto";
import type {
  AtlasPlaneAdmissionResolver,
  AtlasToolAuthority,
} from "@athyper/server-contract-ai";
import { AtlasServiceError } from "./errors.js";

export interface AtlasToolFeatureGates {
  readonly toolsEnabled: boolean;
  readonly mutationsEnabled: boolean;
}

/** Deployment gates only narrow owner decisions; enabling a gate grants no authority. */
export function createAtlasGatedToolAuthority(
  authority: AtlasToolAuthority,
  gates: AtlasToolFeatureGates,
): AtlasToolAuthority {
  const readEnabled = gates.toolsEnabled === true;
  const mutationEnabled = readEnabled && gates.mutationsEnabled === true;
  return {
    async authorize(input) {
      const decision = await authority.authorize(input);
      const enabled =
        input.manifest.access === "mutation" ? mutationEnabled : readEnabled;
      return {
        ...decision,
        allowed: decision.allowed && enabled,
        policyRevision: gatedRevision(
          decision.policyRevision,
          readEnabled,
          mutationEnabled,
        ),
        ...(!enabled && decision.allowed
          ? {
              autonomyDecision: "denied" as const,
              reasonCode: readEnabled
                ? "mutation_tools_disabled"
                : "tools_disabled",
            }
          : {}),
      };
    },
  };
}

/** Apply the same deployment boundary before discovery and at tool invocation. */
export function createAtlasGatedPlaneAdmission(
  admission: AtlasPlaneAdmissionResolver,
  gates: AtlasToolFeatureGates,
): AtlasPlaneAdmissionResolver {
  const readEnabled = gates.toolsEnabled === true;
  const mutationEnabled = readEnabled && gates.mutationsEnabled === true;
  return {
    async resolve(context) {
      const decision = await admission.resolve(context);
      return {
        ...decision,
        readToolsAllowed: decision.readToolsAllowed && readEnabled,
        mutationToolsAllowed: decision.mutationToolsAllowed && mutationEnabled,
        policyRevision: gatedRevision(
          decision.policyRevision,
          readEnabled,
          mutationEnabled,
        ),
      };
    },
  };
}

function gatedRevision(
  revision: string,
  readEnabled: boolean,
  mutationEnabled: boolean,
): string {
  if (typeof revision !== "string" || !revision.trim())
    throw new AtlasServiceError(
      "TOOL_INVALID",
      "Atlas policy revision is required.",
    );
  return createHash("sha256")
    .update(
      JSON.stringify([
        "atlas-tool-feature-gates/1",
        revision,
        readEnabled,
        mutationEnabled,
      ]),
    )
    .digest("hex");
}
