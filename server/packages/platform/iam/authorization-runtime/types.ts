import type {
  CanonicalDecisionRequest,
  CanonicalDecisionResult,
  CollectionDecisionRequest,
  CollectionMaterialization,
} from "../authorization-evaluator/index.js";

export const AUTHORIZATION_RUNTIME_CONTRACT_VERSION =
  "wave5.canonical-runtime.v1" as const;

export interface AuthorizationDecisionEnvelope {
  readonly contractVersion: typeof AUTHORIZATION_RUNTIME_CONTRACT_VERSION;
  readonly authorizationFingerprint: string;
  readonly result: CanonicalDecisionResult;
}

export interface AuthorizationBatchEnvelope {
  readonly contractVersion: typeof AUTHORIZATION_RUNTIME_CONTRACT_VERSION;
  readonly results: readonly AuthorizationDecisionEnvelope[];
}

export interface AuthorizationMaterializationEnvelope {
  readonly contractVersion: typeof AUTHORIZATION_RUNTIME_CONTRACT_VERSION;
  readonly authorizationFingerprint: string;
  readonly decision: "allow" | "deny";
  readonly reason: CanonicalDecisionResult["reason"];
  readonly evidence: CanonicalDecisionResult["evidence"];
  readonly materialization: CollectionMaterialization;
}

export interface AuthorizationDecisionAuditRecord {
  readonly request: CanonicalDecisionRequest;
  readonly envelope: AuthorizationDecisionEnvelope;
  readonly evaluationMicroseconds: number;
  readonly correlationId?: string;
}

export interface AuthorizationDecisionAuditSink {
  append(records: readonly AuthorizationDecisionAuditRecord[]): Promise<void>;
}

export interface AuthorizationDecisionMetrics {
  observe(input: {
    readonly plane: CanonicalDecisionRequest["subject"]["plane"];
    readonly mode: CanonicalDecisionRequest["mode"];
    readonly decision: CanonicalDecisionResult["decision"];
    readonly reason: CanonicalDecisionResult["reason"];
    readonly evaluationMicroseconds: number;
  }): void;
}

export interface ProductionAuthorizationDecisionApi {
  decide(request: CanonicalDecisionRequest): Promise<AuthorizationDecisionEnvelope>;
  decideBatch(
    requests: readonly CanonicalDecisionRequest[],
  ): Promise<AuthorizationBatchEnvelope>;
  materialize(
    request: CollectionDecisionRequest,
  ): Promise<AuthorizationMaterializationEnvelope>;
}

