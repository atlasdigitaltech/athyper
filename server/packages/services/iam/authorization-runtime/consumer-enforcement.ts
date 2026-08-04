import { randomUUID } from "node:crypto";

import type {
  CanonicalPlane,
  ResourceCoordinates,
} from "../authorization-evaluator/index.js";
import type {
  AuthorizationDecisionEnvelope,
  AuthorizationMaterializationEnvelope,
  ProductionAuthorizationDecisionApi,
} from "./types.js";

export type CanonicalCollectionConsumer =
  | "list"
  | "count"
  | "export"
  | "batch"
  | "session";

export type CanonicalResourceConsumer =
  | "detail"
  | "read"
  | "download"
  | "share"
  | "update"
  | "delete"
  | "workflow"
  | "document"
  | "metadata"
  | "admin"
  | "mesh"
  | "ai";

export interface CanonicalConsumerSubject {
  readonly plane: CanonicalPlane;
  readonly tenantOrAccountId: string;
  readonly principalId: string;
  readonly mfaSatisfied: boolean;
  readonly sodSatisfied: boolean;
}

export class CanonicalAuthorizationDeniedError extends Error {
  readonly statusCode = 403;
  readonly code = "CANONICAL_AUTHORIZATION_DENIED";

  constructor(
    readonly envelope:
      | AuthorizationDecisionEnvelope
      | AuthorizationMaterializationEnvelope,
  ) {
    super(`Authorization denied: ${
      "result" in envelope ? envelope.result.reason : envelope.reason
    }`);
  }
}

/**
 * Shared enforcement boundary for every runtime consumer. Callers supply exact
 * catalog IDs; this class never parses permission text or derives an action.
 */
export class CanonicalConsumerAuthorization {
  constructor(private readonly decisions: ProductionAuthorizationDecisionApi) {}

  async collection(input: {
    readonly consumer: CanonicalCollectionConsumer;
    readonly subject: CanonicalConsumerSubject;
    readonly entityOperationId: string;
    readonly evaluatedAt?: Date;
  }): Promise<AuthorizationMaterializationEnvelope> {
    const envelope = await this.decisions.materialize({
      requestId: requestId(input.consumer),
      mode: "collection",
      subject: subject(input.subject),
      assurance: assurance(input.subject),
      evaluatedAt: input.evaluatedAt ?? new Date(),
      entityOperationId: input.entityOperationId,
    });
    if (envelope.decision !== "allow") {
      throw new CanonicalAuthorizationDeniedError(envelope);
    }
    return envelope;
  }

  async resource(input: {
    readonly consumer: CanonicalResourceConsumer;
    readonly subject: CanonicalConsumerSubject;
    readonly entityOperationId: string;
    readonly resource: ResourceCoordinates;
    readonly evaluatedAt?: Date;
  }): Promise<AuthorizationDecisionEnvelope> {
    assertResourceBoundary(input.subject, input.resource);
    const envelope = await this.decisions.decide({
      requestId: requestId(input.consumer),
      mode: "entity_resource",
      subject: subject(input.subject),
      assurance: assurance(input.subject),
      evaluatedAt: input.evaluatedAt ?? new Date(),
      entityOperationId: input.entityOperationId,
      resource: input.resource,
    });
    if (envelope.result.decision !== "allow") {
      throw new CanonicalAuthorizationDeniedError(envelope);
    }
    return envelope;
  }

  async capability(input: {
    readonly consumer: "admin" | "mesh" | "ai";
    readonly subject: CanonicalConsumerSubject;
    readonly permissionId: string;
    readonly evaluatedAt?: Date;
  }): Promise<AuthorizationDecisionEnvelope> {
    const envelope = await this.decisions.decide({
      requestId: requestId(input.consumer),
      mode: "registered_capability",
      subject: subject(input.subject),
      assurance: assurance(input.subject),
      evaluatedAt: input.evaluatedAt ?? new Date(),
      permissionId: input.permissionId,
    });
    if (envelope.result.decision !== "allow") {
      throw new CanonicalAuthorizationDeniedError(envelope);
    }
    return envelope;
  }
}

function subject(input: CanonicalConsumerSubject) {
  return {
    plane: input.plane,
    tenantOrAccountId: input.tenantOrAccountId,
    principalId: input.principalId,
  };
}

function assurance(input: CanonicalConsumerSubject) {
  return {
    mfaSatisfied: input.mfaSatisfied,
    sodSatisfied: input.sodSatisfied,
  };
}

function assertResourceBoundary(
  subjectInput: CanonicalConsumerSubject,
  resource: ResourceCoordinates,
): void {
  if (resource.tenantOrAccountId !== subjectInput.tenantOrAccountId) {
    throw new Error(
      "canonical resource authorization rejects a cross-tenant/account resource",
    );
  }
  if (!resource.entityId || !resource.recordId) {
    throw new Error(
      "canonical resource authorization requires exact entity and record IDs",
    );
  }
}

function requestId(consumer: string): string {
  return `${consumer}:${randomUUID()}`;
}
