import type { PlaneKey } from "@athyper/server-foundation/context";

export interface AuthenticatedEmailCanaryRequest {
  readonly environment: "stg";
  readonly sourceRevision: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly planeKey: PlaneKey;
  /** Approved recipient supplied by protected operational configuration. */
  readonly recipientAddress: string;
}

export interface AuthenticatedEmailCanaryAuthorizer {
  authorize(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly planeKey: PlaneKey;
    readonly action: "notifications.email_canary.execute";
  }): Promise<{ readonly authenticated: boolean; readonly authorized: boolean }>;
}

export interface EmailCanaryDispatchClient {
  dispatch(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly planeKey: PlaneKey;
    readonly recipientAddress: string;
    readonly idempotencyKey: string;
  }): Promise<{
    readonly deliveryId: string;
    readonly providerMessageId: string;
  }>;
}

export interface EmailCanaryObservationClient {
  observe(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly planeKey: PlaneKey;
    readonly deliveryId: string;
    readonly providerMessageId: string;
  }): Promise<{
    readonly providerAccepted: boolean;
    readonly providerEventObserved: boolean;
    readonly delivered: boolean;
    readonly activityCenterPublished: boolean;
  }>;
}

export interface StagingEmailCanaryEvidence {
  readonly apiVersion: "athyper.io/v1alpha1";
  readonly kind: "StagingNotificationEvidence";
  readonly metadata: { readonly gate: "email-canary" };
  readonly spec: {
    readonly environment: "stg";
    readonly status: "passed";
    readonly sourceRevision: string;
    readonly recordedAt: string;
    readonly channel: "email";
    readonly canaryIdentity: {
      readonly tenantId: string;
      readonly principalId: string;
      readonly recipientRef: string;
    };
    readonly providerReference: string;
    readonly assertions: {
      readonly authenticatedDispatch: true;
      readonly providerAccepted: true;
      readonly providerEventObserved: true;
      readonly delivered: true;
      readonly activityCenterPublished: true;
    };
  };
}
