import { createHash } from "node:crypto";
import type { JobDefinition, JobPublisher } from "@athyper/server-contract-jobs";

export const ONBOARDING_QUEUE = "studio-onboarding";
export const ONBOARDING_RECONCILE_JOB = "provisioning-reconcile";

const jobs = [
  ["onboarding.outbox.dispatch", "outbox-dispatch"],
  ["onboarding.provisioning.reconcile", ONBOARDING_RECONCILE_JOB],
  ["onboarding.subscription.activate", "subscription-activate"],
  ["onboarding.authorization.invalidate", "authorization-invalidate"],
  ["onboarding.identity.observe", "identity-organization-observe"],
  ["onboarding.mesh-invitation.expire", "mesh-invitation-expire"],
  ["onboarding.evidence.retry", "evidence-retry"],
  ["onboarding.offboarding.retain", "offboarding-retention"],
] as const;

export const ONBOARDING_JOB_DEFINITIONS: readonly JobDefinition[] = Object.freeze(
  jobs.map(([code, name]): JobDefinition => ({
    code,
    owner: "@athyper/server-plane-studio-onboarding",
    queue: ONBOARDING_QUEUE,
    name,
    scope: "plane",
    payloadSchema: { name: code, version: 1 },
    maxAttempts: 8,
    timeoutMs: 60_000,
  })),
);

export interface OnboardingReconcilePayload {
  readonly caseId: string;
  readonly desiredVersion: number;
  readonly reason: "desired_state_changed" | "receipt_observed" | "retry" | "scheduled_drift_scan";
}

/** Enqueues one semantic reconciliation job per case/version; queue retries reuse this coordinate. */
export function createOnboardingReconcileScheduler(publisher: JobPublisher) {
  return {
    schedule(payload: OnboardingReconcilePayload): Promise<string> {
      if (!payload.caseId.trim() || !Number.isSafeInteger(payload.desiredVersion) || payload.desiredVersion < 1) {
        throw new TypeError("Invalid onboarding reconciliation coordinate");
      }
      const digest = createHash("sha256")
        .update(`${payload.caseId}\n${payload.desiredVersion}`)
        .digest("hex");
      return publisher.enqueue(ONBOARDING_QUEUE, ONBOARDING_RECONCILE_JOB, payload, {
        jobId: `onboarding-reconcile-${digest}`,
        maxAttempts: 8,
        backoff: { kind: "exponential", delayMs: 1_000, jitter: 0.2 },
        timeoutMs: 60_000,
        payloadSchema: { name: "onboarding.provisioning.reconcile", version: 1 },
        removeOnComplete: 5_000,
        removeOnFail: 10_000,
      });
    },
  };
}
