/**
 * Compliance Reporting Service
 *
 * Generates compliance reports including cycle duration, SLA breaches,
 * escalation frequency, and approver workload analytics.
 */

import type {
  ApproverWorkloadReport,
  ComplianceSummaryReport,
  CycleDurationReport,
  EscalationReport,
  IAuditRepository,
  IComplianceReportingService,
  ReportOptions,
  SlaBreachReport,
} from "./types.js";
import type { IApprovalInstanceRepository } from "../instance/types.js";

/**
 * Compliance Reporting Service Implementation
 */
export class ComplianceReportingService implements IComplianceReportingService {
  private scheduledReports: Map<string, { schedule: string; options: ReportOptions; recipients: string[] }> =
    new Map();

  constructor(
    private readonly auditRepository: IAuditRepository,
    private readonly instanceRepository: IApprovalInstanceRepository
  ) {}

  /**
   * Generate cycle duration report
   */
  async generateCycleDurationReport(options: ReportOptions): Promise<CycleDurationReport> {
    const { period, tenantId, templateCodes, entityTypes } = options;

    // Get instances completed within the period
    const instances = await this.instanceRepository.list(tenantId, {
      completedAfter: period.startDate,
      completedBefore: period.endDate,
      includeCompleted: true,
    });

    // Filter by template codes and entity types if specified
    let filteredInstances = instances;
    if (templateCodes && templateCodes.length > 0) {
      filteredInstances = filteredInstances.filter((i) =>
        templateCodes.includes(i.workflowSnapshot.templateCode)
      );
    }
    if (entityTypes && entityTypes.length > 0) {
      filteredInstances = filteredInstances.filter((i) => entityTypes.includes(i.entity.type));
    }

    // Calculate durations
    const durations = filteredInstances
      .filter((i) => i.completedAt && i.createdAt)
      .map((i) => i.completedAt!.getTime() - i.createdAt.getTime());

    // Sort for percentile calculations
    durations.sort((a, b) => a - b);

    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const medianDuration = durations.length > 0 ? durations[Math.floor(durations.length / 2)] : 0;
    const p95Duration = durations.length > 0 ? durations[Math.floor(durations.length * 0.95)] : 0;

    // Breakdown by workflow
    const byWorkflow = new Map<string, number[]>();
    for (const inst of filteredInstances) {
      if (!inst.completedAt) continue;
      const code = inst.workflowSnapshot.templateCode;
      if (!byWorkflow.has(code)) byWorkflow.set(code, []);
      byWorkflow.get(code)!.push(inst.completedAt.getTime() - inst.createdAt.getTime());
    }

    const breakdown = Array.from(byWorkflow.entries()).map(([code, durs]) => ({
      groupKey: code,
      groupLabel: filteredInstances.find((i) => i.workflowSnapshot.templateCode === code)?.workflowSnapshot
        .templateName,
      instanceCount: durs.length,
      avgDurationMs: durs.reduce((a, b) => a + b, 0) / durs.length,
      minDurationMs: Math.min(...durs),
      maxDurationMs: Math.max(...durs),
    }));

    // Duration distribution
    const buckets = [
      { label: "0-1h", max: 3600000 },
      { label: "1-4h", max: 14400000 },
      { label: "4-24h", max: 86400000 },
      { label: "1-3d", max: 259200000 },
      { label: "3-7d", max: 604800000 },
      { label: "7d+", max: Infinity },
    ];

    const distribution = buckets.map((bucket, idx) => {
      const min = idx > 0 ? buckets[idx - 1].max : 0;
      const count = durations.filter((d) => d >= min && d < bucket.max).length;
      return {
        bucket: bucket.label,
        count,
        percentage: durations.length > 0 ? (count / durations.length) * 100 : 0,
      };
    });

    // Trends by day
    const trendsByDay = new Map<string, { total: number; count: number }>();
    for (const inst of filteredInstances) {
      if (!inst.completedAt) continue;
      const dayKey = inst.completedAt.toISOString().split("T")[0];
      if (!trendsByDay.has(dayKey)) trendsByDay.set(dayKey, { total: 0, count: 0 });
      const entry = trendsByDay.get(dayKey)!;
      entry.total += inst.completedAt.getTime() - inst.createdAt.getTime();
      entry.count++;
    }

    const trends = Array.from(trendsByDay.entries())
      .map(([date, data]) => ({
        date: new Date(date),
        avgDurationMs: data.total / data.count,
        instanceCount: data.count,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      period,
      groupBy: options.groupBy || "workflow",
      overall: {
        totalInstances: filteredInstances.length,
        completedInstances: durations.length,
        avgDurationMs: avgDuration,
        minDurationMs: durations.length > 0 ? Math.min(...durations) : 0,
        maxDurationMs: durations.length > 0 ? Math.max(...durations) : 0,
        medianDurationMs: medianDuration,
        p95DurationMs: p95Duration,
      },
      breakdown,
      distribution,
      trends,
    };
  }

  /**
   * Generate SLA breach report
   */
  async generateSlaBreachReport(options: ReportOptions): Promise<SlaBreachReport> {
    const { period, tenantId } = options;

    // Get audit events for SLA breaches
    const events = await this.auditRepository.getEvents(tenantId, {
      startDate: period.startDate,
      endDate: period.endDate,
      eventTypes: ["sla.breach", "sla.warning"],
    });

    // Get all instances in period
    const instances = await this.instanceRepository.list(tenantId, {
      createdAfter: period.startDate,
      createdBefore: period.endDate,
    });

    // Count breaches
    const breachEvents = events.filter((e) => e.eventType === "sla.breach");
    const breachedInstanceIds = new Set(breachEvents.map((e) => e.instanceId));

    // Breach types (response vs completion)
    const responseBreaches = breachEvents.filter(
      (e) => (e.details?.breachType as string) === "response"
    ).length;
    const completionBreaches = breachEvents.filter(
      (e) => (e.details?.breachType as string) === "completion"
    ).length;

    // By workflow
    const byWorkflowMap = new Map<
      string,
      { name: string; total: number; breached: Set<string> }
    >();
    for (const inst of instances) {
      const code = inst.workflowSnapshot.templateCode;
      if (!byWorkflowMap.has(code)) {
        byWorkflowMap.set(code, {
          name: inst.workflowSnapshot.templateName,
          total: 0,
          breached: new Set(),
        });
      }
      byWorkflowMap.get(code)!.total++;
      if (breachedInstanceIds.has(inst.id)) {
        byWorkflowMap.get(code)!.breached.add(inst.id);
      }
    }

    const byWorkflow = Array.from(byWorkflowMap.entries()).map(([code, data]) => ({
      templateCode: code,
      templateName: data.name,
      totalInstances: data.total,
      breachedInstances: data.breached.size,
      breachRate: data.total > 0 ? (data.breached.size / data.total) * 100 : 0,
    }));

    // By step
    const byStepMap = new Map<
      string,
      { level: number; total: number; breaches: number; totalBreachMs: number }
    >();
    for (const event of breachEvents) {
      const stepName = (event.details?.stepName as string) || "Unknown";
      const stepLevel = (event.details?.stepLevel as number) || 0;
      const breachDuration = (event.details?.breachDurationMs as number) || 0;

      if (!byStepMap.has(stepName)) {
        byStepMap.set(stepName, { level: stepLevel, total: 0, breaches: 0, totalBreachMs: 0 });
      }
      const entry = byStepMap.get(stepName)!;
      entry.breaches++;
      entry.totalBreachMs += breachDuration;
    }

    // Get step activation counts for rate calculation
    const stepActivations = await this.auditRepository.getEvents(tenantId, {
      startDate: period.startDate,
      endDate: period.endDate,
      eventTypes: ["step.activated"],
    });
    for (const event of stepActivations) {
      const stepName = (event.details?.stepName as string) || "Unknown";
      const stepLevel = (event.details?.stepLevel as number) || 0;
      if (!byStepMap.has(stepName)) {
        byStepMap.set(stepName, { level: stepLevel, total: 0, breaches: 0, totalBreachMs: 0 });
      }
      byStepMap.get(stepName)!.total++;
    }

    const byStep = Array.from(byStepMap.entries()).map(([name, data]) => ({
      stepName: name,
      stepLevel: data.level,
      totalActivations: data.total,
      breaches: data.breaches,
      breachRate: data.total > 0 ? (data.breaches / data.total) * 100 : 0,
      avgBreachDurationMs: data.breaches > 0 ? data.totalBreachMs / data.breaches : 0,
    }));

    // Trends by day
    const trendsByDay = new Map<string, { total: number; breached: Set<string> }>();
    for (const inst of instances) {
      const dayKey = inst.createdAt.toISOString().split("T")[0];
      if (!trendsByDay.has(dayKey)) {
        trendsByDay.set(dayKey, { total: 0, breached: new Set() });
      }
      trendsByDay.get(dayKey)!.total++;
    }
    for (const event of breachEvents) {
      const dayKey = event.timestamp.toISOString().split("T")[0];
      if (trendsByDay.has(dayKey)) {
        trendsByDay.get(dayKey)!.breached.add(event.instanceId);
      }
    }

    const trends = Array.from(trendsByDay.entries())
      .map(([date, data]) => ({
        date: new Date(date),
        totalInstances: data.total,
        breachedInstances: data.breached.size,
        breachRate: data.total > 0 ? (data.breached.size / data.total) * 100 : 0,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    // Top breaches
    const breachCountByInstance = new Map<string, { ref: string; workflow: string; count: number; totalMs: number }>();
    for (const event of breachEvents) {
      if (!breachCountByInstance.has(event.instanceId)) {
        breachCountByInstance.set(event.instanceId, {
          ref: event.entity.referenceCode || event.entity.id,
          workflow: event.workflow.templateName,
          count: 0,
          totalMs: 0,
        });
      }
      const entry = breachCountByInstance.get(event.instanceId)!;
      entry.count++;
      entry.totalMs += (event.details?.breachDurationMs as number) || 0;
    }

    const topBreaches = Array.from(breachCountByInstance.entries())
      .map(([id, data]) => ({
        instanceId: id,
        entityReference: data.ref,
        workflowName: data.workflow,
        breachCount: data.count,
        totalBreachDurationMs: data.totalMs,
      }))
      .sort((a, b) => b.breachCount - a.breachCount)
      .slice(0, 10);

    return {
      period,
      overall: {
        totalInstances: instances.length,
        breachedInstances: breachedInstanceIds.size,
        breachRate: instances.length > 0 ? (breachedInstanceIds.size / instances.length) * 100 : 0,
        avgBreachDurationMs: 0, // Would calculate from events
        totalBreaches: breachEvents.length,
      },
      breachTypes: {
        responseBreaches,
        completionBreaches,
      },
      byWorkflow,
      byStep,
      trends,
      topBreaches,
    };
  }

  /**
   * Generate escalation report
   */
  async generateEscalationReport(options: ReportOptions): Promise<EscalationReport> {
    const { period, tenantId } = options;

    // Get escalation events
    const events = await this.auditRepository.getEvents(tenantId, {
      startDate: period.startDate,
      endDate: period.endDate,
      eventTypes: ["step.escalated", "sla.escalation"],
    });

    // Get all instances
    const instances = await this.instanceRepository.list(tenantId, {
      createdAfter: period.startDate,
      createdBefore: period.endDate,
    });

    const escalatedInstanceIds = new Set(events.map((e) => e.instanceId));

    // By reason
    const byReasonMap = new Map<string, number>();
    for (const event of events) {
      const reason = (event.details?.reason as string) || "SLA Breach";
      byReasonMap.set(reason, (byReasonMap.get(reason) || 0) + 1);
    }
    const byReason = Array.from(byReasonMap.entries()).map(([reason, count]) => ({
      reason,
      count,
      percentage: events.length > 0 ? (count / events.length) * 100 : 0,
    }));

    // By action
    const byActionMap = new Map<string, number>();
    for (const event of events) {
      const action = (event.details?.escalationAction as string) || "notify";
      byActionMap.set(action, (byActionMap.get(action) || 0) + 1);
    }
    const byAction = Array.from(byActionMap.entries()).map(([action, count]) => ({
      action,
      count,
      percentage: events.length > 0 ? (count / events.length) * 100 : 0,
    }));

    // By level
    const byLevelMap = new Map<number, { count: number; resolvedAtLevel: number; escalatedFurther: number }>();
    for (const event of events) {
      const level = (event.details?.escalationLevel as number) || 1;
      if (!byLevelMap.has(level)) {
        byLevelMap.set(level, { count: 0, resolvedAtLevel: 0, escalatedFurther: 0 });
      }
      byLevelMap.get(level)!.count++;
    }
    const byLevel = Array.from(byLevelMap.entries())
      .map(([level, data]) => ({
        level,
        count: data.count,
        resolvedAtLevel: data.resolvedAtLevel,
        escalatedFurther: data.escalatedFurther,
      }))
      .sort((a, b) => a.level - b.level);

    // By workflow
    const byWorkflowMap = new Map<string, { name: string; total: number; escalated: Set<string>; totalEscalations: number }>();
    for (const inst of instances) {
      const code = inst.workflowSnapshot.templateCode;
      if (!byWorkflowMap.has(code)) {
        byWorkflowMap.set(code, {
          name: inst.workflowSnapshot.templateName,
          total: 0,
          escalated: new Set(),
          totalEscalations: 0,
        });
      }
      byWorkflowMap.get(code)!.total++;
    }
    for (const event of events) {
      const code = event.workflow.templateCode;
      if (byWorkflowMap.has(code)) {
        byWorkflowMap.get(code)!.escalated.add(event.instanceId);
        byWorkflowMap.get(code)!.totalEscalations++;
      }
    }

    const byWorkflow = Array.from(byWorkflowMap.entries()).map(([code, data]) => ({
      templateCode: code,
      templateName: data.name,
      totalInstances: data.total,
      escalatedInstances: data.escalated.size,
      escalationRate: data.total > 0 ? (data.escalated.size / data.total) * 100 : 0,
      avgEscalationLevel: data.totalEscalations > 0 ? data.totalEscalations / data.escalated.size : 0,
    }));

    // Trends
    const trendsByDay = new Map<string, { total: number; escalated: Set<string>; escalations: number }>();
    for (const inst of instances) {
      const dayKey = inst.createdAt.toISOString().split("T")[0];
      if (!trendsByDay.has(dayKey)) {
        trendsByDay.set(dayKey, { total: 0, escalated: new Set(), escalations: 0 });
      }
      trendsByDay.get(dayKey)!.total++;
    }
    for (const event of events) {
      const dayKey = event.timestamp.toISOString().split("T")[0];
      if (trendsByDay.has(dayKey)) {
        trendsByDay.get(dayKey)!.escalated.add(event.instanceId);
        trendsByDay.get(dayKey)!.escalations++;
      }
    }

    const trends = Array.from(trendsByDay.entries())
      .map(([date, data]) => ({
        date: new Date(date),
        totalInstances: data.total,
        escalatedInstances: data.escalated.size,
        totalEscalations: data.escalations,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      period,
      overall: {
        totalInstances: instances.length,
        escalatedInstances: escalatedInstanceIds.size,
        escalationRate: instances.length > 0 ? (escalatedInstanceIds.size / instances.length) * 100 : 0,
        totalEscalations: events.length,
        avgEscalationsPerInstance:
          escalatedInstanceIds.size > 0 ? events.length / escalatedInstanceIds.size : 0,
      },
      byReason,
      byAction,
      byLevel,
      byWorkflow,
      trends,
    };
  }

  /**
   * Generate approver workload report
   */
  async generateApproverWorkloadReport(options: ReportOptions): Promise<ApproverWorkloadReport> {
    const { period, tenantId } = options;

    // Get action events to analyze approver activity
    const events = await this.auditRepository.getEvents(tenantId, {
      startDate: period.startDate,
      endDate: period.endDate,
      eventTypes: [
        "action.approve",
        "action.reject",
        "action.request_changes",
        "action.delegate",
        "step.activated",
      ],
    });

    // Build per-approver stats
    const approverStats = new Map<
      string,
      {
        displayName?: string;
        departmentId?: string;
        assigned: number;
        completed: number;
        pending: number;
        delegated: number;
        escalated: number;
        approved: number;
        rejected: number;
        requestedChanges: number;
        responseTimes: number[];
        slaMet: number;
        slaBreached: number;
      }
    >();

    // Process step.activated to count assignments
    const activationsByStep = new Map<string, { timestamp: Date; approvers: Set<string> }>();
    for (const event of events) {
      if (event.eventType === "step.activated" && event.stepInstanceId) {
        activationsByStep.set(event.stepInstanceId, {
          timestamp: event.timestamp,
          approvers: new Set((event.details?.approverIds as string[]) || []),
        });
        // Initialize approvers
        const approverIds = (event.details?.approverIds as string[]) || [];
        for (const userId of approverIds) {
          if (!approverStats.has(userId)) {
            approverStats.set(userId, {
              assigned: 0,
              completed: 0,
              pending: 0,
              delegated: 0,
              escalated: 0,
              approved: 0,
              rejected: 0,
              requestedChanges: 0,
              responseTimes: [],
              slaMet: 0,
              slaBreached: 0,
            });
          }
          approverStats.get(userId)!.assigned++;
        }
      }
    }

    // Process action events
    for (const event of events) {
      if (!event.eventType.startsWith("action.")) continue;

      const userId = event.actor.userId;
      if (!approverStats.has(userId)) {
        approverStats.set(userId, {
          displayName: event.actor.displayName,
          departmentId: event.actor.departmentId,
          assigned: 0,
          completed: 0,
          pending: 0,
          delegated: 0,
          escalated: 0,
          approved: 0,
          rejected: 0,
          requestedChanges: 0,
          responseTimes: [],
          slaMet: 0,
          slaBreached: 0,
        });
      }

      const stats = approverStats.get(userId)!;
      stats.displayName = stats.displayName || event.actor.displayName;
      stats.departmentId = stats.departmentId || event.actor.departmentId;
      stats.completed++;

      // Calculate response time if we have activation info
      if (event.stepInstanceId && activationsByStep.has(event.stepInstanceId)) {
        const activation = activationsByStep.get(event.stepInstanceId)!;
        stats.responseTimes.push(event.timestamp.getTime() - activation.timestamp.getTime());
      }

      // Track action types
      switch (event.eventType) {
        case "action.approve":
          stats.approved++;
          break;
        case "action.reject":
          stats.rejected++;
          break;
        case "action.request_changes":
          stats.requestedChanges++;
          break;
        case "action.delegate":
          stats.delegated++;
          break;
      }

      // Check SLA compliance
      const slaBreach = event.details?.slaBreach as boolean;
      if (slaBreach) {
        stats.slaBreached++;
      } else {
        stats.slaMet++;
      }
    }

    // Build approvers array
    const approvers = Array.from(approverStats.entries()).map(([userId, stats]) => ({
      userId,
      displayName: stats.displayName,
      departmentId: stats.departmentId,
      totalAssigned: stats.assigned,
      completed: stats.completed,
      pending: stats.assigned - stats.completed,
      delegated: stats.delegated,
      escalated: stats.escalated,
      avgResponseTimeMs:
        stats.responseTimes.length > 0
          ? stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length
          : 0,
      minResponseTimeMs: stats.responseTimes.length > 0 ? Math.min(...stats.responseTimes) : 0,
      maxResponseTimeMs: stats.responseTimes.length > 0 ? Math.max(...stats.responseTimes) : 0,
      approved: stats.approved,
      rejected: stats.rejected,
      requestedChanges: stats.requestedChanges,
      slaMet: stats.slaMet,
      slaBreached: stats.slaBreached,
      slaComplianceRate:
        stats.slaMet + stats.slaBreached > 0
          ? (stats.slaMet / (stats.slaMet + stats.slaBreached)) * 100
          : 100,
    }));

    // Calculate overall stats
    const totalApprovers = approvers.length;
    const totalTasks = approvers.reduce((sum, a) => sum + a.totalAssigned, 0);
    const completedTasks = approvers.reduce((sum, a) => sum + a.completed, 0);
    const pendingTasks = approvers.reduce((sum, a) => sum + a.pending, 0);
    const allResponseTimes = approvers.flatMap((a) =>
      a.avgResponseTimeMs > 0 ? [a.avgResponseTimeMs] : []
    );
    const avgResponseTimeMs =
      allResponseTimes.length > 0
        ? allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length
        : 0;

    // Workload distribution
    const taskCounts = approvers.map((a) => a.totalAssigned);
    const buckets = [
      { label: "0-5", max: 5 },
      { label: "6-10", max: 10 },
      { label: "11-20", max: 20 },
      { label: "21-50", max: 50 },
      { label: "50+", max: Infinity },
    ];

    const distribution = buckets.map((bucket, idx) => {
      const min = idx > 0 ? buckets[idx - 1].max : 0;
      const count = taskCounts.filter((t) => t > min && t <= bucket.max).length;
      return {
        bucket: bucket.label,
        approverCount: count,
        percentage: totalApprovers > 0 ? (count / totalApprovers) * 100 : 0,
      };
    });

    // By department
    const byDeptMap = new Map<
      string,
      { count: number; tasks: number; responseTimes: number[] }
    >();
    for (const approver of approvers) {
      const dept = approver.departmentId || "Unknown";
      if (!byDeptMap.has(dept)) {
        byDeptMap.set(dept, { count: 0, tasks: 0, responseTimes: [] });
      }
      const entry = byDeptMap.get(dept)!;
      entry.count++;
      entry.tasks += approver.totalAssigned;
      if (approver.avgResponseTimeMs > 0) {
        entry.responseTimes.push(approver.avgResponseTimeMs);
      }
    }

    const byDepartment = Array.from(byDeptMap.entries()).map(([deptId, data]) => ({
      departmentId: deptId,
      approverCount: data.count,
      totalTasks: data.tasks,
      avgTasksPerApprover: data.count > 0 ? data.tasks / data.count : 0,
      avgResponseTimeMs:
        data.responseTimes.length > 0
          ? data.responseTimes.reduce((a, b) => a + b, 0) / data.responseTimes.length
          : 0,
    }));

    return {
      period,
      overall: {
        totalApprovers,
        totalTasks,
        completedTasks,
        pendingTasks,
        avgTasksPerApprover: totalApprovers > 0 ? totalTasks / totalApprovers : 0,
        avgResponseTimeMs,
      },
      approvers,
      distribution,
      byDepartment,
    };
  }

  /**
   * Generate compliance summary
   */
  async generateComplianceSummary(options: ReportOptions): Promise<ComplianceSummaryReport> {
    // Generate component reports
    const [cycleDuration, slaBreaches, escalations, workload] = await Promise.all([
      this.generateCycleDurationReport(options),
      this.generateSlaBreachReport(options),
      this.generateEscalationReport(options),
      this.generateApproverWorkloadReport(options),
    ]);

    // Calculate compliance score (0-100)
    // Weights: SLA compliance (40%), Cycle time (30%), Escalation rate (20%), Automation (10%)
    const slaComplianceRate = 100 - slaBreaches.overall.breachRate;
    const escalationRate = escalations.overall.escalationRate;

    // Normalize cycle time (assume target is 24 hours = 86400000 ms)
    const targetCycleTime = 86400000;
    const cycleTimeScore = Math.max(
      0,
      100 - (cycleDuration.overall.avgDurationMs / targetCycleTime) * 50
    );

    // Get auto-approval rate
    const autoApprovalEvents = await this.auditRepository.getEvents(options.tenantId, {
      startDate: options.period.startDate,
      endDate: options.period.endDate,
      eventTypes: ["step.auto_approved"],
    });
    const automationRate =
      cycleDuration.overall.completedInstances > 0
        ? (autoApprovalEvents.length / cycleDuration.overall.completedInstances) * 100
        : 0;

    const complianceScore =
      slaComplianceRate * 0.4 +
      cycleTimeScore * 0.3 +
      (100 - escalationRate) * 0.2 +
      Math.min(automationRate, 100) * 0.1;

    // Identify risk indicators
    const riskIndicators: ComplianceSummaryReport["riskIndicators"] = [];

    if (slaBreaches.overall.breachRate > 20) {
      riskIndicators.push({
        indicator: "High SLA Breach Rate",
        level: slaBreaches.overall.breachRate > 40 ? "critical" : "high",
        description: `${slaBreaches.overall.breachRate.toFixed(1)}% of instances breached SLA`,
        affectedInstances: slaBreaches.overall.breachedInstances,
      });
    }

    if (escalations.overall.escalationRate > 30) {
      riskIndicators.push({
        indicator: "High Escalation Rate",
        level: escalations.overall.escalationRate > 50 ? "high" : "medium",
        description: `${escalations.overall.escalationRate.toFixed(1)}% of instances required escalation`,
        affectedInstances: escalations.overall.escalatedInstances,
      });
    }

    if (workload.overall.pendingTasks > workload.overall.completedTasks * 0.5) {
      riskIndicators.push({
        indicator: "High Pending Workload",
        level: "medium",
        description: `${workload.overall.pendingTasks} tasks pending vs ${workload.overall.completedTasks} completed`,
        affectedInstances: workload.overall.pendingTasks,
      });
    }

    // Generate recommendations
    const recommendations: ComplianceSummaryReport["recommendations"] = [];

    if (slaBreaches.overall.breachRate > 10) {
      recommendations.push({
        priority: slaBreaches.overall.breachRate > 30 ? "high" : "medium",
        category: "SLA Management",
        recommendation: "Review SLA thresholds and escalation rules for frequently breached workflows",
        potentialImpact: "Could reduce breach rate by 20-40%",
      });
    }

    if (cycleDuration.overall.avgDurationMs > targetCycleTime * 2) {
      recommendations.push({
        priority: "high",
        category: "Process Optimization",
        recommendation: "Analyze bottleneck steps and consider auto-approval conditions",
        potentialImpact: "Could reduce average cycle time by 30-50%",
      });
    }

    if (escalations.overall.escalationRate > 20) {
      recommendations.push({
        priority: "medium",
        category: "Approver Management",
        recommendation: "Review approver availability and consider adding backup approvers",
        potentialImpact: "Could reduce escalations by 25-35%",
      });
    }

    return {
      period: options.period,
      complianceScore: Math.round(complianceScore * 10) / 10,
      metrics: {
        slaComplianceRate: Math.round(slaComplianceRate * 10) / 10,
        avgCycleDurationMs: cycleDuration.overall.avgDurationMs,
        escalationRate: Math.round(escalationRate * 10) / 10,
        firstTimeApprovalRate: 100 - escalationRate, // Simplified
        automationRate: Math.round(automationRate * 10) / 10,
      },
      byCategory: [
        {
          category: "SLA Compliance",
          score: slaComplianceRate,
          issues: slaBreaches.overall.totalBreaches,
          recommendations: slaBreaches.overall.breachRate > 10 ? ["Review SLA thresholds"] : [],
        },
        {
          category: "Process Efficiency",
          score: cycleTimeScore,
          issues: cycleDuration.overall.avgDurationMs > targetCycleTime ? 1 : 0,
          recommendations:
            cycleDuration.overall.avgDurationMs > targetCycleTime
              ? ["Optimize bottleneck steps"]
              : [],
        },
        {
          category: "Escalation Management",
          score: 100 - escalationRate,
          issues: escalations.overall.totalEscalations,
          recommendations: escalationRate > 20 ? ["Improve approver response times"] : [],
        },
      ],
      riskIndicators,
      recommendations,
    };
  }

  /**
   * Schedule recurring report
   */
  async scheduleReport(
    tenantId: string,
    reportType: string,
    schedule: string,
    options: ReportOptions,
    recipients: string[]
  ): Promise<string> {
    const scheduleId = `sched_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    this.scheduledReports.set(scheduleId, { schedule, options, recipients });
    // In real implementation, would register with a scheduler service
    return scheduleId;
  }

  /**
   * Cancel scheduled report
   */
  async cancelScheduledReport(tenantId: string, scheduleId: string): Promise<void> {
    this.scheduledReports.delete(scheduleId);
    // In real implementation, would unregister from scheduler service
  }
}

/**
 * Factory function to create compliance reporting service
 */
export function createComplianceReportingService(
  auditRepository: IAuditRepository,
  instanceRepository: IApprovalInstanceRepository
): IComplianceReportingService {
  return new ComplianceReportingService(auditRepository, instanceRepository);
}
