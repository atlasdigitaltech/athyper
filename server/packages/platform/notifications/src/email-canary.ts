import { createHash } from "node:crypto";
import type {
  AuthenticatedEmailCanaryAuthorizer,
  AuthenticatedEmailCanaryRequest,
  EmailCanaryDispatchClient,
  EmailCanaryObservationClient,
  StagingEmailCanaryEvidence,
} from "@athyper/server-contract-notifications";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REVISION = /^[a-f0-9]{40}$/;

export interface StagingEmailCanaryDependencies {
  readonly authorizer: AuthenticatedEmailCanaryAuthorizer;
  readonly delivery: EmailCanaryDispatchClient;
  readonly observations: EmailCanaryObservationClient;
  readonly now?: () => Date;
}

/** Executes an authenticated canary and returns schema-safe, content-free evidence. */
export function createStagingEmailCanary(dependencies: StagingEmailCanaryDependencies) {
  return {
    async run(request: AuthenticatedEmailCanaryRequest): Promise<StagingEmailCanaryEvidence> {
      exactKeys(request, ["environment", "sourceRevision", "tenantId", "principalId", "planeKey", "recipientAddress"]);
      if (request.environment !== "stg") throw new TypeError("Email canary is restricted to staging");
      const sourceRevision = revision(request.sourceRevision);
      const tenantId = uuid(request.tenantId, "tenantId");
      const principalId = uuid(request.principalId, "principalId");
      if (!(["studio", "neon", "mesh"] as const).includes(request.planeKey)) throw new TypeError("Invalid canary plane");
      const recipientAddress = email(request.recipientAddress);
      const recipientRef = reference(recipientAddress);
      const authorization = await dependencies.authorizer.authorize({
        tenantId,
        principalId,
        planeKey: request.planeKey,
        action: "notifications.email_canary.execute",
      });
      if (authorization.authenticated !== true || authorization.authorized !== true) throw new Error("EMAIL_CANARY_FORBIDDEN");
      const dispatched = await dependencies.delivery.dispatch({
        tenantId,
        principalId,
        planeKey: request.planeKey,
        recipientAddress,
        idempotencyKey: `stg-email-canary-${sha256(`${sourceRevision}\u0000${tenantId}\u0000${principalId}\u0000${recipientRef}`)}`,
      });
      const deliveryId = uuid(dispatched.deliveryId, "deliveryId");
      const providerMessageId = bounded(dispatched.providerMessageId, "providerMessageId", 512);
      const observed = await dependencies.observations.observe({
        tenantId,
        principalId,
        planeKey: request.planeKey,
        deliveryId,
        providerMessageId,
      });
      if (!observed.providerAccepted || !observed.providerEventObserved || !observed.delivered || !observed.activityCenterPublished) {
        throw new Error("EMAIL_CANARY_ASSERTIONS_FAILED");
      }
      const recordedAt = (dependencies.now?.() ?? new Date()).toISOString();
      const evidence: StagingEmailCanaryEvidence = {
        apiVersion: "athyper.io/v1alpha1",
        kind: "StagingNotificationEvidence",
        metadata: { gate: "email-canary" },
        spec: {
          environment: "stg",
          status: "passed",
          sourceRevision,
          recordedAt,
          channel: "email",
          canaryIdentity: { tenantId, principalId, recipientRef },
          providerReference: reference(providerMessageId),
          assertions: {
            authenticatedDispatch: true,
            providerAccepted: true,
            providerEventObserved: true,
            delivered: true,
            activityCenterPublished: true,
          },
        },
      };
      validateStagingEmailCanaryEvidence(evidence);
      const serialized = JSON.stringify(evidence);
      if (serialized.includes(recipientAddress) || serialized.includes(providerMessageId)) throw new Error("EMAIL_CANARY_EVIDENCE_REDACTION_FAILED");
      return evidence;
    },
  };
}

/** Exact runtime validation matching the committed staging evidence schema. */
export function validateStagingEmailCanaryEvidence(value: unknown): asserts value is StagingEmailCanaryEvidence {
  const root = object(value, "evidence"); exactKeys(root, ["apiVersion", "kind", "metadata", "spec"]);
  if (root["apiVersion"] !== "athyper.io/v1alpha1" || root["kind"] !== "StagingNotificationEvidence") invalid();
  const metadata = object(root["metadata"], "metadata"); exactKeys(metadata, ["gate"]); if (metadata["gate"] !== "email-canary") invalid();
  const spec = object(root["spec"], "spec"); exactKeys(spec, ["environment", "status", "sourceRevision", "recordedAt", "channel", "canaryIdentity", "providerReference", "assertions"]);
  if (spec["environment"] !== "stg" || spec["status"] !== "passed" || spec["channel"] !== "email") invalid();
  revision(spec["sourceRevision"]); timestamp(spec["recordedAt"]); referenceValue(spec["providerReference"]);
  const identity = object(spec["canaryIdentity"], "canaryIdentity"); exactKeys(identity, ["tenantId", "principalId", "recipientRef"]);
  uuid(identity["tenantId"], "tenantId"); uuid(identity["principalId"], "principalId"); referenceValue(identity["recipientRef"]);
  const assertions = object(spec["assertions"], "assertions");
  exactKeys(assertions, ["authenticatedDispatch", "providerAccepted", "providerEventObserved", "delivered", "activityCenterPublished"]);
  if (Object.values(assertions).some((item) => item !== true)) invalid();
}

function invalid(): never { throw new TypeError("Invalid staging email canary evidence"); }
function object(value: unknown, name: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`Invalid ${name}`); return value as Record<string, unknown>; }
function exactKeys(value: object, keys: readonly string[]) { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid(); }
function uuid(value: unknown, name: string) { if (typeof value !== "string" || !UUID.test(value)) throw new TypeError(`Invalid ${name}`); return value.toLowerCase(); }
function revision(value: unknown) { if (typeof value !== "string" || !REVISION.test(value)) throw new TypeError("Invalid sourceRevision"); return value; }
function timestamp(value: unknown) { if (typeof value !== "string" || Number.isNaN(new Date(value).valueOf()) || new Date(value).toISOString() !== value) throw new TypeError("Invalid recordedAt"); return value; }
function email(value: string) { const result = value.trim().toLowerCase(); if (result.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new TypeError("Invalid canary recipient"); return result; }
function bounded(value: string, name: string, max: number) { const result = value.trim(); if (!result || Buffer.byteLength(result, "utf8") > max) throw new TypeError(`Invalid ${name}`); return result; }
function reference(value: string) { return `sha256:${sha256(value)}`; }
function referenceValue(value: unknown) { if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) invalid(); return value; }
function sha256(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }
