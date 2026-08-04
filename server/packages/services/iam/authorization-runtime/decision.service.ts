import {
  authorizationFingerprint,
  CanonicalAuthorizationEvaluator,
} from "../authorization-evaluator/index.js";
import type {
  CanonicalAuthorizationRepository,
  CanonicalDecisionRequest,
  CollectionDecisionRequest,
} from "../authorization-evaluator/index.js";
import {
  AUTHORIZATION_RUNTIME_CONTRACT_VERSION,
  type AuthorizationBatchEnvelope,
  type AuthorizationDecisionAuditRecord,
  type AuthorizationDecisionAuditSink,
  type AuthorizationDecisionEnvelope,
  type AuthorizationDecisionMetrics,
  type AuthorizationMaterializationEnvelope,
  type ProductionAuthorizationDecisionApi,
} from "./types.js";

export class ProductionAuthorizationDecisionService
  implements ProductionAuthorizationDecisionApi {
  private readonly evaluator: CanonicalAuthorizationEvaluator;

  constructor(
    repository: CanonicalAuthorizationRepository,
    private readonly audit: AuthorizationDecisionAuditSink,
    private readonly metrics?: AuthorizationDecisionMetrics,
  ) {
    this.evaluator = new CanonicalAuthorizationEvaluator(repository);
  }

  async decide(
    request: CanonicalDecisionRequest,
  ): Promise<AuthorizationDecisionEnvelope> {
    const batch = await this.decideBatch([request]);
    const result = batch.results[0];
    if (!result) throw new Error("authorization batch returned no decision");
    return result;
  }

  async decideBatch(
    requests: readonly CanonicalDecisionRequest[],
  ): Promise<AuthorizationBatchEnvelope> {
    if (requests.length === 0) {
      return {
        contractVersion: AUTHORIZATION_RUNTIME_CONTRACT_VERSION,
        results: [],
      };
    }
    assertOneAuthorityBoundary(requests);
    const started = process.hrtime.bigint();
    const results = await this.evaluator.evaluateBatch(requests);
    const elapsedMicroseconds = Number(
      (process.hrtime.bigint() - started) / 1_000n,
    );
    const perDecisionMicroseconds = Math.max(
      0,
      Math.round(elapsedMicroseconds / results.length),
    );
    const envelopes: AuthorizationDecisionEnvelope[] = results.map((result) => ({
      contractVersion: AUTHORIZATION_RUNTIME_CONTRACT_VERSION,
      authorizationFingerprint: authorizationFingerprint(result),
      result,
    }));
    const auditRows: AuthorizationDecisionAuditRecord[] = requests.map(
      (request, index) => ({
        request,
        envelope: envelopes[index]!,
        evaluationMicroseconds: perDecisionMicroseconds,
      }),
    );
    // A production decision is not complete without durable evidence. Failure
    // to append therefore fails the request closed.
    await this.audit.append(auditRows);
    for (const row of auditRows) {
      this.metrics?.observe({
        plane: row.request.subject.plane,
        mode: row.request.mode,
        decision: row.envelope.result.decision,
        reason: row.envelope.result.reason,
        evaluationMicroseconds: row.evaluationMicroseconds,
      });
    }
    return {
      contractVersion: AUTHORIZATION_RUNTIME_CONTRACT_VERSION,
      results: envelopes,
    };
  }

  async materialize(
    request: CollectionDecisionRequest,
  ): Promise<AuthorizationMaterializationEnvelope> {
    const envelope = await this.decide(request);
    if (envelope.result.mode !== "collection") {
      throw new Error("collection request returned a non-collection decision");
    }
    return {
      contractVersion: AUTHORIZATION_RUNTIME_CONTRACT_VERSION,
      authorizationFingerprint: envelope.authorizationFingerprint,
      decision: envelope.result.decision,
      reason: envelope.result.reason,
      evidence: envelope.result.evidence,
      materialization: envelope.result.materialization,
    };
  }
}

export class NoopAuthorizationDecisionAuditSink
  implements AuthorizationDecisionAuditSink {
  async append(): Promise<void> {
    // Tests and explicitly non-production tools may use this sink. Runtime
    // factories deliberately require a durable sink.
  }
}

function assertOneAuthorityBoundary(
  requests: readonly CanonicalDecisionRequest[],
): void {
  const first = requests[0]!.subject;
  if (requests.some((request) =>
    request.subject.plane !== first.plane
    || request.subject.tenantOrAccountId !== first.tenantOrAccountId
    || request.subject.principalId !== first.principalId
  )) {
    throw new Error(
      "one authorization batch cannot cross principal, plane, or tenant/account",
    );
  }
}

