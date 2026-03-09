// framework/runtime/src/services/business/engines/posting-engine/services/close-risk-signal-operations.ts
//
// CloseRiskSignalOperationsService — single truth path for all risk signal
// state changes. Both BFF on-demand evaluation and scheduled worker delegate
// to this service, ensuring identical persistence, activity logging, event
// emission, and escalation timer behavior.

import type { OperationContext } from "../../shared/engine-base";
import type { ServiceResult } from "../../shared/engine-base";
import { ok, fail } from "../../shared/engine-base";

import type {
  CloseGateTarget,
  CloseRiskRule,
  CloseRiskSignal,
  RiskSignalState,
  RiskEvaluationContext,
  RiskSignalOperationsResult,
  RiskSignalTransitionResult,
  RiskSignalEventPayload,
  RiskSignalActivityPayload,
  CloseRiskSchedule,
} from "../domain/types";

import {
  RISK_SIGNAL_TRANSITIONS,
  RISK_SIGNAL_EVENT_MAP,
  RISK_SIGNAL_ACTIVITY_MAP,
} from "../domain/types";

import { evaluateRiskRules } from "../domain/close-risk-evaluator";

import type {
  CloseRiskRuleRepo,
  CloseRiskSignalRepo,
  CloseOrchestrationSnapshotRepo,
  PeriodCloseActivityRepo,
} from "../persistence/period-close-repo";

import type { RiskSignalEventEmitter } from "./risk-signal-event-publisher";

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface CloseRiskSignalOperationsService {
  /** Evaluate all active rules for a period+target. Single truth path. */
  evaluate(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
  ): Promise<ServiceResult<RiskSignalOperationsResult>>;

  /** Transition a signal state (acknowledge, resolve, suppress). */
  transition(
    ctx: OperationContext,
    signalId: string,
    targetState: RiskSignalState,
    resolutionNotes?: string | null,
  ): Promise<ServiceResult<RiskSignalTransitionResult>>;

  /** Check and escalate overdue signals for a period. */
  escalateOverdue(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<ServiceResult<{ escalated: number }>>;
}

// ---------------------------------------------------------------------------
// Default implementation
// ---------------------------------------------------------------------------

export class DefaultCloseRiskSignalOperationsService
  implements CloseRiskSignalOperationsService
{
  constructor(
    private readonly ruleRepo: CloseRiskRuleRepo,
    private readonly signalRepo: CloseRiskSignalRepo,
    private readonly snapshotRepo: CloseOrchestrationSnapshotRepo,
    private readonly activityRepo: PeriodCloseActivityRepo,
    private readonly eventEmitter: RiskSignalEventEmitter,
    private readonly contextLoader: RiskEvaluationContextLoader,
  ) {}

  // ── Evaluate ──────────────────────────────────────────────────────────

  async evaluate(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
  ): Promise<ServiceResult<RiskSignalOperationsResult>> {
    // 1. Load evaluation context via the context loader
    const evalCtx = await this.contextLoader.load(
      ctx.tenantId, entityCode, fiscalYear, periodNumber, targetStatus,
    );
    if (!evalCtx) {
      return fail("NO_SNAPSHOTS", "No orchestration snapshots found for this period");
    }

    // 2. Load active rules
    const rules = await this.ruleRepo.listByEntity(ctx.tenantId, entityCode);
    const activeRules = rules.filter((r) => r.isActive);
    if (activeRules.length === 0) {
      return ok({
        evaluated: 0, fired: 0, skippedCooldown: 0, skippedSuppressed: 0,
        autoResolved: 0, escalationsScheduled: 0, eventsEmitted: 0,
        signals: [], autoResolvedSignals: [],
      });
    }

    // 3. Evaluate (pure domain function)
    const batchResult = evaluateRiskRules(activeRules, evalCtx);

    // 4. Persist fired signals + emit events + append activity
    const now = new Date();
    let eventsEmitted = 0;
    let escalationsScheduled = 0;
    const insertedSignals: RiskSignalOperationsResult["signals"] = [];

    for (const sig of batchResult.signals) {
      // Find the rule for escalation policy
      const rule = activeRules.find((r) => r.ruleCode === sig.ruleCode);

      const inserted = await this.signalRepo.insert(ctx.tenantId, {
        entityCode,
        fiscalYear,
        periodNumber,
        ruleId: rule?.id ?? "",
        ruleCode: sig.ruleCode,
        ruleType: sig.ruleType,
        severity: sig.severity,
        signalState: "fired",
        signalFingerprint: sig.fingerprint,
        suppressionScope: null,
        triggerSnapshotId: evalCtx.currentSnapshot.id,
        title: sig.title,
        message: sig.message,
        evidence: sig.evidence,
        firedAt: now,
        acknowledgedBy: null,
        acknowledgedAt: null,
        resolvedBy: null,
        resolvedAt: null,
        resolutionNotes: null,
        escalationLevel: 0,
        lastEscalatedAt: null,
      });

      insertedSignals.push({
        signalId: inserted.id,
        ruleCode: sig.ruleCode,
        ruleType: sig.ruleType,
        severity: sig.severity,
        title: sig.title,
        fingerprint: sig.fingerprint,
        affectedTaskCodes: sig.affectedTaskCodes,
      });

      // Activity log
      const activityPayload: RiskSignalActivityPayload = {
        signalId: inserted.id,
        ruleId: rule?.id ?? "",
        ruleCode: sig.ruleCode,
        ruleType: sig.ruleType,
        signalFingerprint: sig.fingerprint,
        priorState: null,
        newState: "fired",
        targetStatus,
        affectedTaskCodes: sig.affectedTaskCodes,
        evaluationAt: now.toISOString(),
      };

      await this.activityRepo.append(ctx.tenantId, {
        entityCode,
        fiscalYear,
        periodNumber,
        taskCode: null,
        activityType: "RISK_SIGNAL_FIRED",
        actorType: ctx.actorType === "SCHEDULER" ? "scheduler" : "system",
        actorId: ctx.actorId,
        message: sig.title,
        payload: activityPayload as unknown as Record<string, unknown>,
      });

      // Domain event
      const eventPayload: RiskSignalEventPayload = {
        signalId: inserted.id,
        ruleId: rule?.id ?? "",
        ruleCode: sig.ruleCode,
        ruleType: sig.ruleType,
        severity: sig.severity,
        signalFingerprint: sig.fingerprint,
        priorState: null,
        newState: "fired",
        targetStatus,
        affectedTaskCodes: sig.affectedTaskCodes,
        title: sig.title,
        message: sig.message,
        escalationRole: rule?.escalationRole ?? null,
        escalationLevel: 0,
        entityCode,
        fiscalYear,
        periodNumber,
      };

      await this.eventEmitter.emit("fin.risk_signal.fired", eventPayload, ctx);
      eventsEmitted++;

      // Track if escalation timer should be scheduled
      if (rule?.escalationEnabled) {
        escalationsScheduled++;
      }
    }

    // 5. Persist auto-resolved signals + emit events
    const autoResolvedOut: RiskSignalOperationsResult["autoResolvedSignals"] = [];
    for (const ar of batchResult.autoResolvedSignals) {
      await this.signalRepo.updateState(ctx.tenantId, ar.signalId, {
        signalState: "resolved",
        resolvedBy: "system",
        resolvedAt: now,
        resolutionNotes: "Auto-resolved: condition cleared",
      });

      autoResolvedOut.push({
        signalId: ar.signalId,
        ruleCode: ar.ruleCode,
        fingerprint: ar.fingerprint,
      });

      await this.activityRepo.append(ctx.tenantId, {
        entityCode,
        fiscalYear,
        periodNumber,
        taskCode: null,
        activityType: "RISK_SIGNAL_RESOLVED",
        actorType: "system",
        actorId: "system",
        message: `Auto-resolved: condition cleared for ${ar.ruleCode}`,
        payload: {
          signalId: ar.signalId,
          ruleCode: ar.ruleCode,
          signalFingerprint: ar.fingerprint,
          priorState: "fired",
          newState: "resolved",
          targetStatus,
          affectedTaskCodes: [],
          evaluationAt: now.toISOString(),
        } satisfies Partial<RiskSignalActivityPayload> as unknown as Record<string, unknown>,
      });

      await this.eventEmitter.emit("fin.risk_signal.resolved", {
        signalId: ar.signalId,
        ruleId: "",
        ruleCode: ar.ruleCode,
        ruleType: "forecast_slipped", // placeholder — actual type would be loaded
        severity: "medium",
        signalFingerprint: ar.fingerprint,
        priorState: "fired",
        newState: "resolved",
        targetStatus,
        affectedTaskCodes: [],
        title: `Auto-resolved: ${ar.ruleCode}`,
        message: "Condition cleared",
        escalationRole: null,
        escalationLevel: 0,
        entityCode,
        fiscalYear,
        periodNumber,
      }, ctx);
      eventsEmitted++;
    }

    return ok({
      evaluated: batchResult.evaluated,
      fired: batchResult.fired,
      skippedCooldown: batchResult.skippedCooldown,
      skippedSuppressed: batchResult.skippedSuppressed,
      autoResolved: batchResult.autoResolved,
      escalationsScheduled,
      eventsEmitted,
      signals: insertedSignals,
      autoResolvedSignals: autoResolvedOut,
    });
  }

  // ── Transition ────────────────────────────────────────────────────────

  async transition(
    ctx: OperationContext,
    signalId: string,
    targetState: RiskSignalState,
    resolutionNotes?: string | null,
  ): Promise<ServiceResult<RiskSignalTransitionResult>> {
    // Load current signal
    const current = await this.signalRepo.getById(ctx.tenantId, signalId);
    if (!current) {
      return fail("NOT_FOUND", "Signal not found");
    }

    // Validate transition
    const allowed = RISK_SIGNAL_TRANSITIONS[current.signalState] ?? [];
    if (!allowed.includes(targetState)) {
      return fail(
        "INVALID_TRANSITION",
        `Cannot transition from "${current.signalState}" to "${targetState}"`,
        { allowed },
      );
    }

    // Build update
    const now = new Date();
    const update: Parameters<CloseRiskSignalRepo["updateState"]>[2] = {
      signalState: targetState,
    };

    if (targetState === "acknowledged") {
      update.acknowledgedBy = ctx.actorId;
      update.acknowledgedAt = now;
    } else if (targetState === "resolved") {
      update.resolvedBy = ctx.actorId;
      update.resolvedAt = now;
      update.resolutionNotes = resolutionNotes ?? undefined;
    } else if (targetState === "suppressed") {
      // Copy suppression_scope from the rule
      const rule = await this.ruleRepo.getByCode(
        ctx.tenantId, current.entityCode, current.ruleCode,
      );
      update.suppressionScope = rule?.suppressionScope ?? "instance";
    }

    const updated = await this.signalRepo.updateState(ctx.tenantId, signalId, update);

    // Activity log
    const activityType = RISK_SIGNAL_ACTIVITY_MAP[targetState];
    await this.activityRepo.append(ctx.tenantId, {
      entityCode: current.entityCode,
      fiscalYear: current.fiscalYear,
      periodNumber: current.periodNumber,
      taskCode: null,
      activityType,
      actorType: ctx.actorType === "SCHEDULER" ? "scheduler" : "user",
      actorId: ctx.actorId,
      message: `Risk signal ${targetState}: ${current.title}`,
      payload: {
        signalId,
        ruleId: current.ruleId,
        ruleCode: current.ruleCode,
        ruleType: current.ruleType,
        signalFingerprint: current.signalFingerprint,
        priorState: current.signalState,
        newState: targetState,
        targetStatus: null,
        affectedTaskCodes: [],
        evaluationAt: now.toISOString(),
        resolutionNotes: resolutionNotes ?? null,
      } as unknown as Record<string, unknown>,
    });

    // Domain event
    const eventType = RISK_SIGNAL_EVENT_MAP[targetState];
    const eventPayload: RiskSignalEventPayload = {
      signalId,
      ruleId: current.ruleId,
      ruleCode: current.ruleCode,
      ruleType: current.ruleType,
      severity: current.severity,
      signalFingerprint: current.signalFingerprint,
      priorState: current.signalState,
      newState: targetState,
      targetStatus: null,
      affectedTaskCodes: [],
      title: current.title,
      message: current.message,
      escalationRole: null,
      escalationLevel: updated.escalationLevel,
      entityCode: current.entityCode,
      fiscalYear: current.fiscalYear,
      periodNumber: current.periodNumber,
    };

    await this.eventEmitter.emit(eventType, eventPayload, ctx);

    return ok({ signal: updated, eventType });
  }

  // ── Escalate overdue ──────────────────────────────────────────────────

  async escalateOverdue(
    ctx: OperationContext,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<ServiceResult<{ escalated: number }>> {
    const now = new Date();

    // Load active signals + rules
    const activeSignals = await this.signalRepo.listActive(
      ctx.tenantId, entityCode, fiscalYear, periodNumber,
    );
    const rules = await this.ruleRepo.listByEntity(ctx.tenantId, entityCode);
    const ruleMap = new Map(rules.map((r) => [r.id, r]));

    let escalated = 0;

    for (const signal of activeSignals) {
      const rule = ruleMap.get(signal.ruleId);
      if (!rule?.escalationEnabled) continue;
      if (signal.escalationLevel >= rule.maxEscalationLevel) continue;

      // Determine if SLA is breached
      let slaBreach = false;

      if (signal.signalState === "fired" && rule.acknowledgeSlaMinutes > 0) {
        const slaDeadline = new Date(
          signal.firedAt.getTime() + rule.acknowledgeSlaMinutes * 60_000,
        );
        if (now > slaDeadline) slaBreach = true;
      }

      if (signal.signalState === "acknowledged" && rule.resolveSlaMinutes > 0) {
        const ackAt = signal.acknowledgedAt ?? signal.firedAt;
        const slaDeadline = new Date(
          ackAt.getTime() + rule.resolveSlaMinutes * 60_000,
        );
        if (now > slaDeadline) slaBreach = true;
      }

      // Check escalation interval for multi-step escalation
      if (slaBreach && signal.escalationLevel > 0 && signal.lastEscalatedAt) {
        const nextEscalationAt = new Date(
          signal.lastEscalatedAt.getTime() + rule.escalationIntervalMinutes * 60_000,
        );
        if (now < nextEscalationAt) slaBreach = false;
      }

      if (!slaBreach) continue;

      // Escalate — signal state stays the same, only escalation level advances
      const newLevel = signal.escalationLevel + 1;
      await this.signalRepo.escalate(ctx.tenantId, signal.id, newLevel, now);

      // Activity log
      await this.activityRepo.append(ctx.tenantId, {
        entityCode,
        fiscalYear,
        periodNumber,
        taskCode: null,
        activityType: "RISK_SIGNAL_ESCALATED",
        actorType: "scheduler",
        actorId: "system",
        message: `Escalated (level ${newLevel}): ${signal.title}`,
        payload: {
          signalId: signal.id,
          ruleId: signal.ruleId,
          ruleCode: signal.ruleCode,
          ruleType: signal.ruleType,
          signalFingerprint: signal.signalFingerprint,
          priorState: signal.signalState,
          newState: signal.signalState,
          targetStatus: null,
          affectedTaskCodes: [],
          evaluationAt: now.toISOString(),
          escalationLevel: newLevel,
          escalationRole: rule.escalationRole,
        } as unknown as Record<string, unknown>,
      });

      // Domain event
      await this.eventEmitter.emit("fin.risk_signal.escalated", {
        signalId: signal.id,
        ruleId: signal.ruleId,
        ruleCode: signal.ruleCode,
        ruleType: signal.ruleType,
        severity: signal.severity,
        signalFingerprint: signal.signalFingerprint,
        priorState: signal.signalState,
        newState: signal.signalState,
        targetStatus: null,
        affectedTaskCodes: [],
        title: signal.title,
        message: `Escalated to level ${newLevel}: ${signal.message}`,
        escalationRole: rule.escalationRole,
        escalationLevel: newLevel,
        entityCode,
        fiscalYear,
        periodNumber,
      }, ctx);

      escalated++;
    }

    return ok({ escalated });
  }
}

// ---------------------------------------------------------------------------
// Context loader interface — decouples data loading from service logic
// ---------------------------------------------------------------------------

export interface RiskEvaluationContextLoader {
  load(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
    targetStatus: CloseGateTarget,
  ): Promise<RiskEvaluationContext | null>;
}
