import { readFileSync, statSync } from "node:fs";
import type {
  AuthorizationManagementRolloutPolicy,
  AuthorizationManagementRolloutPolicySource,
  AuthorizationWriterSwitchGate,
  AuthorizationWriterSwitchState,
} from "@athyper/server-contract-auth";
const denied: AuthorizationWriterSwitchState = {
  approved: false,
  targetWritable: false,
  sourceWatermark: null,
  appliedWatermark: null,
  goldenCorpusSha256: null,
  goldenEvaluatorCorpusQualified: false,
  ddlEpochIntegrationQualified: false,
  approvedBy: [],
  approvalTicket: null,
};
/** Operator-mounted evidence. This loader never supplies approvals or a legacy writer. */
export function createConfiguredAuthorizationManagement(path?: string): {
  rolloutPolicies: AuthorizationManagementRolloutPolicySource;
  writerGate: AuthorizationWriterSwitchGate;
} {
  const load = () => {
    if (!path) return {};
    if (statSync(path).size > 65536)
      throw new Error("AUTHORIZATION_MANAGEMENT_POLICY_TOO_LARGE");
    const data = JSON.parse(readFileSync(path, "utf8"));
    if (
      data?.schemaVersion !== 1 ||
      !Array.isArray(data.planes) ||
      data.planes.length > 3
    )
      throw new Error("AUTHORIZATION_MANAGEMENT_POLICY_INVALID");
    const result: Record<
      string,
      {
        policy: AuthorizationManagementRolloutPolicy;
        writerSwitch: AuthorizationWriterSwitchState;
      }
    > = {};
    for (const entry of data.planes) {
      const p = entry?.policy,
        w = entry?.writerSwitch;
      if (
        !p ||
        !["neon", "mesh", "studio"].includes(p.planeKey) ||
        Object.hasOwn(result, p.planeKey) ||
        !["legacy", "shadow", "enforce"].includes(p.mode) ||
        typeof p.revision !== "string" ||
        !p.revision.trim() ||
        typeof p.approved !== "boolean" ||
        (p.approvedAt !== undefined &&
          !Number.isFinite(Date.parse(p.approvedAt))) ||
        (p.expiresAt !== undefined &&
          !Number.isFinite(Date.parse(p.expiresAt))) ||
        (p.cohortPrincipalIds !== undefined &&
          (!Array.isArray(p.cohortPrincipalIds) ||
            !p.cohortPrincipalIds.every(
              (v: unknown) => typeof v === "string" && v.length > 0,
            ))) ||
        !w ||
        ![
          "approved",
          "targetWritable",
          "goldenEvaluatorCorpusQualified",
          "ddlEpochIntegrationQualified",
        ].every((k) => typeof w[k] === "boolean") ||
        ![
          "sourceWatermark",
          "appliedWatermark",
          "goldenCorpusSha256",
          "approvalTicket",
        ].every((k) => w[k] === null || typeof w[k] === "string") ||
        !Array.isArray(w.approvedBy) ||
        !w.approvedBy.every(
          (v: unknown) => typeof v === "string" && v.length > 0,
        )
      )
        throw new Error("AUTHORIZATION_MANAGEMENT_POLICY_INVALID");
      result[p.planeKey] = { policy: p, writerSwitch: w };
    }
    return result;
  };
  load(); // Configuration errors fail startup; later removal/revocation fails closed.
  return {
    rolloutPolicies: {
      async loadExactPlane(plane) {
        try {
          return load()[plane]?.policy;
        } catch {
          return undefined;
        }
      },
    },
    writerGate: {
      async inspect(plane) {
        try {
          return load()[plane]?.writerSwitch ?? { ...denied, approvedBy: [] };
        } catch {
          return { ...denied, approvedBy: [] };
        }
      },
    },
  };
}
