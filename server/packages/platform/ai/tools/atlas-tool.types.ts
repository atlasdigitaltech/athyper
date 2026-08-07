import type { PlaneKey, VerifiedRequestContext } from "@athyper/svc-iam";
import type {
  AtlasDataReadRequest,
  AtlasDataReadResult,
} from "../atlas-data-gateway.js";
import type { AutonomyLevel } from "../ai-runtime.types.js";

export const ATLAS_TOOL_MANIFEST_SCHEMA_VERSION =
  "atlas.tool.manifest/v1" as const;
export const ATLAS_TOOL_EVIDENCE_SCHEMA_VERSION =
  "atlas.tool.evidence/v1" as const;
export const ATLAS_TOOL_EXECUTION_RECORD_SCHEMA_VERSION =
  "atlas.tool.execution-record/v1" as const;

export type AtlasJsonPrimitive = string | number | boolean | null;
export type AtlasJsonValue =
  | AtlasJsonPrimitive
  | readonly AtlasJsonValue[]
  | { readonly [key: string]: AtlasJsonValue };
/** Lowercase, 64-character SHA-256 hex digest. */
export type AtlasSha256Hex = string;

export type AtlasToolRiskLevel = "low" | "medium" | "high";
export type AtlasToolAccessClassification = "read_only";

interface AtlasJsonSchemaCommonV1 {
  readonly description?: string;
}

export interface AtlasJsonStringSchemaV1 extends AtlasJsonSchemaCommonV1 {
  readonly type: "string";
  readonly minLength?: number;
  readonly maxLength: number;
  readonly enum?: readonly string[];
}

export interface AtlasJsonNumberSchemaV1 extends AtlasJsonSchemaCommonV1 {
  readonly type: "number" | "integer";
  readonly minimum?: number;
  readonly maximum?: number;
  readonly enum?: readonly number[];
}

export interface AtlasJsonBooleanSchemaV1 extends AtlasJsonSchemaCommonV1 {
  readonly type: "boolean";
}

export interface AtlasJsonNullSchemaV1 extends AtlasJsonSchemaCommonV1 {
  readonly type: "null";
}

export interface AtlasJsonArraySchemaV1 extends AtlasJsonSchemaCommonV1 {
  readonly type: "array";
  readonly items: AtlasJsonSchemaV1;
  readonly minItems?: number;
  readonly maxItems: number;
}

export interface AtlasJsonObjectSchemaV1 extends AtlasJsonSchemaCommonV1 {
  readonly type: "object";
  readonly properties: Readonly<Record<string, AtlasJsonSchemaV1>>;
  readonly required: readonly string[];
  /**
   * The governed subset deliberately requires this literal. Open object
   * schemas make accidental capability expansion too easy.
   */
  readonly additionalProperties: false;
  readonly maxProperties: number;
}

/**
 * Deliberately small JSON Schema 2020-12-compatible subset. It excludes refs,
 * composition, regex patterns, remote schemas, unevaluated properties, and
 * executable/custom keywords.
 */
export type AtlasJsonSchemaV1 =
  | AtlasJsonStringSchemaV1
  | AtlasJsonNumberSchemaV1
  | AtlasJsonBooleanSchemaV1
  | AtlasJsonNullSchemaV1
  | AtlasJsonArraySchemaV1
  | AtlasJsonObjectSchemaV1;

export type AtlasToolDataAccessV1 =
  | {
      readonly mode: "none";
    }
  | {
      readonly mode: "atlas_gateway";
      readonly permissionCodes: readonly string[];
      readonly sourceKinds: readonly AtlasDataReadRequest["sourceKind"][];
      readonly maxReads: number;
    };

export interface AtlasToolCodeSourceV1 {
  readonly kind: "code";
  readonly sourceId: string;
  readonly sourceVersionId: string;
  readonly sourceChecksum: `sha256:${string}`;
}

export type AtlasToolIdempotencyPolicyV1 =
  | {
      readonly mode: "required";
      readonly key: "run_id+tool_call_id";
      readonly conflict: "same_input_hash_only";
    }
  | {
      readonly mode: "none";
    };

export type AtlasToolConfirmationPolicyV1 =
  | { readonly mode: "none" }
  | {
      readonly mode: "human";
      readonly timing: "before_execution";
    };

export type AtlasToolStepUpPolicyV1 =
  | { readonly mode: "none" }
  | {
      readonly mode: "required";
      readonly assuranceLevel: string;
    };

export type AtlasToolDualControlPolicyV1 =
  | { readonly mode: "none" }
  | {
      readonly mode: "required";
      readonly approvals: 2;
    };

export interface AtlasToolImplementationV1 {
  readonly kind: "code";
  /** Exact handler identity checked by the implementation binding adapter. */
  readonly binding: string;
}

export interface AtlasToolAuditPolicyV1 {
  readonly lifecycle: "proposed_executing_terminal";
  readonly arguments: "sha256";
  readonly results: "sha256";
  readonly contentStorage: "forbidden";
}

export interface AtlasToolEvidencePolicyV1 {
  readonly mode: "code_source" | "code_and_atlas_gateway";
  readonly requireVersion: true;
  readonly requireChecksumForCode: true;
}

export interface AtlasToolManifestV1 {
  readonly schemaVersion: typeof ATLAS_TOOL_MANIFEST_SCHEMA_VERSION;
  /** Provider-safe, stable public tool name. */
  readonly name: string;
  /** Exact code-owned contract version. */
  readonly version: string;
  readonly displayName: string;
  readonly description: string;
  readonly access: AtlasToolAccessClassification;
  readonly risk: AtlasToolRiskLevel;
  readonly actionCode: string;
  readonly featureKey: string;
  readonly allowedPlanes: readonly PlaneKey[];
  readonly requiredPermissions: readonly string[];
  readonly timeoutMs: number;
  readonly maxResultBytes: number;
  readonly idempotency: AtlasToolIdempotencyPolicyV1;
  readonly confirmation: AtlasToolConfirmationPolicyV1;
  readonly stepUp: AtlasToolStepUpPolicyV1;
  readonly dualControl: AtlasToolDualControlPolicyV1;
  readonly implementation: AtlasToolImplementationV1;
  readonly audit: AtlasToolAuditPolicyV1;
  readonly evidence: AtlasToolEvidencePolicyV1;
  readonly dataAccess: AtlasToolDataAccessV1;
  readonly inputSchema: AtlasJsonObjectSchemaV1;
  readonly resultSchema: AtlasJsonSchemaV1;
  readonly source: AtlasToolCodeSourceV1;
}

export interface AtlasToolValidationIssue {
  readonly path: string;
  readonly keyword:
    | "json_type"
    | "type"
    | "required"
    | "additionalProperties"
    | "minLength"
    | "maxLength"
    | "enum"
    | "minimum"
    | "maximum"
    | "integer"
    | "minItems"
    | "maxItems"
    | "maxProperties";
}

export type AtlasToolValidationResult =
  | {
      readonly ok: true;
      readonly value: AtlasJsonValue;
    }
  | {
      readonly ok: false;
      readonly issues: readonly AtlasToolValidationIssue[];
    };

export interface AtlasToolEvidenceMetadata {
  readonly schemaVersion: typeof ATLAS_TOOL_EVIDENCE_SCHEMA_VERSION;
  readonly kind: "code" | "record" | "attachment" | "content";
  readonly sourceId: string;
  readonly sourceVersionId: string;
  readonly sourceChecksum?: string;
  /**
   * Present only for data returned by AtlasDataGateway after scope and masking
   * checks. No tenant, principal, prompt, argument, or result content belongs
   * in evidence metadata.
   */
  readonly authorizationProfileHash?: string;
}

export interface AtlasToolDataRead {
  readonly data: AtlasJsonValue;
  readonly evidence: AtlasToolEvidenceMetadata;
}

/**
 * This is the entire capability available to a tool handler. It exposes no DB,
 * HTTP, filesystem, process, shell, provider, secret, or logger object.
 */
export interface AtlasReadOnlyToolHandlerContext {
  readonly plane: PlaneKey;
  readonly signal: AbortSignal;
  readData(request: AtlasDataReadRequest): Promise<AtlasToolDataRead>;
}

export interface AtlasReadOnlyToolHandlerResult {
  /**
   * Untrusted JSON data. It is cloned, schema-validated, size-limited and
   * tagged as tool_data before it can return to an agent loop.
   */
  readonly data: unknown;
}

export type AtlasReadOnlyToolHandler = (
  context: AtlasReadOnlyToolHandlerContext,
  input: AtlasJsonValue,
) => Promise<AtlasReadOnlyToolHandlerResult>;

export interface AtlasToolRegistration {
  readonly manifest: AtlasToolManifestV1;
  readonly status: "enabled" | "disabled";
  /** Must exactly equal manifest.implementation.binding. */
  readonly implementationBinding: string;
  readonly handler: AtlasReadOnlyToolHandler;
}

/**
 * Production implementations bridge reviewed manifest action/binding pairs to
 * the canonical CapabilityRegistry and its code-owned handler wiring. The tool
 * registry never accepts a handler solely because it has the same name.
 */
export interface AtlasToolImplementationBindingAdapter {
  verify(input: {
    readonly manifest: AtlasToolManifestV1;
    readonly implementationBinding: string;
    readonly handler: AtlasReadOnlyToolHandler;
  }): boolean;
}

export interface AtlasToolFeatureAdapter {
  isEnabled(
    context: VerifiedRequestContext,
    featureKey: string,
  ): Promise<boolean>;
  /**
   * Fresh execution-time lookup. Implementations must bypass request-local
   * caches so a revocation between discovery and execution fails closed.
   */
  isEnabledStrict(
    context: VerifiedRequestContext,
    featureKey: string,
  ): Promise<boolean>;
}

/**
 * Execution-time revocation check. Production adapters compare the current
 * principal security epoch and a freshly rebuilt plane permission context to
 * the immutable request snapshot. Every tool recheck includes its exact
 * manifest permissions and fails closed on lookup or resolver errors.
 */
export interface AtlasToolAuthorizationRevalidationRequest {
  readonly requiredPermissions: readonly string[];
}

export interface AtlasToolAuthorizationRevalidator {
  isCurrent(
    context: VerifiedRequestContext,
    request: AtlasToolAuthorizationRevalidationRequest,
  ): Promise<boolean>;
}

export interface AtlasToolPolicyDecision {
  readonly allowed: boolean;
  readonly riskCeiling: AtlasToolRiskLevel;
  readonly policyRevision: string;
  readonly policySnapshot: {
    readonly autonomyLevel: AutonomyLevel;
    readonly requiresHumanConfirmation: boolean;
    readonly confidenceThreshold: number | null;
  };
  /** Stable internal reason code; never forwarded as tool data. */
  readonly reasonCode?: string;
}

export interface AtlasToolPolicyAdapter {
  evaluate(
    context: VerifiedRequestContext,
    input: {
      readonly toolName: string;
      readonly toolVersion: string;
      readonly actionCode: string;
      readonly access: AtlasToolAccessClassification;
      readonly risk: AtlasToolRiskLevel;
    },
  ): Promise<AtlasToolPolicyDecision>;
  /**
   * Fresh execution-time policy resolution. The returned revision and
   * decision become authoritative for the execution transition.
   */
  evaluateStrict(
    context: VerifiedRequestContext,
    input: {
      readonly toolName: string;
      readonly toolVersion: string;
      readonly actionCode: string;
      readonly access: AtlasToolAccessClassification;
      readonly risk: AtlasToolRiskLevel;
    },
  ): Promise<AtlasToolPolicyDecision>;
}

export interface AtlasEffectiveToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: AtlasJsonObjectSchemaV1;
  readonly manifestSchemaVersion: typeof ATLAS_TOOL_MANIFEST_SCHEMA_VERSION;
  readonly toolVersion: string;
  readonly access: "read_only";
  readonly risk: AtlasToolRiskLevel;
  validateInput(input: unknown): AtlasToolValidationResult;
}

export interface AtlasToolExecutionInput {
  readonly runId: string;
  readonly threadId: string;
  readonly callId: string;
  readonly toolName: string;
  readonly input: unknown;
  readonly runtimeDisposition:
    | "described"
    | "not_described"
    | "schema_invalid";
  readonly signal?: AbortSignal;
  /** Optional tighter loop-level ceiling; it can never increase the manifest. */
  readonly maxResultBytes?: number;
}

export interface AtlasToolExecutionResult {
  readonly kind: "tool_data";
  readonly toolName: string;
  readonly toolVersion: string;
  readonly data: AtlasJsonValue;
  readonly evidence: readonly AtlasToolEvidenceMetadata[];
  readonly argumentHash: AtlasSha256Hex;
  readonly resultHash: AtlasSha256Hex;
  readonly durationMs: number;
}

export type AtlasToolExecutionErrorCode =
  | "INVALID_VERIFIED_CONTEXT"
  | "INVALID_INVOCATION"
  | "UNKNOWN_TOOL"
  | "TOOL_DISABLED"
  | "TOOL_NOT_DESCRIBED"
  | "WRONG_PLANE"
  | "PERMISSION_DENIED"
  | "AUTHORIZATION_STALE"
  | "FEATURE_DISABLED"
  | "POLICY_DENIED"
  | "RISK_CEILING_EXCEEDED"
  | "MALFORMED_ARGUMENTS"
  | "CANCELLED"
  | "TIMEOUT"
  | "DATA_ACCESS_DENIED"
  | "HANDLER_FAILED"
  | "MALFORMED_RESULT"
  | "RESULT_TOO_LARGE"
  | "PROVIDER_TERMINATED"
  | "RECORDING_FAILED";

export class AtlasToolExecutionError extends Error {
  override readonly name = "AtlasToolExecutionError";

  constructor(
    readonly code: AtlasToolExecutionErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type AtlasToolExecutionOutcome =
  | "completed"
  | "denied"
  | "failed"
  | "cancelled";

/**
 * Opaque, process-local capability proposal handle. Raw arguments and policy
 * objects remain private to the executor and cannot be serialized through
 * this contract.
 */
export interface AtlasObservedToolInvocation {
  readonly executionId: string;
}

export interface AtlasObservedToolExecutionOptions {
  readonly signal?: AbortSignal;
  readonly maxResultBytes?: number;
}

export interface AtlasObservedToolTerminalInput {
  readonly outcome: "failed" | "cancelled";
  readonly reason:
    | "provider_failed"
    | "provider_incomplete"
    | "protocol_aborted"
    | "cancelled";
}

/**
 * Content-free durable proposal. The executor persists this before a handler
 * can be marked executing, including for safely identifiable rejected calls.
 */
export interface AtlasToolExecutionProposal {
  readonly schemaVersion:
    typeof ATLAS_TOOL_EXECUTION_RECORD_SCHEMA_VERSION;
  readonly executionId: string;
  readonly runId: string;
  readonly threadId: string;
  readonly callId: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly plane: PlaneKey;
  readonly authorizationProfileHash: string;
  readonly authorizationEpoch: number;
  readonly toolName: string;
  readonly toolVersion: string | null;
  readonly actionCode: string | null;
  readonly operationClass: "read" | "unresolved";
  readonly riskClass: AtlasToolRiskLevel | "unknown";
  readonly autonomyDecision:
    | "not_evaluated"
    | "denied"
    | "suggest"
    | "assist"
    | "auto";
  readonly permissionSnapshot: {
    readonly resolution: "resolved" | "not_evaluated";
    readonly requiredPermissions: readonly string[];
    readonly granted: boolean | null;
    readonly profileHash: string;
  };
  readonly policySnapshot: {
    readonly resolution: "resolved" | "not_evaluated";
    readonly autonomyLevel: AutonomyLevel;
    readonly requiresHumanConfirmation: boolean;
    readonly confidenceThreshold: number | null;
    readonly riskCeiling: AtlasToolRiskLevel | null;
  };
  readonly profileSnapshot: {
    readonly profileHash: string;
    readonly schemaHash: string;
    readonly plane: PlaneKey;
  };
  readonly policyRevision: string;
  readonly profileRevision: string;
  readonly proposalSummary: {
    readonly runtimeDisposition:
      AtlasToolExecutionInput["runtimeDisposition"];
    readonly gate:
      | "not_evaluated"
      | "eligible"
      | "unknown_tool"
      | "tool_disabled"
      | "not_described"
      | "wrong_plane"
      | "permission_denied"
      | "feature_disabled"
      | "policy_denied"
      | "risk_denied"
      | "malformed_arguments"
      | "cancelled"
      | "timeout"
      | "control_error";
    readonly handlerEligible: boolean;
  };
  readonly argumentHash: AtlasSha256Hex | null;
  readonly proposedAt: Date;
}

export interface AtlasToolAuthorizationResolution {
  readonly toolVersion: string | null;
  readonly actionCode: string | null;
  readonly operationClass: "read" | "unresolved";
  readonly riskClass: AtlasToolRiskLevel | "unknown";
  readonly autonomyDecision:
    | "not_evaluated"
    | "denied"
    | "suggest"
    | "assist"
    | "auto";
  readonly permissionSnapshot: AtlasToolExecutionProposal["permissionSnapshot"];
  readonly policySnapshot: AtlasToolExecutionProposal["policySnapshot"];
  readonly profileSnapshot: AtlasToolExecutionProposal["profileSnapshot"];
  readonly authorizationEpoch: number;
  readonly policyRevision: string;
  readonly profileRevision: string;
  readonly proposalSummary: AtlasToolExecutionProposal["proposalSummary"];
}

export interface AtlasToolExecutionScope {
  readonly executionId: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly plane: PlaneKey;
  readonly runId: string;
  readonly threadId: string;
  readonly callId: string;
}

export interface AtlasToolExecutingTransition {
  readonly scope: AtlasToolExecutionScope;
  readonly resolution: AtlasToolAuthorizationResolution;
  readonly executionGuardSnapshot: {
    readonly manifestSchemaVersion:
      typeof ATLAS_TOOL_MANIFEST_SCHEMA_VERSION;
    readonly toolVersion: string;
    readonly actionCode: string;
    readonly access: "read_only";
    readonly risk: AtlasToolRiskLevel;
    readonly featureKey: string;
    readonly requiredPermissions: readonly string[];
    readonly idempotency: AtlasToolIdempotencyPolicyV1;
    readonly confirmation: AtlasToolConfirmationPolicyV1;
    readonly stepUp: AtlasToolStepUpPolicyV1;
    readonly dualControl: AtlasToolDualControlPolicyV1;
    readonly implementation: AtlasToolImplementationV1;
    readonly audit: AtlasToolAuditPolicyV1;
    readonly evidence: AtlasToolEvidencePolicyV1;
    readonly argumentHash: AtlasSha256Hex;
  };
  readonly executingAt: Date;
}

/**
 * Content-free terminal transition. Raw arguments, results, prompts and loaded
 * data are intentionally impossible to pass through this contract.
 */
export interface AtlasToolExecutionTerminal {
  readonly scope: AtlasToolExecutionScope;
  readonly resolution: AtlasToolAuthorizationResolution;
  readonly outcome: AtlasToolExecutionOutcome;
  readonly errorCode: AtlasToolExecutionErrorCode | null;
  readonly resultHash: AtlasSha256Hex | null;
  readonly evidence: readonly AtlasToolEvidenceMetadata[];
  readonly completedAt: Date;
  readonly durationMs: number;
}

export interface AtlasToolExecutionRecorder {
  propose(proposal: AtlasToolExecutionProposal): Promise<void>;
  markExecuting(transition: AtlasToolExecutingTransition): Promise<void>;
  finalize(terminal: AtlasToolExecutionTerminal): Promise<void>;
}

export interface AtlasToolGateway {
  read(
    context: VerifiedRequestContext,
    request: AtlasDataReadRequest,
  ): Promise<AtlasDataReadResult>;
}
