import type {
  CanonicalDecisionRequest,
  DecisionFacts,
  MeshAuthorizationRepository,
  NeonAdminAuthorizationRepository,
} from "./types.js";
import { CANONICAL_AUTHORIZATION_CONTRACT_VERSION } from "./types.js";

export interface NeonAdminFactLoader {
  loadNeonAdminFacts(
    requests: readonly CanonicalDecisionRequest[],
  ): Promise<readonly DecisionFacts[]>;
}

export interface MeshFactLoader {
  loadMeshFacts(
    requests: readonly CanonicalDecisionRequest[],
  ): Promise<readonly DecisionFacts[]>;
}

export function createNeonAdminAuthorizationRepository(
  loader: NeonAdminFactLoader,
): NeonAdminAuthorizationRepository {
  return {
    authority: "neon_admin",
    contractVersion: CANONICAL_AUTHORIZATION_CONTRACT_VERSION,
    loadDecisionFacts: (requests) => loader.loadNeonAdminFacts(requests),
  };
}

export function createMeshAuthorizationRepository(
  loader: MeshFactLoader,
): MeshAuthorizationRepository {
  return {
    authority: "mesh",
    contractVersion: CANONICAL_AUTHORIZATION_CONTRACT_VERSION,
    loadDecisionFacts: (requests) => loader.loadMeshFacts(requests),
  };
}
