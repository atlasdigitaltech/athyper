// lib/finance/governance-answer-builder.ts
//
// Phase 21: Deterministic answer builder for the Governance Copilot.
// Pure functions that compose Phase 20 knowledge graph data into
// structured answers. No LLM — template-based, explainable, auditable.

import type {
  CopilotAnswerSection,
  CopilotAction,
  CopilotEvidence,
  CopilotDrillTarget,
  CopilotRoleDTO,
} from "./types";

import type {
  ControlMemoryDTO,
  GovernancePathwayDTO,
  PathwayDataDTO,
  ProposalProvenanceDTO,
  KnowledgeSummaryDTO,
} from "./use-governance-knowledge";

// ---------------------------------------------------------------------------
// Governance question types
// ---------------------------------------------------------------------------

export type GovernanceQuestionType =
  | "GOVERNANCE_OVERVIEW"
  | "ISSUE_EXPLAIN"
  | "PROPOSAL_EXPLAIN"
  | "PATHWAY_ANALYSIS"
  | "NEXT_ACTIONS"
  | "OBJECT_BRIEFING";

// ---------------------------------------------------------------------------
// Drill target mapping — governance objects to knowledge panel
// ---------------------------------------------------------------------------

function govDrill(
  tab: string,
  opts?: { subTab?: string; focusId?: string },
): CopilotDrillTarget {
  return {
    tab: "governance",
    subTab: tab,
    focusId: opts?.focusId,
    ...(opts?.subTab ? { subTab: opts.subTab } : {}),
  };
}

// ---------------------------------------------------------------------------
// Context — aggregated from Phase 20 hooks
// ---------------------------------------------------------------------------

export interface GovernanceContext {
  entityCode: string;
  role: CopilotRoleDTO;
  // Data from Phase 20 views (all optional)
  memory?: ControlMemoryDTO[] | null;
  pathways?: PathwayDataDTO | null;
  provenance?: ProposalProvenanceDTO[] | null;
  summary?: KnowledgeSummaryDTO | null;
  // Optional focus object for OBJECT_BRIEFING / ISSUE_EXPLAIN
  focusObjectKind?: string;
  focusObjectKey?: string;
}

export interface GovernanceAnswer {
  text: string;
  sections: CopilotAnswerSection[];
  actions: CopilotAction[];
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function buildGovernanceAnswer(
  questionType: GovernanceQuestionType,
  ctx: GovernanceContext,
): GovernanceAnswer {
  switch (questionType) {
    case "GOVERNANCE_OVERVIEW":
      return buildOverviewAnswer(ctx);
    case "ISSUE_EXPLAIN":
      return buildIssueExplainAnswer(ctx);
    case "PROPOSAL_EXPLAIN":
      return buildProposalExplainAnswer(ctx);
    case "PATHWAY_ANALYSIS":
      return buildPathwayAnalysisAnswer(ctx);
    case "NEXT_ACTIONS":
      return buildNextActionsAnswer(ctx);
    case "OBJECT_BRIEFING":
      return buildObjectBriefingAnswer(ctx);
    default:
      return { text: "Unknown question type.", sections: [], actions: [] };
  }
}

// ---------------------------------------------------------------------------
// GOVERNANCE_OVERVIEW — "What's the governance health?"
// ---------------------------------------------------------------------------

function buildOverviewAnswer(ctx: GovernanceContext): GovernanceAnswer {
  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];
  const s = ctx.summary;

  if (!s) {
    return { text: `No governance data available for ${ctx.entityCode}.`, sections: [], actions: [] };
  }

  // Summary text
  const totalPathways = s.pathways.stages.reduce((sum, p) => sum + p.count, 0);
  const fullPathways = s.pathways.stages.find((p) => p.stage === "full_pathway");
  const issueOnly = s.pathways.stages.find((p) => p.stage === "issue_only");
  const successCount = fullPathways?.successful ?? 0;
  const successRate = fullPathways && fullPathways.count > 0
    ? Math.round((successCount / fullPathways.count) * 100) : 0;

  let text = `${ctx.entityCode} has ${s.graph.totalEdges} governance relationships across ${s.graph.uniqueNodeKinds} object types. `;
  text += `${totalPathways} governance pathways tracked`;
  if (fullPathways) text += ` — ${fullPathways.count} complete with ${successRate}% success rate`;
  text += ".";

  // Graph section
  const graphEvidence: CopilotEvidence[] = s.graph.topEdgeTypes.slice(0, 5).map((e) => ({
    source: "governance_graph",
    label: `${e.sourceKind} → ${e.targetKind}`,
    value: `${e.count} edges (${e.edgeType})`,
    drillTarget: govDrill("graph"),
  }));

  sections.push({
    heading: "Relationship Graph",
    content: `${s.graph.totalEdges} edges across ${s.graph.uniqueEdgeTypes} relationship types connecting ${s.graph.uniqueNodeKinds} governance object kinds.`,
    evidence: graphEvidence,
    severity: "info",
    drillTarget: govDrill("graph"),
  });

  // Memory section
  const memoryEvidence: CopilotEvidence[] = s.memory.objects.map((o) => ({
    source: "control_memory",
    label: o.objectKind.replace(/_/g, " "),
    value: `${o.count} objects, ${o.resolvedCount} resolved, ${o.withPrograms} with programs`,
    drillTarget: govDrill("memory"),
  }));

  const totalMemory = s.memory.objects.reduce((sum, o) => sum + o.count, 0);
  const unresolved = s.memory.objects.reduce((sum, o) => sum + o.count - o.resolvedCount, 0);

  sections.push({
    heading: "Control Memory",
    content: `${totalMemory} tracked governance objects. ${unresolved} remain unresolved.`,
    evidence: memoryEvidence,
    severity: unresolved > 5 ? "high" : unresolved > 0 ? "medium" : "info",
    drillTarget: govDrill("memory"),
  });

  // Pathway section
  const pathwayEvidence: CopilotEvidence[] = s.pathways.stages.map((p) => ({
    source: "governance_pathway",
    label: p.stage.replace(/_/g, " "),
    value: `${p.count} pathways, ${p.successful} successful`,
    drillTarget: govDrill("pathways"),
  }));

  sections.push({
    heading: "Governance Pathways",
    content: `${totalPathways} pathways from issue to outcome. ${issueOnly?.count ?? 0} issues have no recommendation yet.`,
    evidence: pathwayEvidence,
    severity: (issueOnly?.count ?? 0) > 3 ? "high" : "info",
    drillTarget: govDrill("pathways"),
  });

  // Actions
  if ((issueOnly?.count ?? 0) > 0) {
    actions.push({
      priority: 1,
      title: `Review ${issueOnly!.count} unaddressed issues`,
      rationale: `${issueOnly!.count} issue(s) have no recommendation or program. Creating recommendations or programs will advance them through the governance pathway.`,
      ownerRole: ctx.role,
      drillTarget: govDrill("pathways"),
    });
  }

  return { text, sections, actions };
}

// ---------------------------------------------------------------------------
// ISSUE_EXPLAIN — "What caused this chronic issue to recur?"
// ---------------------------------------------------------------------------

function buildIssueExplainAnswer(ctx: GovernanceContext): GovernanceAnswer {
  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];

  const memory = ctx.memory ?? [];
  const objectKey = ctx.focusObjectKey;

  // Find the specific object or show all unresolved
  const target = objectKey
    ? memory.find((m) => m.objectKey === objectKey)
    : null;

  if (target) {
    const text = `"${target.objectLabel}" has occurred ${target.occurrenceCount} time(s). `
      + `${target.programsCreated} program(s) created, ${target.programsCompleted} completed. `
      + (target.everResolved ? "Previously resolved." : "Not yet resolved.");

    sections.push({
      heading: "History",
      content: `Seen ${target.occurrenceCount} time(s) across periods. ${target.programsCreated > 0 ? `${target.programsCreated} program(s) attempted.` : "No programs created yet."}`,
      evidence: [
        { source: "control_memory", label: "Occurrences", value: String(target.occurrenceCount), drillTarget: govDrill("memory") },
        { source: "control_memory", label: "Programs Created", value: String(target.programsCreated), drillTarget: govDrill("memory") },
        { source: "control_memory", label: "Programs Completed", value: String(target.programsCompleted), drillTarget: govDrill("memory") },
      ],
      severity: target.occurrenceCount >= 4 ? "critical" : target.occurrenceCount >= 3 ? "high" : "medium",
    });

    // Check memory data for additional context
    const md = target.memoryData;
    if (md) {
      const extraEvidence: CopilotEvidence[] = [];
      if (md.acceptanceRate) extraEvidence.push({ source: "effectiveness", label: "Acceptance Rate", value: `${md.acceptanceRate}%` });
      if (md.effectivenessRate) extraEvidence.push({ source: "effectiveness", label: "Effectiveness Rate", value: `${md.effectivenessRate}%` });
      if (md.redPeriodCount) extraEvidence.push({ source: "benchmark", label: "Red Periods", value: String(md.redPeriodCount) });
      if (md.avgActual) extraEvidence.push({ source: "benchmark", label: "Avg Actual", value: String(md.avgActual) });

      if (extraEvidence.length > 0) {
        sections.push({
          heading: "Detailed Memory",
          content: "Historical metrics and effectiveness data for this governance object.",
          evidence: extraEvidence,
          severity: "info",
        });
      }
    }

    // Related pathways
    const relatedPathways = (ctx.pathways?.pathways ?? []).filter(
      (p) => p.issueKey === objectKey,
    );
    if (relatedPathways.length > 0) {
      sections.push({
        heading: "Related Pathways",
        content: `${relatedPathways.length} pathway(s) involve this issue.`,
        evidence: relatedPathways.map((p) => ({
          source: "governance_pathway",
          label: p.pathwayStage.replace(/_/g, " "),
          value: p.programCode ? `Program: ${p.programCode}` : (p.recommendationType ?? "No action yet"),
          drillTarget: govDrill("pathways"),
        })),
        severity: "info",
        drillTarget: govDrill("pathways"),
      });
    }

    if (!target.everResolved && target.programsCreated === 0) {
      actions.push({
        priority: 1,
        title: "Create a program to address this issue",
        rationale: `This issue has recurred ${target.occurrenceCount} times with no program addressing it. Consider accepting a proposal or creating a program manually.`,
        ownerRole: ctx.role,
        drillTarget: govDrill("pathways"),
      });
    }

    return { text, sections, actions };
  }

  // No specific focus — show top unresolved
  const unresolved = memory.filter((m) => !m.everResolved).sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  if (unresolved.length === 0) {
    return { text: "All tracked governance issues are resolved.", sections: [], actions: [] };
  }

  const text = `${unresolved.length} unresolved governance issue(s). Top recurring: "${unresolved[0].objectLabel}" (${unresolved[0].occurrenceCount}x).`;

  sections.push({
    heading: "Unresolved Issues",
    content: `${unresolved.length} issues remain open across all object types.`,
    evidence: unresolved.slice(0, 8).map((m) => ({
      source: "control_memory",
      label: m.objectLabel,
      value: `${m.occurrenceCount}x, ${m.programsCreated} program(s)`,
      severity: m.occurrenceCount >= 4 ? "critical" : m.occurrenceCount >= 3 ? "high" : "medium",
      drillTarget: govDrill("memory"),
    })),
    severity: unresolved[0].occurrenceCount >= 4 ? "critical" : "high",
    drillTarget: govDrill("memory"),
  });

  actions.push({
    priority: 1,
    title: `Address top recurring issue: "${unresolved[0].objectLabel}"`,
    rationale: `Has occurred ${unresolved[0].occurrenceCount} times with ${unresolved[0].programsCreated === 0 ? "no" : unresolved[0].programsCreated} program(s). This is the highest-recurrence unresolved issue.`,
    ownerRole: ctx.role,
    drillTarget: govDrill("memory"),
  });

  return { text, sections, actions };
}

// ---------------------------------------------------------------------------
// PROPOSAL_EXPLAIN — "Why is this proposal high confidence?"
// ---------------------------------------------------------------------------

function buildProposalExplainAnswer(ctx: GovernanceContext): GovernanceAnswer {
  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];
  const provenance = ctx.provenance ?? [];

  if (provenance.length === 0) {
    return { text: "No proposals with provenance data available.", sections: [], actions: [] };
  }

  const focused = ctx.focusObjectKey
    ? provenance.find((p) => p.fingerprint === ctx.focusObjectKey || p.gapKey === ctx.focusObjectKey)
    : null;

  const items = focused ? [focused] : provenance.slice(0, 5);

  const text = focused
    ? `Proposal "${focused.suggestedTitle}" has ${focused.confidenceLevel.replace(/_/g, " ")} confidence.`
    : `${provenance.length} proposal(s) with provenance. ${provenance.filter((p) => p.confidenceLevel === "high_confidence").length} high confidence.`;

  for (const p of items) {
    const evidence: CopilotEvidence[] = [];

    // Source evidence
    evidence.push({
      source: "proposal_source",
      label: "Source",
      value: p.proposalSource.replace(/_/g, " "),
    });

    // Gap memory
    if (p.gapOccurrenceCount > 0) {
      evidence.push({
        source: "control_memory",
        label: "Gap Occurrences",
        value: `${p.gapOccurrenceCount}x seen`,
        severity: p.gapOccurrenceCount >= 4 ? "critical" : p.gapOccurrenceCount >= 3 ? "high" : "medium",
      });
    }

    // Similar programs
    if (p.similarProgramCount > 0) {
      evidence.push({
        source: "similar_programs",
        label: "Similar Programs",
        value: `${p.similarProgramCount} programs, ${p.similarSuccessRate}% success rate`,
        severity: parseFloat(p.similarSuccessRate ?? "0") >= 75 ? "info" : "medium",
      });
    }

    // Prior proposal history
    if (p.timesPreviouslyProposed > 0) {
      evidence.push({
        source: "proposal_history",
        label: "Previously Proposed",
        value: `${p.timesPreviouslyProposed}x (${p.timesPreviouslyAccepted} accepted, ${p.timesPreviouslyDismissed} dismissed)`,
        severity: p.timesPreviouslyDismissed > p.timesPreviouslyAccepted ? "high" : "info",
      });
      if (p.lastDismissReason) {
        evidence.push({
          source: "proposal_history",
          label: "Last Dismiss Reason",
          value: p.lastDismissReason,
        });
      }
    }

    // Ever resolved
    evidence.push({
      source: "control_memory",
      label: "Gap Resolved Before",
      value: p.gapEverResolved ? "Yes" : "No",
    });

    sections.push({
      heading: p.suggestedTitle,
      content: p.rationale,
      evidence,
      severity: p.confidenceLevel === "high_confidence" ? "info"
        : p.confidenceLevel === "previously_rejected" ? "high"
        : "medium",
    });

    // Confidence explanation
    const confExplanation = explainConfidence(p);
    if (confExplanation) {
      sections.push({
        heading: `Confidence: ${p.confidenceLevel.replace(/_/g, " ")}`,
        content: confExplanation,
        evidence: [],
        severity: "info",
      });
    }
  }

  if (provenance.some((p) => p.confidenceLevel === "high_confidence")) {
    const highConf = provenance.filter((p) => p.confidenceLevel === "high_confidence");
    actions.push({
      priority: 1,
      title: `Accept ${highConf.length} high-confidence proposal(s)`,
      rationale: "These proposals have strong historical backing with proven success rates and no prior rejections.",
      ownerRole: ctx.role,
      drillTarget: govDrill("pathways"),
    });
  }

  return { text, sections, actions };
}

function explainConfidence(p: ProposalProvenanceDTO): string | null {
  switch (p.confidenceLevel) {
    case "high_confidence":
      return `Similar programs have a ${p.similarSuccessRate}% success rate and this proposal has never been rejected. Strong historical evidence supports creating this program.`;
    case "moderate_confidence":
      return `Similar programs have a ${p.similarSuccessRate}% success rate. Reasonable historical backing, though not as strong as high-confidence proposals.`;
    case "previously_rejected":
      return `This proposal was previously dismissed ${p.timesPreviouslyDismissed} time(s). ${p.lastDismissReason ? `Last reason: "${p.lastDismissReason}".` : ""} Consider whether circumstances have changed.`;
    case "no_precedent":
      return "No similar historical programs found. This would be the first program addressing this type of gap. Outcome is uncertain.";
    case "low_confidence":
      return "Historical programs addressing similar gaps have had limited success. Proceed with caution and define clear milestones.";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// PATHWAY_ANALYSIS — "What are the strongest remediation patterns?"
// ---------------------------------------------------------------------------

function buildPathwayAnalysisAnswer(ctx: GovernanceContext): GovernanceAnswer {
  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];
  const data = ctx.pathways;

  if (!data || data.pathways.length === 0) {
    return { text: "No governance pathways available for analysis.", sections: [], actions: [] };
  }

  const stats = data.stats;
  const successRate = stats.successRate;
  const full = data.pathways.filter((p) => p.pathwayStage === "full_pathway");
  const successful = full.filter((p) => p.pathwaySuccessful);
  const failed = full.filter((p) => !p.pathwaySuccessful);
  const issueOnly = data.pathways.filter((p) => p.pathwayStage === "issue_only");
  const inProgress = data.pathways.filter((p) => p.pathwayStage === "program_in_progress");

  const text = `${data.pathways.length} governance pathways. `
    + `${full.length} complete (${successRate}% success rate). `
    + `${inProgress.length} in progress. ${issueOnly.length} unaddressed.`;

  // Successful patterns
  if (successful.length > 0) {
    const programTypes = new Map<string, number>();
    for (const p of successful) {
      const t = p.programType ?? "unknown";
      programTypes.set(t, (programTypes.get(t) ?? 0) + 1);
    }

    sections.push({
      heading: "Successful Patterns",
      content: `${successful.length} pathway(s) led to measurable improvement.`,
      evidence: successful.slice(0, 5).map((p) => ({
        source: "governance_pathway",
        label: p.issueLabel,
        value: `${p.programCode}: ${p.outcomeDirection?.replace(/_/g, " ") ?? "completed"}`,
        severity: "info" as const,
        drillTarget: govDrill("pathways", { focusId: p.programId ?? undefined }),
      })),
      severity: "info",
    });

    // Best program types
    const sorted = [...programTypes.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      sections.push({
        heading: "Most Effective Program Types",
        content: sorted.map(([t, c]) => `${t}: ${c} successful`).join(", "),
        evidence: sorted.map(([t, c]) => ({
          source: "program_type",
          label: t,
          value: `${c} successful pathway(s)`,
        })),
        severity: "info",
      });
    }
  }

  // Failed patterns
  if (failed.length > 0) {
    sections.push({
      heading: "Unsuccessful Attempts",
      content: `${failed.length} pathway(s) completed without improvement.`,
      evidence: failed.slice(0, 3).map((p) => ({
        source: "governance_pathway",
        label: p.issueLabel,
        value: `${p.programCode}: ${p.outcomeDirection?.replace(/_/g, " ") ?? "no change"}`,
        severity: "high" as const,
        drillTarget: govDrill("pathways", { focusId: p.programId ?? undefined }),
      })),
      severity: "high",
    });
  }

  // Gaps
  if (issueOnly.length > 0) {
    sections.push({
      heading: "Unaddressed Issues",
      content: `${issueOnly.length} issue(s) have no recommendation or program.`,
      evidence: issueOnly.slice(0, 5).map((p) => ({
        source: "governance_pathway",
        label: p.issueLabel,
        value: `${p.issueSeverityCount}x severity`,
        severity: p.issueSeverityCount >= 4 ? "critical" as const : "high" as const,
      })),
      severity: "high",
      drillTarget: govDrill("pathways"),
    });

    actions.push({
      priority: 1,
      title: `Create recommendations for ${issueOnly.length} unaddressed issue(s)`,
      rationale: "These issues have no pathway progression. Starting with a recommendation is the first step toward resolution.",
      ownerRole: ctx.role,
    });
  }

  if (inProgress.length > 0) {
    actions.push({
      priority: 2,
      title: `Monitor ${inProgress.length} in-progress program(s)`,
      rationale: "Active programs are working through milestones. Check health and milestone completion.",
      ownerRole: ctx.role,
      drillTarget: govDrill("pathways"),
    });
  }

  return { text, sections, actions };
}

// ---------------------------------------------------------------------------
// NEXT_ACTIONS — "What should I do next for governance?"
// ---------------------------------------------------------------------------

function buildNextActionsAnswer(ctx: GovernanceContext): GovernanceAnswer {
  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];
  let priority = 0;

  const memory = ctx.memory ?? [];
  const provenance = ctx.provenance ?? [];
  const pathways = ctx.pathways?.pathways ?? [];

  // 1. High-confidence proposals ready to accept
  const highConf = provenance.filter((p) => p.confidenceLevel === "high_confidence");
  if (highConf.length > 0) {
    sections.push({
      heading: "Ready to Accept",
      content: `${highConf.length} proposal(s) have high confidence based on historical success.`,
      evidence: highConf.map((p) => ({
        source: "proposal_provenance",
        label: p.suggestedTitle,
        value: `${p.similarSuccessRate}% similar success rate`,
        severity: "info" as const,
      })),
      severity: "info",
    });

    actions.push({
      priority: ++priority,
      title: `Accept ${highConf.length} high-confidence proposal(s)`,
      rationale: "Historical programs addressing similar gaps have strong success rates. These are ready to convert into programs.",
      ownerRole: ctx.role,
    });
  }

  // 2. Critical unresolved recurring issues
  const criticalUnresolved = memory
    .filter((m) => !m.everResolved && m.occurrenceCount >= 4)
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  if (criticalUnresolved.length > 0) {
    sections.push({
      heading: "Critical Recurring Issues",
      content: `${criticalUnresolved.length} issue(s) have recurred 4+ times without resolution.`,
      evidence: criticalUnresolved.slice(0, 3).map((m) => ({
        source: "control_memory",
        label: m.objectLabel,
        value: `${m.occurrenceCount}x, ${m.programsCreated} program(s)`,
        severity: "critical" as const,
        drillTarget: govDrill("memory"),
      })),
      severity: "critical",
    });

    actions.push({
      priority: ++priority,
      title: `Escalate ${criticalUnresolved.length} critical recurring issue(s)`,
      rationale: "These issues have persisted across 4+ periods. Current approach may need fundamental change.",
      ownerRole: "CFO",
    });
  }

  // 3. Previously rejected proposals that may warrant reconsideration
  const rejected = provenance.filter((p) => p.confidenceLevel === "previously_rejected");
  if (rejected.length > 0) {
    sections.push({
      heading: "Previously Rejected — Reconsider?",
      content: `${rejected.length} proposal(s) were previously dismissed but the underlying issue persists.`,
      evidence: rejected.map((p) => ({
        source: "proposal_history",
        label: p.suggestedTitle,
        value: `Dismissed ${p.timesPreviouslyDismissed}x. ${p.lastDismissReason ?? "No reason given."}`,
        severity: "medium" as const,
      })),
      severity: "medium",
    });

    actions.push({
      priority: ++priority,
      title: `Reconsider ${rejected.length} previously rejected proposal(s)`,
      rationale: "These proposals were rejected before but the issues remain. Circumstances may have changed.",
      ownerRole: ctx.role,
    });
  }

  // 4. Stalled pathways (recommendation but no program)
  const recOnly = pathways.filter((p) => p.pathwayStage === "recommendation_only");
  if (recOnly.length > 0) {
    sections.push({
      heading: "Stalled at Recommendation Stage",
      content: `${recOnly.length} issue(s) have recommendations but no program has been created.`,
      evidence: recOnly.slice(0, 3).map((p) => ({
        source: "governance_pathway",
        label: p.issueLabel,
        value: p.recommendationType ?? "pending",
        severity: "medium" as const,
      })),
      severity: "medium",
    });

    actions.push({
      priority: ++priority,
      title: `Convert ${recOnly.length} recommendation(s) into programs`,
      rationale: "Recommendations without programs don't improve metrics. Convert them to track progress.",
      ownerRole: ctx.role,
      drillTarget: govDrill("pathways"),
    });
  }

  if (actions.length === 0) {
    return {
      text: "No urgent governance actions needed. All issues are either resolved or actively being addressed.",
      sections: [],
      actions: [],
    };
  }

  const text = `${actions.length} governance action(s) recommended. Top priority: ${actions[0].title}.`;

  return { text, sections, actions };
}

// ---------------------------------------------------------------------------
// OBJECT_BRIEFING — briefing for a specific object
// ---------------------------------------------------------------------------

function buildObjectBriefingAnswer(ctx: GovernanceContext): GovernanceAnswer {
  const memory = ctx.memory ?? [];
  const objectKey = ctx.focusObjectKey;
  const objectKind = ctx.focusObjectKind;

  if (!objectKey) {
    // General briefing — pick most critical objects
    return buildNextActionsAnswer(ctx);
  }

  const target = memory.find(
    (m) => m.objectKey === objectKey && (!objectKind || m.objectKind === objectKind),
  );

  if (!target) {
    return { text: `No governance data found for "${objectKey}".`, sections: [], actions: [] };
  }

  const sections: CopilotAnswerSection[] = [];
  const actions: CopilotAction[] = [];

  // Current state
  sections.push({
    heading: "Current State",
    content: `${target.objectLabel} (${target.objectKind.replace(/_/g, " ")})`,
    evidence: [
      { source: "control_memory", label: "Status", value: target.everResolved ? "Resolved" : "Open" },
      { source: "control_memory", label: "Occurrences", value: String(target.occurrenceCount) },
      { source: "control_memory", label: "Programs Created", value: String(target.programsCreated) },
      { source: "control_memory", label: "Programs Completed", value: String(target.programsCompleted) },
    ],
    severity: target.everResolved ? "info" : target.occurrenceCount >= 3 ? "high" : "medium",
  });

  // Linked pathways
  const relatedPathways = (ctx.pathways?.pathways ?? []).filter(
    (p) => p.issueKey === objectKey,
  );
  if (relatedPathways.length > 0) {
    sections.push({
      heading: "Governance Pathways",
      content: `${relatedPathways.length} pathway(s) reference this object.`,
      evidence: relatedPathways.map((p) => ({
        source: "governance_pathway",
        label: p.pathwayStage.replace(/_/g, " "),
        value: [p.recommendationType, p.programCode, p.outcomeDirection?.replace(/_/g, " ")].filter(Boolean).join(" → "),
        drillTarget: govDrill("pathways"),
      })),
      severity: "info",
    });
  }

  // Linked provenance
  const relatedProvenance = (ctx.provenance ?? []).filter(
    (p) => p.gapKey === objectKey,
  );
  if (relatedProvenance.length > 0) {
    sections.push({
      heading: "Active Proposals",
      content: `${relatedProvenance.length} proposal(s) address this object.`,
      evidence: relatedProvenance.map((p) => ({
        source: "proposal_provenance",
        label: p.suggestedTitle,
        value: `${p.confidenceLevel.replace(/_/g, " ")} confidence`,
      })),
      severity: "info",
    });
  }

  // Recommended action
  if (!target.everResolved) {
    if (relatedProvenance.some((p) => p.confidenceLevel === "high_confidence")) {
      actions.push({
        priority: 1,
        title: "Accept high-confidence proposal for this issue",
        rationale: "A proposal with strong historical backing is available. Accepting it will create a tracked program.",
        ownerRole: ctx.role,
      });
    } else if (target.programsCreated === 0) {
      actions.push({
        priority: 1,
        title: "Create a program to address this issue",
        rationale: `No programs have been created for this ${target.objectKind.replace(/_/g, " ")}. Start with a pilot program.`,
        ownerRole: ctx.role,
      });
    }
  }

  const text = `Briefing for "${target.objectLabel}": ${target.occurrenceCount}x occurrences, ${target.programsCreated} program(s). ${target.everResolved ? "Resolved." : "Open."}`;

  return { text, sections, actions };
}
