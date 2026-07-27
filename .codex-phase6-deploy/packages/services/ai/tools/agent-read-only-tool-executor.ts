import { randomUUID } from "node:crypto";
import type { VerifiedRequestContext } from "@athyper/svc-iam";
import { AtlasDataGatewayError } from "../atlas-data-gateway.js";
import type { AtlasToolRegistry } from "./atlas-tool-registry.js";
import {
  atlasJsonByteLength,
  hashAtlasJson,
  normalizeAtlasJson,
  validateAtlasJsonSchemaValue,
} from "./atlas-tool-schema.js";
import {
  ATLAS_TOOL_EVIDENCE_SCHEMA_VERSION,
  ATLAS_TOOL_EXECUTION_RECORD_SCHEMA_VERSION,
  AtlasToolExecutionError,
  type AtlasEffectiveToolDefinition,
  type AtlasJsonValue,
  type AtlasObservedToolExecutionOptions,
  type AtlasObservedToolInvocation,
  type AtlasObservedToolTerminalInput,
  type AtlasReadOnlyToolHandlerContext,
  type AtlasSha256Hex,
  type AtlasToolAuthorizationResolution,
  type AtlasToolAuthorizationRevalidator,
  type AtlasToolEvidenceMetadata,
  type AtlasToolExecutionErrorCode,
  type AtlasToolExecutionInput,
  type AtlasToolExecutionOutcome,
  type AtlasToolExecutionRecorder,
  type AtlasToolExecutionResult,
  type AtlasToolExecutionScope,
  type AtlasToolExecutionTerminal,
  type AtlasToolFeatureAdapter,
  type AtlasToolGateway,
  type AtlasToolManifestV1,
  type AtlasToolPolicyAdapter,
  type AtlasToolPolicyDecision,
  type AtlasToolRegistration,
} from "./atlas-tool.types.js";

const TOOL_NAME_RE = /^[a-z][a-z0-9_]{2,63}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_REVISION_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RISK_RANK = Object.freeze({ low: 0, medium: 1, high: 2 });

export interface AtlasToolExecutorClock {
  now(): Date;
}

export interface AgentReadOnlyToolExecutorOptions {
  readonly registry: AtlasToolRegistry;
  readonly features: AtlasToolFeatureAdapter;
  readonly policy: AtlasToolPolicyAdapter;
  readonly authorizationRevalidator: AtlasToolAuthorizationRevalidator;
  readonly recorder: AtlasToolExecutionRecorder;
  readonly dataGateway?: AtlasToolGateway;
  readonly clock?: AtlasToolExecutorClock;
  readonly maximumTimeoutMs?: number;
  readonly maximumResultBytes?: number;
  readonly controlTimeoutMs?: number;
  readonly auditTimeoutMs?: number;
}

interface NormalizedArgument {
  readonly value: AtlasJsonValue | null;
  readonly hash: AtlasSha256Hex | null;
}

interface ToolPreflight {
  readonly registration: AtlasToolRegistration | undefined;
  readonly input: AtlasJsonValue | null;
  readonly argumentHash: AtlasSha256Hex | null;
  readonly permission:
    | "not_evaluated"
    | "granted"
    | "denied";
  readonly policyDecision: AtlasToolPolicyDecision | null;
  readonly gate: AtlasToolAuthorizationResolution["proposalSummary"]["gate"];
  readonly error: AtlasToolExecutionError | null;
}

interface ObservedToolState {
  readonly context: {
    tenantId: string;
    principalId: string;
    plane: VerifiedRequestContext["planeKey"];
    profileHash: string;
    authEpoch: number;
  };
  readonly input: Omit<AtlasToolExecutionInput, "signal" | "maxResultBytes">;
  readonly proposedAt: Date;
  readonly startedMonotonic: number;
  readonly scope: AtlasToolExecutionScope;
  readonly registration: AtlasToolRegistration | undefined;
  readonly argument: NormalizedArgument;
  readonly initialResolution: AtlasToolAuthorizationResolution;
  executionStarted: boolean;
  executionResolution: AtlasToolAuthorizationResolution | null;
  pendingTerminal: AtlasToolExecutionTerminal | null;
}

/**
 * Governed read-only execution boundary used by the agent loop. Every
 * executable path is proposal-recorded, re-authorized against the exact
 * VerifiedRequestContext, marked executing, bounded, terminalized, and only
 * then returned as tagged untrusted JSON data.
 */
export class AgentReadOnlyToolExecutor {
  private readonly clock: AtlasToolExecutorClock;
  private readonly maximumTimeoutMs: number;
  private readonly maximumResultBytes: number;
  private readonly controlTimeoutMs: number;
  private readonly observations =
    new WeakMap<AtlasObservedToolInvocation, ObservedToolState>();
  private readonly auditTimeoutMs: number;

  constructor(private readonly options: AgentReadOnlyToolExecutorOptions) {
    this.clock = options.clock ?? { now: () => new Date() };
    this.maximumTimeoutMs = positiveInteger(
      options.maximumTimeoutMs ?? 30_000,
      "maximumTimeoutMs",
      30_000,
    );
    this.maximumResultBytes = positiveInteger(
      options.maximumResultBytes ?? 1_048_576,
      "maximumResultBytes",
      1_048_576,
    );
    this.controlTimeoutMs = positiveInteger(
      options.controlTimeoutMs ?? 2_000,
      "controlTimeoutMs",
      30_000,
    );
    this.auditTimeoutMs = positiveInteger(
      options.auditTimeoutMs ?? 2_000,
      "auditTimeoutMs",
      30_000,
    );
  }

  async resolveEffective(
    context: VerifiedRequestContext,
  ): Promise<readonly AtlasEffectiveToolDefinition[]> {
    assertVerifiedContext(context);
    const authorizationCurrent = await safeControl(
      () => this.options.authorizationRevalidator.isCurrent(
        context,
        Object.freeze({ requiredPermissions: Object.freeze([]) }),
      ),
      this.controlTimeoutMs,
    );
    if (authorizationCurrent !== true) return Object.freeze([]);
    const effective: AtlasEffectiveToolDefinition[] = [];
    for (const registration of this.options.registry.list()) {
      const manifest = registration.manifest;
      if (
        registration.status !== "enabled"
        || !manifest.allowedPlanes.includes(context.planeKey)
        || !hasPermissions(context, manifest.requiredPermissions)
      ) {
        continue;
      }
      const featureEnabled = await safeControl(
        () => this.options.features.isEnabled(context, manifest.featureKey),
        this.controlTimeoutMs,
      );
      if (featureEnabled !== true) continue;
      const rawDecision = await safeControl(
        () => this.options.policy.evaluate(context, policyInput(manifest)),
        this.controlTimeoutMs,
      );
      const decision = validPolicyDecision(rawDecision)
        ? rawDecision
        : null;
      if (
        !decision?.allowed
        || exceedsRisk(manifest.risk, decision.riskCeiling)
      ) {
        continue;
      }
      effective.push(Object.freeze({
        name: manifest.name,
        description: manifest.description,
        inputSchema: manifest.inputSchema,
        manifestSchemaVersion: manifest.schemaVersion,
        toolVersion: manifest.version,
        access: manifest.access,
        risk: manifest.risk,
        validateInput: (input: unknown) =>
          validateAtlasJsonSchemaValue(manifest.inputSchema, input),
      }));
    }
    return Object.freeze(effective);
  }

  async execute(
    context: VerifiedRequestContext,
    input: AtlasToolExecutionInput,
  ): Promise<AtlasToolExecutionResult> {
    const observed = await this.observeProposal(context, input);
    return this.executeObserved(context, observed, {
      signal: input.signal,
      maxResultBytes: input.maxResultBytes,
    });
  }

  async observeProposal(
    context: VerifiedRequestContext,
    input: AtlasToolExecutionInput,
  ): Promise<AtlasObservedToolInvocation> {
    assertVerifiedContext(context);
    assertInvocation(input);
    const proposedAt = validDate(this.clock.now());
    const startedMonotonic = Date.now();
    const executionId = randomUUID();
    const scope: AtlasToolExecutionScope = Object.freeze({
      executionId,
      tenantId: context.tenantId,
      principalId: context.principalId,
      plane: context.planeKey,
      runId: input.runId,
      threadId: input.threadId,
      callId: input.callId,
    });
    const registration = this.options.registry.get(input.toolName);
    const argument = normalizeArgument(input.input);
    const initialResolution = unresolvedResolution(
      context,
      registration,
      input.runtimeDisposition,
    );

    await this.propose({
      schemaVersion: ATLAS_TOOL_EXECUTION_RECORD_SCHEMA_VERSION,
      executionId,
      runId: input.runId,
      threadId: input.threadId,
      callId: input.callId,
      tenantId: context.tenantId,
      principalId: context.principalId,
      plane: context.planeKey,
      authorizationProfileHash: context.profileHash,
      authorizationEpoch: context.authEpoch,
      toolName: input.toolName,
      toolVersion: registration?.manifest.version ?? null,
      actionCode: registration?.manifest.actionCode ?? null,
      operationClass: "unresolved",
      riskClass: "unknown",
      autonomyDecision: "not_evaluated",
      permissionSnapshot: initialResolution.permissionSnapshot,
      policySnapshot: initialResolution.policySnapshot,
      profileSnapshot: initialResolution.profileSnapshot,
      policyRevision: "unresolved",
      profileRevision: context.profileHash,
      proposalSummary: initialResolution.proposalSummary,
      argumentHash: argument.hash,
      proposedAt,
    });

    const observed = Object.freeze({ executionId });
    this.observations.set(observed, {
      context: {
        tenantId: context.tenantId,
        principalId: context.principalId,
        plane: context.planeKey,
        profileHash: context.profileHash,
        authEpoch: context.authEpoch,
      },
      input: {
        runId: input.runId,
        threadId: input.threadId,
        callId: input.callId,
        toolName: input.toolName,
        input: argument.value,
        runtimeDisposition: input.runtimeDisposition,
      },
      proposedAt,
      startedMonotonic,
      scope,
      registration,
      argument,
      initialResolution,
      executionStarted: false,
      executionResolution: null,
      pendingTerminal: null,
    });
    return observed;
  }

  async executeObserved(
    context: VerifiedRequestContext,
    observed: AtlasObservedToolInvocation,
    options: AtlasObservedToolExecutionOptions = {},
  ): Promise<AtlasToolExecutionResult> {
    assertVerifiedContext(context);
    const state = this.observations.get(observed);
    if (!state) throw toolError("INVALID_INVOCATION");
    assertObservedContext(context, state);
    if (state.executionStarted) throw toolError("INVALID_INVOCATION");
    state.executionStarted = true;
    const input: AtlasToolExecutionInput = {
      ...state.input,
      ...options,
    };
    const {
      proposedAt,
      startedMonotonic,
      scope,
      argument,
      initialResolution,
    } = state;
    const registration = this.options.registry.get(input.toolName);
    if (!sameRegistration(state.registration, registration)) {
      const stale = toolError("AUTHORIZATION_STALE");
      const completedAt = validDate(this.clock.now());
      await this.finalizeState(observed, state, {
        scope,
        resolution: initialResolution,
        outcome: "denied",
        errorCode: stale.code,
        resultHash: null,
        evidence: Object.freeze([]),
        completedAt,
        durationMs: duration(proposedAt, completedAt),
      });
      throw stale;
    }
    const timeoutMs = Math.min(
      registration?.manifest.timeoutMs ?? this.maximumTimeoutMs,
      this.maximumTimeoutMs,
    );
    const deadline = Date.now() + timeoutMs;
    const preflight = await this.preflight(
      context,
      input,
      registration,
      argument,
      deadline,
    );
    const resolution = resolvedAuthorization(
      context,
      preflight,
      input.runtimeDisposition,
    );

    if (preflight.error) {
      const completedAt = validDate(this.clock.now());
      const terminalResolution =
        shouldPreserveInitialResolution(preflight)
          ? initialResolution
          : resolution;
      await this.finalizeState(observed, state, {
        scope,
        resolution: terminalResolution,
        outcome: preflightOutcome(preflight.error.code),
        errorCode: preflight.error.code,
        resultHash: null,
        evidence: Object.freeze([]),
        completedAt,
        durationMs: duration(proposedAt, completedAt),
      });
      throw preflight.error;
    }

    const manifest = preflight.registration!.manifest;
    const argumentHash = preflight.argumentHash!;
    const normalizedInput = preflight.input!;
    if (input.signal?.aborted) {
      const cancelled = toolError("CANCELLED");
      const completedAt = validDate(this.clock.now());
      const cancelledResolution = Object.freeze({
        ...resolution,
        proposalSummary: Object.freeze({
          ...resolution.proposalSummary,
          gate: "cancelled" as const,
          handlerEligible: false,
        }),
      });
      await this.finalizeState(observed, state, {
        scope,
        resolution: cancelledResolution,
        outcome: "cancelled",
        errorCode: cancelled.code,
        resultHash: null,
        evidence: Object.freeze([]),
        completedAt,
        durationMs: duration(proposedAt, completedAt),
      });
      throw cancelled;
    }

    const executingAt = validDate(this.clock.now());
    // Set the resolved recovery snapshot before the audit transition begins.
    // If the recorder outcome is ambiguous (for example a transport timeout
    // after commit), finalizeObserved can safely close either a proposed or an
    // executing row with the exact execution-time authorization decision.
    state.executionResolution = resolution;
    await this.markExecuting({
      scope,
      resolution,
      executionGuardSnapshot: Object.freeze({
        manifestSchemaVersion: manifest.schemaVersion,
        toolVersion: manifest.version,
        actionCode: manifest.actionCode,
        access: manifest.access,
        risk: manifest.risk,
        featureKey: manifest.featureKey,
        requiredPermissions: manifest.requiredPermissions,
        idempotency: manifest.idempotency,
        confirmation: manifest.confirmation,
        stepUp: manifest.stepUp,
        dualControl: manifest.dualControl,
        implementation: manifest.implementation,
        audit: manifest.audit,
        evidence: manifest.evidence,
        argumentHash,
      }),
      executingAt,
    });

    const evidence: AtlasToolEvidenceMetadata[] = [
      codeEvidence(manifest),
    ];
    const handlerContext = this.handlerContext(
      context,
      manifest,
      input.signal,
      evidence,
    );

    let rawResult: unknown;
    try {
      rawResult = await runBounded(
        (signal) => preflight.registration!.handler(
          Object.freeze({ ...handlerContext, signal }),
          normalizedInput,
        ),
        remaining(deadline),
        input.signal,
      );
    } catch (error) {
      const mapped = mapHandlerError(error);
      await this.finalizeFailure(
        observed,
        state,
        scope,
        resolution,
        mapped,
        proposedAt,
        evidence,
      );
      throw mapped;
    }

    let data: AtlasJsonValue;
    try {
      const resultObject = plainResult(rawResult);
      const validated = validateAtlasJsonSchemaValue(
        manifest.resultSchema,
        resultObject.data,
      );
      if (!validated.ok) throw toolError("MALFORMED_RESULT");
      data = validated.value;
    } catch (error) {
      const mapped = error instanceof AtlasToolExecutionError
        ? error
        : toolError("MALFORMED_RESULT");
      await this.finalizeFailure(
        observed,
        state,
        scope,
        resolution,
        mapped,
        proposedAt,
        evidence,
      );
      throw mapped;
    }

    const safeEvidence = freezeEvidence(evidence);
    const boundedEnvelope = normalizeAtlasJson({
      kind: "tool_data",
      data,
      evidence: safeEvidence,
    });
    const requestedLimit = input.maxResultBytes ?? this.maximumResultBytes;
    const resultLimit = Math.min(
      manifest.maxResultBytes,
      this.maximumResultBytes,
      requestedLimit,
    );
    if (atlasJsonByteLength(boundedEnvelope) > resultLimit) {
      const tooLarge = toolError("RESULT_TOO_LARGE");
      await this.finalizeFailure(
        observed,
        state,
        scope,
        resolution,
        tooLarge,
        proposedAt,
        safeEvidence,
      );
      throw tooLarge;
    }

    const resultHash = hashAtlasJson(data);
    const completedAt = validDate(this.clock.now());
    await this.finalizeState(observed, state, {
      scope,
      resolution,
      outcome: "completed",
      errorCode: null,
      resultHash,
      evidence: safeEvidence,
      completedAt,
      durationMs: duration(proposedAt, completedAt),
    });

    return Object.freeze({
      kind: "tool_data",
      toolName: manifest.name,
      toolVersion: manifest.version,
      data,
      evidence: safeEvidence,
      argumentHash,
      resultHash,
      durationMs: Math.max(0, Date.now() - startedMonotonic),
    });
  }

  async finalizeObserved(
    context: VerifiedRequestContext,
    observed: AtlasObservedToolInvocation,
    terminal: AtlasObservedToolTerminalInput,
  ): Promise<void> {
    assertVerifiedContext(context);
    const state = this.observations.get(observed);
    if (!state) throw toolError("INVALID_INVOCATION");
    assertObservedContext(context, state);
    if (state.pendingTerminal) {
      await this.finalizeState(observed, state, state.pendingTerminal);
      return;
    }
    const completedAt = validDate(this.clock.now());
    await this.finalizeState(observed, state, {
      scope: state.scope,
      resolution:
        state.executionResolution ?? state.initialResolution,
      outcome: terminal.outcome,
      errorCode:
        terminal.outcome === "cancelled"
          ? "CANCELLED"
          : "PROVIDER_TERMINATED",
      resultHash: null,
      evidence: Object.freeze([]),
      completedAt,
      durationMs: duration(state.proposedAt, completedAt),
    });
  }

  private async preflight(
    context: VerifiedRequestContext,
    input: AtlasToolExecutionInput,
    registration: AtlasToolRegistration | undefined,
    argument: NormalizedArgument,
    deadline: number,
  ): Promise<ToolPreflight> {
    if (input.runtimeDisposition === "not_described") {
      if (registration && argument.value !== null) {
        validateAtlasJsonSchemaValue(
          registration.manifest.inputSchema,
          argument.value,
        );
      }
      return rejected(
        registration,
        argument,
        "not_evaluated",
        null,
        "not_described",
        "TOOL_NOT_DESCRIBED",
      );
    }
    if (input.runtimeDisposition === "schema_invalid") {
      if (registration && argument.value !== null) {
        // Re-run the canonical validator even though the runtime already
        // classified this input. The disposition is an audit signal, not a
        // substitute for executor-side validation.
        validateAtlasJsonSchemaValue(
          registration.manifest.inputSchema,
          argument.value,
        );
      }
      return rejected(
        registration,
        argument,
        "not_evaluated",
        null,
        "malformed_arguments",
        "MALFORMED_ARGUMENTS",
      );
    }
    if (!registration) {
      return rejected(
        registration,
        argument,
        "not_evaluated",
        null,
        "unknown_tool",
        "UNKNOWN_TOOL",
      );
    }
    const manifest = registration.manifest;
    if (registration.status !== "enabled") {
      return rejected(
        registration,
        argument,
        "not_evaluated",
        null,
        "tool_disabled",
        "TOOL_DISABLED",
      );
    }
    if (!manifest.allowedPlanes.includes(context.planeKey)) {
      return rejected(
        registration,
        argument,
        "not_evaluated",
        null,
        "wrong_plane",
        "WRONG_PLANE",
      );
    }
    const firstEpochCheck = await this.revalidateAuthorization(
      context,
      registration,
      argument,
      deadline,
      input.signal,
    );
    if (firstEpochCheck) return firstEpochCheck;
    if (!hasPermissions(context, manifest.requiredPermissions)) {
      return rejected(
        registration,
        argument,
        "denied",
        null,
        "permission_denied",
        "PERMISSION_DENIED",
      );
    }

    let featureEnabled: boolean;
    try {
      featureEnabled = await runBounded(
        () => this.options.features.isEnabled(context, manifest.featureKey),
        remaining(deadline),
        input.signal,
      );
    } catch (error) {
      return controlRejection(registration, argument, error, "granted");
    }
    if (featureEnabled !== true) {
      return rejected(
        registration,
        argument,
        "granted",
        null,
        "feature_disabled",
        "FEATURE_DISABLED",
      );
    }

    let rawDecision: unknown;
    try {
      rawDecision = await runBounded(
        () => this.options.policy.evaluate(context, policyInput(manifest)),
        remaining(deadline),
        input.signal,
      );
    } catch (error) {
      return controlRejection(registration, argument, error, "granted");
    }
    if (!validPolicyDecision(rawDecision)) {
      return rejected(
        registration,
        argument,
        "granted",
        null,
        "control_error",
        "POLICY_DENIED",
      );
    }
    if (!rawDecision.allowed) {
      return rejected(
        registration,
        argument,
        "granted",
        rawDecision,
        "policy_denied",
        "POLICY_DENIED",
      );
    }
    if (exceedsRisk(manifest.risk, rawDecision.riskCeiling)) {
      return rejected(
        registration,
        argument,
        "granted",
        rawDecision,
        "risk_denied",
        "RISK_CEILING_EXCEEDED",
      );
    }
    if (!argument.value || !argument.hash) {
      return rejected(
        registration,
        argument,
        "granted",
        rawDecision,
        "malformed_arguments",
        "MALFORMED_ARGUMENTS",
      );
    }
    const validated = validateAtlasJsonSchemaValue(
      manifest.inputSchema,
      argument.value,
    );
    if (!validated.ok) {
      return rejected(
        registration,
        argument,
        "granted",
        rawDecision,
        "malformed_arguments",
        "MALFORMED_ARGUMENTS",
      );
    }

    // Discovery and the first preflight checks are advisory snapshots. Re-read
    // both revocable controls after canonical schema validation and directly
    // before the final IAM/epoch check. Only this fresh policy revision can be
    // written into the executing transition.
    let executionFeatureEnabled: boolean;
    try {
      executionFeatureEnabled = await runBounded(
        () => this.options.features.isEnabledStrict(
          context,
          manifest.featureKey,
        ),
        remaining(deadline),
        input.signal,
      );
    } catch (error) {
      return controlRejection(
        registration,
        argument,
        error,
        "granted",
        rawDecision,
      );
    }
    if (executionFeatureEnabled !== true) {
      return rejected(
        registration,
        argument,
        "granted",
        rawDecision,
        "feature_disabled",
        "FEATURE_DISABLED",
      );
    }

    let executionPolicy: unknown;
    try {
      executionPolicy = await runBounded(
        () => this.options.policy.evaluateStrict(
          context,
          policyInput(manifest),
        ),
        remaining(deadline),
        input.signal,
      );
    } catch (error) {
      return controlRejection(
        registration,
        argument,
        error,
        "granted",
        rawDecision,
      );
    }
    if (!validPolicyDecision(executionPolicy)) {
      return rejected(
        registration,
        argument,
        "granted",
        null,
        "control_error",
        "POLICY_DENIED",
      );
    }
    if (!executionPolicy.allowed) {
      return rejected(
        registration,
        argument,
        "granted",
        executionPolicy,
        "policy_denied",
        "POLICY_DENIED",
      );
    }
    if (exceedsRisk(manifest.risk, executionPolicy.riskCeiling)) {
      return rejected(
        registration,
        argument,
        "granted",
        executionPolicy,
        "risk_denied",
        "RISK_CEILING_EXCEEDED",
      );
    }

    const finalEpochCheck = await this.revalidateAuthorization(
      context,
      registration,
      argument,
      deadline,
      input.signal,
      executionPolicy,
    );
    if (finalEpochCheck) return finalEpochCheck;
    if (!hasPermissions(context, manifest.requiredPermissions)) {
      return rejected(
        registration,
        argument,
        "denied",
        executionPolicy,
        "permission_denied",
        "PERMISSION_DENIED",
      );
    }
    return Object.freeze({
      registration,
      input: validated.value,
      argumentHash: argument.hash,
      permission: "granted",
      policyDecision: executionPolicy,
      gate: "eligible",
      error: null,
    });
  }

  private async revalidateAuthorization(
    context: VerifiedRequestContext,
    registration: AtlasToolRegistration,
    argument: NormalizedArgument,
    deadline: number,
    signal: AbortSignal | undefined,
    policyDecision: AtlasToolPolicyDecision | null = null,
  ): Promise<ToolPreflight | null> {
    let current: boolean;
    try {
      current = await runBounded(
        () => this.options.authorizationRevalidator.isCurrent(
          context,
          Object.freeze({
            requiredPermissions:
              registration.manifest.requiredPermissions,
          }),
        ),
        remaining(deadline),
        signal,
      );
    } catch (error) {
      if (
        error instanceof AtlasToolExecutionError
        && (error.code === "CANCELLED" || error.code === "TIMEOUT")
      ) {
        return rejected(
          registration,
          argument,
          "not_evaluated",
          policyDecision,
          error.code === "CANCELLED" ? "cancelled" : "timeout",
          error.code,
        );
      }
      return rejected(
        registration,
        argument,
        "denied",
        policyDecision,
        "permission_denied",
        "AUTHORIZATION_STALE",
      );
    }
    if (current !== true) {
      return rejected(
        registration,
        argument,
        "denied",
        policyDecision,
        "permission_denied",
        "AUTHORIZATION_STALE",
      );
    }
    return null;
  }

  private handlerContext(
    context: VerifiedRequestContext,
    manifest: AtlasToolManifestV1,
    externalSignal: AbortSignal | undefined,
    evidence: AtlasToolEvidenceMetadata[],
  ): Omit<AtlasReadOnlyToolHandlerContext, "signal"> {
    let readCount = 0;
    return Object.freeze({
      plane: context.planeKey,
      readData: async (request) => {
        if (externalSignal?.aborted) throw toolError("CANCELLED");
        if (
          manifest.dataAccess.mode !== "atlas_gateway"
          || !this.options.dataGateway
          || !manifest.dataAccess.permissionCodes.includes(
            request.permissionCode,
          )
          || !manifest.dataAccess.sourceKinds.includes(request.sourceKind)
        ) {
          throw toolError("DATA_ACCESS_DENIED");
        }
        readCount += 1;
        if (readCount > manifest.dataAccess.maxReads) {
          throw toolError("DATA_ACCESS_DENIED");
        }
        let loaded;
        try {
          loaded = await this.options.dataGateway.read(context, request);
        } catch {
          throw toolError("DATA_ACCESS_DENIED");
        }
        if (loaded.authorizationProfileHash !== context.profileHash) {
          throw toolError("DATA_ACCESS_DENIED");
        }
        let data: AtlasJsonValue;
        try {
          data = normalizeAtlasJson(loaded.value);
        } catch {
          throw toolError("DATA_ACCESS_DENIED");
        }
        const loadedEvidence = gatewayEvidence(loaded);
        evidence.push(loadedEvidence);
        return Object.freeze({ data, evidence: loadedEvidence });
      },
    });
  }

  private async finalizeFailure(
    observed: AtlasObservedToolInvocation,
    state: ObservedToolState,
    scope: AtlasToolExecutionScope,
    resolution: AtlasToolAuthorizationResolution,
    error: AtlasToolExecutionError,
    proposedAt: Date,
    _evidence: readonly AtlasToolEvidenceMetadata[],
  ): Promise<void> {
    const completedAt = validDate(this.clock.now());
    await this.finalizeState(observed, state, {
      scope,
      resolution,
      outcome: error.code === "CANCELLED" ? "cancelled" : "failed",
      errorCode: error.code,
      resultHash: null,
      // The durable v1 contract links evidence only to a completed result.
      // A failed/cancelled call has no trusted result to substantiate, and
      // persisting partial read metadata would violate the ledger state
      // invariant and could leave the row ambiguously executing.
      evidence: Object.freeze([]),
      completedAt,
      durationMs: duration(proposedAt, completedAt),
    });
  }

  private async finalizeState(
    observed: AtlasObservedToolInvocation,
    state: ObservedToolState,
    terminal: AtlasToolExecutionTerminal,
  ): Promise<void> {
    state.pendingTerminal = terminal;
    await this.finalize(terminal);
    state.pendingTerminal = null;
    this.observations.delete(observed);
  }

  private async propose(
    proposal: Parameters<AtlasToolExecutionRecorder["propose"]>[0],
  ): Promise<void> {
    try {
      await runBounded(
        () => this.options.recorder.propose(Object.freeze(proposal)),
        this.auditTimeoutMs,
      );
    } catch {
      throw toolError("RECORDING_FAILED");
    }
  }

  private async markExecuting(
    transition: Parameters<AtlasToolExecutionRecorder["markExecuting"]>[0],
  ): Promise<void> {
    try {
      await runBounded(
        () =>
          this.options.recorder.markExecuting(Object.freeze(transition)),
        this.auditTimeoutMs,
      );
    } catch {
      throw toolError("RECORDING_FAILED");
    }
  }

  private async finalize(
    terminal: Parameters<AtlasToolExecutionRecorder["finalize"]>[0],
  ): Promise<void> {
    try {
      await runBounded(
        () => this.options.recorder.finalize(Object.freeze(terminal)),
        this.auditTimeoutMs,
      );
    } catch {
      throw toolError("RECORDING_FAILED");
    }
  }
}

function unresolvedResolution(
  context: VerifiedRequestContext,
  registration: AtlasToolRegistration | undefined,
  runtimeDisposition: AtlasToolExecutionInput["runtimeDisposition"],
): AtlasToolAuthorizationResolution {
  const requiredPermissions =
    registration?.manifest.requiredPermissions ?? Object.freeze([]);
  return Object.freeze({
    toolVersion: registration?.manifest.version ?? null,
    actionCode: registration?.manifest.actionCode ?? null,
    operationClass: "unresolved",
    riskClass: "unknown",
    autonomyDecision: "not_evaluated",
    permissionSnapshot: Object.freeze({
      resolution: "not_evaluated",
      requiredPermissions,
      granted: null,
      profileHash: context.profileHash,
    }),
    policySnapshot: Object.freeze({
      resolution: "not_evaluated",
      autonomyLevel: "disabled",
      requiresHumanConfirmation: true,
      confidenceThreshold: null,
      riskCeiling: null,
    }),
    profileSnapshot: Object.freeze({
      profileHash: context.profileHash,
      schemaHash: context.permissions.schemaHash,
      plane: context.planeKey,
    }),
    authorizationEpoch: context.authEpoch,
    policyRevision: "unresolved",
    profileRevision: context.profileHash,
    proposalSummary: Object.freeze({
      runtimeDisposition,
      gate: "not_evaluated",
      handlerEligible: false,
    }),
  });
}

function resolvedAuthorization(
  context: VerifiedRequestContext,
  preflight: ToolPreflight,
  runtimeDisposition: AtlasToolExecutionInput["runtimeDisposition"],
): AtlasToolAuthorizationResolution {
  const manifest = preflight.registration?.manifest;
  const decision = preflight.policyDecision;
  const permissionResolved = preflight.permission !== "not_evaluated";
  return Object.freeze({
    toolVersion: manifest?.version ?? null,
    actionCode: manifest?.actionCode ?? null,
    operationClass: manifest ? "read" : "unresolved",
    riskClass: manifest?.risk ?? "unknown",
    autonomyDecision:
      preflight.error
      && preflightOutcome(preflight.error.code) === "denied"
        ? "denied"
        : autonomyDecision(decision),
    permissionSnapshot: Object.freeze({
      resolution: permissionResolved ? "resolved" : "not_evaluated",
      requiredPermissions: manifest?.requiredPermissions ?? Object.freeze([]),
      granted: permissionResolved
        ? preflight.permission === "granted"
        : null,
      profileHash: context.profileHash,
    }),
    policySnapshot: decision
      ? Object.freeze({
          resolution: "resolved" as const,
          autonomyLevel: decision.policySnapshot.autonomyLevel,
          requiresHumanConfirmation:
            decision.policySnapshot.requiresHumanConfirmation,
          confidenceThreshold:
            decision.policySnapshot.confidenceThreshold,
          riskCeiling: decision.riskCeiling,
        })
      : Object.freeze({
          resolution: "not_evaluated" as const,
          autonomyLevel: "disabled" as const,
          requiresHumanConfirmation: true,
          confidenceThreshold: null,
          riskCeiling: null,
        }),
    profileSnapshot: Object.freeze({
      profileHash: context.profileHash,
      schemaHash: context.permissions.schemaHash,
      plane: context.planeKey,
    }),
    authorizationEpoch: context.authEpoch,
    policyRevision: decision?.policyRevision ?? "unresolved",
    profileRevision: context.profileHash,
    proposalSummary: Object.freeze({
      runtimeDisposition,
      gate: preflight.gate,
      handlerEligible: preflight.error === null,
    }),
  });
}

function rejected(
  registration: AtlasToolRegistration | undefined,
  argument: NormalizedArgument,
  permission: ToolPreflight["permission"],
  policyDecision: AtlasToolPolicyDecision | null,
  gate: ToolPreflight["gate"],
  code: AtlasToolExecutionErrorCode,
): ToolPreflight {
  return Object.freeze({
    registration,
    input: argument.value,
    argumentHash: argument.hash,
    permission,
    policyDecision,
    gate,
    error: toolError(code),
  });
}

function controlRejection(
  registration: AtlasToolRegistration,
  argument: NormalizedArgument,
  error: unknown,
  permission: ToolPreflight["permission"],
  policyDecision: AtlasToolPolicyDecision | null = null,
): ToolPreflight {
  if (
    error instanceof AtlasToolExecutionError
    && (error.code === "CANCELLED" || error.code === "TIMEOUT")
  ) {
    return rejected(
      registration,
      argument,
      permission,
      policyDecision,
      error.code === "CANCELLED" ? "cancelled" : "timeout",
      error.code,
    );
  }
  return rejected(
    registration,
    argument,
    permission,
    policyDecision,
    "control_error",
    "POLICY_DENIED",
  );
}

function shouldPreserveInitialResolution(
  preflight: ToolPreflight,
): boolean {
  return (
    preflight.policyDecision === null
    && (
      preflight.error?.code === "CANCELLED"
      || preflight.error?.code === "TIMEOUT"
    )
  );
}

function normalizeArgument(input: unknown): NormalizedArgument {
  try {
    const value = normalizeAtlasJson(input);
    return Object.freeze({ value, hash: hashAtlasJson(value) });
  } catch {
    return Object.freeze({ value: null, hash: null });
  }
}

function codeEvidence(
  manifest: AtlasToolManifestV1,
): AtlasToolEvidenceMetadata {
  return Object.freeze({
    schemaVersion: ATLAS_TOOL_EVIDENCE_SCHEMA_VERSION,
    kind: "code",
    sourceId: manifest.source.sourceId,
    sourceVersionId: manifest.source.sourceVersionId,
    sourceChecksum: manifest.source.sourceChecksum,
  });
}

function gatewayEvidence(
  loaded: Awaited<ReturnType<AtlasToolGateway["read"]>>,
): AtlasToolEvidenceMetadata {
  const { source } = loaded;
  if (
    !safeMetadata(source.sourceId, 200)
    || !safeMetadata(source.sourceVersionId, 128)
    || (
      source.sourceChecksum !== undefined
      && !safeMetadata(source.sourceChecksum, 256)
    )
  ) {
    throw toolError("DATA_ACCESS_DENIED");
  }
  return Object.freeze({
    schemaVersion: ATLAS_TOOL_EVIDENCE_SCHEMA_VERSION,
    kind: source.sourceKind,
    sourceId: source.sourceId,
    sourceVersionId: source.sourceVersionId,
    ...(source.sourceChecksum
      ? { sourceChecksum: source.sourceChecksum }
      : {}),
    authorizationProfileHash: loaded.authorizationProfileHash,
  });
}

function freezeEvidence(
  evidence: readonly AtlasToolEvidenceMetadata[],
): readonly AtlasToolEvidenceMetadata[] {
  const unique = new Map<string, AtlasToolEvidenceMetadata>();
  for (const entry of evidence) {
    const key =
      `${entry.kind}:${entry.sourceId}:${entry.sourceVersionId}`;
    unique.set(key, Object.freeze({ ...entry }));
  }
  return Object.freeze(
    [...unique.values()].sort((left, right) =>
      `${left.kind}:${left.sourceId}:${left.sourceVersionId}`.localeCompare(
        `${right.kind}:${right.sourceId}:${right.sourceVersionId}`,
      )
    ),
  );
}

function plainResult(value: unknown): { readonly data: unknown } {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || (
      Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null
    )
  ) {
    throw toolError("MALFORMED_RESULT");
  }
  const keys = Object.keys(value);
  if (
    keys.length !== 1
    || keys[0] !== "data"
    || !Object.prototype.hasOwnProperty.call(value, "data")
  ) {
    throw toolError("MALFORMED_RESULT");
  }
  return value as { readonly data: unknown };
}

function policyInput(manifest: AtlasToolManifestV1) {
  return Object.freeze({
    toolName: manifest.name,
    toolVersion: manifest.version,
    actionCode: manifest.actionCode,
    access: manifest.access,
    risk: manifest.risk,
  });
}

function validPolicyDecision(value: unknown): value is AtlasToolPolicyDecision {
  if (!value || typeof value !== "object") return false;
  const decision = value as Partial<AtlasToolPolicyDecision>;
  const snapshot = decision.policySnapshot;
  const structurallyValid = typeof decision.allowed === "boolean"
    && (
      decision.riskCeiling === "low"
      || decision.riskCeiling === "medium"
      || decision.riskCeiling === "high"
    )
    && safeMetadata(decision.policyRevision, 128)
    && (
      decision.reasonCode === undefined
      || safeMetadata(decision.reasonCode, 128)
    )
    && Boolean(snapshot)
    && (
      snapshot!.autonomyLevel === "disabled"
      || snapshot!.autonomyLevel === "suggest"
      || snapshot!.autonomyLevel === "assist"
      || snapshot!.autonomyLevel === "auto"
    )
    && typeof snapshot!.requiresHumanConfirmation === "boolean"
    && (
      snapshot!.confidenceThreshold === null
      || (
        typeof snapshot!.confidenceThreshold === "number"
        && Number.isFinite(snapshot!.confidenceThreshold)
        && snapshot!.confidenceThreshold >= 0
        && snapshot!.confidenceThreshold <= 1
      )
    );
  if (!structurallyValid) return false;
  if (
    decision.allowed
    && (
      snapshot!.autonomyLevel === "disabled"
      || snapshot!.requiresHumanConfirmation
    )
  ) {
    return false;
  }
  return true;
}

function autonomyDecision(
  decision: AtlasToolPolicyDecision | null,
): AtlasToolAuthorizationResolution["autonomyDecision"] {
  if (!decision) return "not_evaluated";
  if (!decision.allowed || decision.policySnapshot.autonomyLevel === "disabled") {
    return "denied";
  }
  return decision.policySnapshot.autonomyLevel;
}

function hasPermissions(
  context: VerifiedRequestContext,
  required: readonly string[],
): boolean {
  return required.every((permission) =>
    context.permissions.allowed.has(permission)
    && !context.permissions.denied.has(permission)
    && !context.permissions.planLocked.has(permission)
    && !context.permissions.planeExcluded.has(permission)
  );
}

function exceedsRisk(
  risk: keyof typeof RISK_RANK,
  ceiling: keyof typeof RISK_RANK,
): boolean {
  return RISK_RANK[risk] > RISK_RANK[ceiling];
}

function assertVerifiedContext(context: VerifiedRequestContext): void {
  const permissions = context?.permissions;
  if (
    !context
    || !safeMetadata(context.tenantId, 128)
    || !safeMetadata(context.principalId, 128)
    || !safeMetadata(context.realmKey, 128)
    || !safeMetadata(context.requestId, 128)
    || !safeMetadata(context.profileHash, 128)
    || !Number.isSafeInteger(context.authEpoch)
    || context.authEpoch < 0
    || !permissions
    || permissions.tenantId !== context.tenantId
    || permissions.principalId !== context.principalId
    || permissions.planeKey !== context.planeKey
    || permissions.profileHash !== context.profileHash
    || !safeMetadata(permissions.schemaHash, 128)
    || typeof permissions.allowed?.has !== "function"
    || typeof permissions.denied?.has !== "function"
    || typeof permissions.planLocked?.has !== "function"
    || typeof permissions.planeExcluded?.has !== "function"
  ) {
    throw toolError("INVALID_VERIFIED_CONTEXT");
  }
}

function assertObservedContext(
  context: VerifiedRequestContext,
  state: ObservedToolState,
): void {
  if (
    context.tenantId !== state.context.tenantId
    || context.principalId !== state.context.principalId
    || context.planeKey !== state.context.plane
    || context.profileHash !== state.context.profileHash
    || context.authEpoch !== state.context.authEpoch
  ) {
    throw toolError("AUTHORIZATION_STALE");
  }
}

function sameRegistration(
  observed: AtlasToolRegistration | undefined,
  current: AtlasToolRegistration | undefined,
): boolean {
  return observed === current;
}

function assertInvocation(input: AtlasToolExecutionInput): void {
  if (
    !input
    || !UUID_RE.test(input.runId)
    || !UUID_RE.test(input.threadId)
    || !SAFE_ID_RE.test(input.callId)
    || !TOOL_NAME_RE.test(input.toolName)
    || (
      input.runtimeDisposition !== "described"
      && input.runtimeDisposition !== "not_described"
      && input.runtimeDisposition !== "schema_invalid"
    )
    || (
      input.maxResultBytes !== undefined
      && (
        !Number.isSafeInteger(input.maxResultBytes)
        || input.maxResultBytes < 1
        || input.maxResultBytes > 1_048_576
      )
    )
  ) {
    throw toolError("INVALID_INVOCATION");
  }
}

function validDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Atlas tool clock returned an invalid date.");
  }
  return new Date(value);
}

function duration(startedAt: Date, completedAt: Date): number {
  return Math.max(0, Math.trunc(completedAt.getTime() - startedAt.getTime()));
}

function remaining(deadline: number): number {
  const value = deadline - Date.now();
  if (value <= 0) throw toolError("TIMEOUT");
  return Math.max(1, Math.trunc(value));
}

async function safeControl<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  try {
    return await runBounded(() => operation(), timeoutMs);
  } catch {
    return null;
  }
}

function runBounded<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<T> {
  if (externalSignal?.aborted) {
    return Promise.reject(toolError("CANCELLED"));
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    return Promise.reject(toolError("TIMEOUT"));
  }
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => {
      controller.abort();
      finish(() => reject(toolError("CANCELLED")));
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish(() => reject(toolError("TIMEOUT")));
    }, timeoutMs);
    externalSignal?.addEventListener("abort", onAbort, { once: true });
    Promise.resolve()
      .then(() => operation(controller.signal))
      .then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
  });
}

function mapHandlerError(error: unknown): AtlasToolExecutionError {
  if (error instanceof AtlasToolExecutionError) return error;
  if (error instanceof AtlasDataGatewayError) {
    return toolError("DATA_ACCESS_DENIED");
  }
  return toolError("HANDLER_FAILED");
}

function preflightOutcome(
  code: AtlasToolExecutionErrorCode,
): AtlasToolExecutionOutcome {
  if (code === "CANCELLED") return "cancelled";
  if (code === "TIMEOUT") return "failed";
  return "denied";
}

function toolError(
  code: AtlasToolExecutionErrorCode,
): AtlasToolExecutionError {
  const messages: Record<AtlasToolExecutionErrorCode, string> = {
    INVALID_VERIFIED_CONTEXT:
      "Atlas tool execution requires a valid verified request context.",
    INVALID_INVOCATION: "The Atlas tool invocation is malformed.",
    UNKNOWN_TOOL: "The requested Atlas tool is unavailable.",
    TOOL_DISABLED: "The requested Atlas tool is unavailable.",
    TOOL_NOT_DESCRIBED:
      "The requested Atlas tool was not in the effective tool set.",
    WRONG_PLANE: "The requested Atlas tool is unavailable in this plane.",
    PERMISSION_DENIED: "The Atlas tool invocation is not authorized.",
    AUTHORIZATION_STALE:
      "The Atlas tool authorization snapshot is no longer current.",
    FEATURE_DISABLED: "The requested Atlas tool is unavailable.",
    POLICY_DENIED: "Atlas policy denied the tool invocation.",
    RISK_CEILING_EXCEEDED: "Atlas policy denied the tool invocation.",
    MALFORMED_ARGUMENTS: "The Atlas tool arguments are invalid.",
    CANCELLED: "The Atlas tool invocation was cancelled.",
    TIMEOUT: "The Atlas tool invocation exceeded its time limit.",
    DATA_ACCESS_DENIED: "The Atlas tool could not access governed data.",
    HANDLER_FAILED: "The Atlas tool invocation failed.",
    MALFORMED_RESULT: "The Atlas tool returned invalid data.",
    RESULT_TOO_LARGE: "The Atlas tool result exceeded its size limit.",
    PROVIDER_TERMINATED:
      "The provider ended before the Atlas tool could execute.",
    RECORDING_FAILED: "The Atlas tool audit transition could not be persisted.",
  };
  return new AtlasToolExecutionError(code, messages[code]);
}

function safeMetadata(
  value: unknown,
  maximumLength: number,
): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximumLength
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function positiveInteger(
  value: number,
  name: string,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be a positive bounded integer.`);
  }
  return value;
}
