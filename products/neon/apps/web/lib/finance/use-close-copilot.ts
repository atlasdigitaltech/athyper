"use client";

// lib/finance/use-close-copilot.ts
//
// Phase 11B: Role-Aware Conversational Close Copilot hook.
// Manages conversation state, dispatches questions to existing data sources,
// and invokes the deterministic answer builder.

import { useState, useCallback, useMemo, useRef } from "react";

import { FinanceHttpError } from "./errors";
import { finGet } from "./fetcher";
import { buildCopilotAnswer } from "./copilot-answer-builder";
import { parseCopilotIntent } from "./copilot-intent-parser";

import type { CopilotContext } from "./copilot-answer-builder";
import type {
  CopilotMessage,
  CopilotParsedIntent,
  CopilotQuestionType,
  CopilotRoleDTO,
  AdvisorEntityHeatmapDTO,
  AdvisorControllerAlertDTO,
  AdvisorDefectQueueItemDTO,
  AdvisorCompletionForecastDTO,
  SlaBreachForecastDTO,
  CloseExecutiveSummaryDTO,
} from "./types";

import type {
  PackDeltaDTO,
  ExecutiveBriefDTO,
} from "./use-pack-readiness";

import type { AtlasDashboardData } from "./use-atlas-dashboard";

// ---------------------------------------------------------------------------
// Predefined Questions
// ---------------------------------------------------------------------------

export interface CopilotQuickQuestion {
  type: CopilotQuestionType;
  label: string;
  description: string;
  icon: string; // lucide icon name
  /** Which data sources to fetch */
  requires: DataSource[];
}

type DataSource =
  | "executive_summary"
  | "heatmap"
  | "alerts"
  | "defect_queue"
  | "completion_forecast"
  | "breach_forecasts"
  | "atlas_dashboard"
  | "pack_delta"
  | "executive_brief";

export const QUICK_QUESTIONS: CopilotQuickQuestion[] = [
  {
    type: "WHY_RED",
    label: "Why are we red?",
    description: "Root cause analysis of risk status with contributing factors",
    icon: "AlertTriangle",
    requires: ["executive_summary", "heatmap", "alerts", "defect_queue", "atlas_dashboard"],
  },
  {
    type: "TODAY_ACTIONS",
    label: "What should I do today?",
    description: "Prioritized action list filtered for your role",
    icon: "ListChecks",
    requires: ["alerts", "defect_queue", "atlas_dashboard", "executive_brief", "completion_forecast"],
  },
  {
    type: "BREACH_RISK",
    label: "Which entity will miss hard close?",
    description: "Entity breach probability ranking with risk factors",
    icon: "TrendingDown",
    requires: ["breach_forecasts"],
  },
  {
    type: "WHAT_CHANGED",
    label: "What changed since yesterday?",
    description: "GL changes, new overrides, task progress, materiality",
    icon: "RefreshCw",
    requires: ["pack_delta"],
  },
  {
    type: "EXECUTIVE_SUMMARY",
    label: "Give me the executive summary",
    description: "Quick status brief with key metrics and attention items",
    icon: "FileText",
    requires: ["executive_summary", "executive_brief"],
  },
  {
    type: "REMEDIATE_GAPS",
    label: "Create campaign for critical gaps",
    description: "Filter critical defects, review matching items, and prepare a remediation campaign",
    icon: "Shield",
    requires: ["defect_queue", "executive_summary", "atlas_dashboard"],
  },
  {
    type: "BATCH_OVERDUE",
    label: "Show overdue defects and prepare batch",
    description: "Find overdue approval defects, group by type, and prepare bulk acceptance",
    icon: "Clock",
    requires: ["defect_queue", "alerts"],
  },
  {
    type: "EXPORT_AND_REVIEW",
    label: "Export cert pack and review exceptions",
    description: "Summarize certification status, list exceptions, and trigger export",
    icon: "Download",
    requires: ["executive_summary", "alerts", "pack_delta", "executive_brief"],
  },
  {
    type: "PROPOSE_CAMPAIGNS",
    label: "Suggest campaigns from defect clusters",
    description: "Analyze defect queue for actionType clusters and propose named campaign drafts",
    icon: "Wand2",
    requires: ["defect_queue", "executive_summary"],
  },
  {
    type: "SIMULATE_CLOSE",
    label: "What if we resolve all blockers?",
    description: "Run scenario simulations to project impact on breach probability and buffer",
    icon: "FlaskConical",
    requires: ["completion_forecast", "executive_summary", "defect_queue"],
  },
  {
    type: "ROOT_CAUSE_ANALYSIS",
    label: "What is causing close risk?",
    description: "Trace from symptoms through contributing factors to root causes with evidence chains",
    icon: "SearchCode",
    requires: ["executive_summary", "completion_forecast"],
  },
  {
    type: "ORCHESTRATE_CLOSE",
    label: "Evaluate automation rules",
    description: "Scan defect queue against governance gates and produce an orchestration plan",
    icon: "Cog",
    requires: ["defect_queue", "completion_forecast", "executive_summary"],
  },
  {
    type: "NARRATIVE_CONTROLLER",
    label: "Generate controller brief",
    description: "Structured close narrative for the controller with risk detail",
    icon: "FileText",
    requires: ["executive_summary", "heatmap", "alerts", "defect_queue", "completion_forecast"],
  },
  {
    type: "NARRATIVE_CFO",
    label: "Generate CFO briefing",
    description: "Executive portfolio summary with predictive intelligence",
    icon: "FileText",
    requires: ["executive_summary", "heatmap", "breach_forecasts", "atlas_dashboard", "executive_brief"],
  },
  {
    type: "NARRATIVE_AUDIT",
    label: "Generate audit committee summary",
    description: "Control environment assessment with material change analysis",
    icon: "FileText",
    requires: ["executive_summary", "heatmap", "defect_queue", "pack_delta"],
  },
  {
    type: "NARRATIVE_BOARD",
    label: "Generate board summary",
    description: "High-level close health and risk exposure overview",
    icon: "FileText",
    requires: ["executive_summary", "heatmap", "breach_forecasts", "executive_brief"],
  },
];

// ---------------------------------------------------------------------------
// Hook params
// ---------------------------------------------------------------------------

export interface CopilotParams {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  role: CopilotRoleDTO;
}

export interface UseCloseCopilotResult {
  messages: CopilotMessage[];
  loading: boolean;
  error: string | null;
  ask: (questionType: CopilotQuestionType, questionText: string) => Promise<void>;
  /** Parse freeform text, resolve intent, and dispatch to the appropriate builder */
  askFreeform: (text: string) => Promise<CopilotParsedIntent>;
  clear: () => void;
}

// ---------------------------------------------------------------------------
// Data fetchers — reuse existing API endpoints
// ---------------------------------------------------------------------------

async function fetchExecutiveSummary(
  entityCode: string,
  fiscalYear: number,
  periodNumber: number,
  signal?: AbortSignal,
): Promise<CloseExecutiveSummaryDTO | null> {
  try {
    const qs = new URLSearchParams({
      entityCode,
      fiscalYear: String(fiscalYear),
      periodNumber: String(periodNumber),
    });
    const res = await finGet<{ data: CloseExecutiveSummaryDTO }>(
      `/api/fin/period-close/control-tower?${qs}&view=summary`,
      signal,
    );
    return res.data;
  } catch {
    return null;
  }
}

async function fetchHeatmap(
  entityCode: string,
  signal?: AbortSignal,
): Promise<AdvisorEntityHeatmapDTO[] | null> {
  try {
    const qs = new URLSearchParams();
    if (entityCode) qs.set("entityCode", entityCode);
    const res = await finGet<{ data: AdvisorEntityHeatmapDTO[] }>(
      `/api/fin/close-advisor/entity-heatmap?${qs}`,
      signal,
    );
    return res.data;
  } catch {
    return null;
  }
}

async function fetchAlerts(
  entityCode: string,
  signal?: AbortSignal,
): Promise<AdvisorControllerAlertDTO[] | null> {
  try {
    const qs = new URLSearchParams();
    if (entityCode) qs.set("entityCode", entityCode);
    const res = await finGet<{ data: AdvisorControllerAlertDTO[] }>(
      `/api/fin/close-advisor/controller-alerts?${qs}`,
      signal,
    );
    return res.data;
  } catch {
    return null;
  }
}

async function fetchDefectQueue(
  entityCode: string,
  fiscalYear: number,
  periodNumber: number,
  signal?: AbortSignal,
): Promise<AdvisorDefectQueueItemDTO[] | null> {
  try {
    const qs = new URLSearchParams({
      entityCode,
      fiscalYear: String(fiscalYear),
      periodNumber: String(periodNumber),
    });
    const res = await finGet<{ data: AdvisorDefectQueueItemDTO[] }>(
      `/api/fin/close-advisor/defect-queue?${qs}`,
      signal,
    );
    return res.data;
  } catch {
    return null;
  }
}

async function fetchCompletionForecast(
  entityCode: string,
  fiscalYear: number,
  periodNumber: number,
  signal?: AbortSignal,
): Promise<AdvisorCompletionForecastDTO | null> {
  try {
    const qs = new URLSearchParams({
      entityCode,
      fiscalYear: String(fiscalYear),
      periodNumber: String(periodNumber),
    });
    const res = await finGet<{ data: AdvisorCompletionForecastDTO }>(
      `/api/fin/close-advisor/completion-forecast?${qs}`,
      signal,
    );
    return res.data;
  } catch {
    return null;
  }
}

async function fetchBreachForecasts(
  entityCode: string,
  signal?: AbortSignal,
): Promise<SlaBreachForecastDTO[] | null> {
  try {
    const qs = new URLSearchParams();
    if (entityCode) qs.set("entityCode", entityCode);
    const res = await finGet<{ data: SlaBreachForecastDTO[] }>(
      `/api/fin/predictive-close/breach-forecast?${qs}`,
      signal,
    );
    return res.data;
  } catch {
    return null;
  }
}

async function fetchAtlasDashboard(
  entityCode: string,
  fiscalYear: number,
  periodNumber: number,
  signal?: AbortSignal,
): Promise<AtlasDashboardData | null> {
  try {
    const qs = new URLSearchParams({
      entityCode,
      fiscalYear: String(fiscalYear),
      periodNumber: String(periodNumber),
    });
    const res = await finGet<{ data: AtlasDashboardData }>(
      `/api/fin/atlas/dashboard?${qs}`,
      signal,
    );
    return res.data;
  } catch {
    return null;
  }
}

async function fetchPackDelta(
  entityCode: string,
  fiscalYear: number,
  periodNumber: number,
  signal?: AbortSignal,
): Promise<PackDeltaDTO | null> {
  try {
    const qs = new URLSearchParams({
      entityCode,
      fiscalYear: String(fiscalYear),
      periodNumber: String(periodNumber),
      view: "delta",
    });
    const res = await finGet<{ data: PackDeltaDTO }>(
      `/api/fin/packs/readiness?${qs}`,
      signal,
    );
    return res.data;
  } catch {
    return null;
  }
}

async function fetchExecutiveBrief(
  entityCode: string,
  fiscalYear: number,
  periodNumber: number,
  signal?: AbortSignal,
): Promise<ExecutiveBriefDTO | null> {
  try {
    const qs = new URLSearchParams({
      entityCode,
      fiscalYear: String(fiscalYear),
      periodNumber: String(periodNumber),
      view: "brief",
    });
    const res = await finGet<{ data: ExecutiveBriefDTO }>(
      `/api/fin/packs/readiness?${qs}`,
      signal,
    );
    return res.data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

let msgIdCounter = 0;
function nextMsgId(): string {
  return `msg-${++msgIdCounter}-${Date.now()}`;
}

export function useCloseCopilot(params: CopilotParams | null): UseCloseCopilotResult {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(
    async (questionType: CopilotQuestionType, questionText: string) => {
      if (!params) return;

      // Add user message
      const userMsg: CopilotMessage = {
        id: nextMsgId(),
        role: "user",
        questionType,
        text: questionText,
      };
      setMessages((prev) => [...prev, userMsg]);

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        // Determine which data sources to fetch
        const question = QUICK_QUESTIONS.find((q) => q.type === questionType);
        const requires = question?.requires ?? [
          "executive_summary",
          "atlas_dashboard",
        ];

        // Fetch required data in parallel
        const [
          executiveSummary,
          heatmap,
          alerts,
          defectQueue,
          completionForecast,
          breachForecasts,
          atlasDashboard,
          packDelta,
          executiveBrief,
        ] = await Promise.all([
          requires.includes("executive_summary")
            ? fetchExecutiveSummary(params.entityCode, params.fiscalYear, params.periodNumber, controller.signal)
            : null,
          requires.includes("heatmap")
            ? fetchHeatmap(params.entityCode, controller.signal)
            : null,
          requires.includes("alerts")
            ? fetchAlerts(params.entityCode, controller.signal)
            : null,
          requires.includes("defect_queue")
            ? fetchDefectQueue(params.entityCode, params.fiscalYear, params.periodNumber, controller.signal)
            : null,
          requires.includes("completion_forecast")
            ? fetchCompletionForecast(params.entityCode, params.fiscalYear, params.periodNumber, controller.signal)
            : null,
          requires.includes("breach_forecasts")
            ? fetchBreachForecasts(params.entityCode, controller.signal)
            : null,
          requires.includes("atlas_dashboard")
            ? fetchAtlasDashboard(params.entityCode, params.fiscalYear, params.periodNumber, controller.signal)
            : null,
          requires.includes("pack_delta")
            ? fetchPackDelta(params.entityCode, params.fiscalYear, params.periodNumber, controller.signal)
            : null,
          requires.includes("executive_brief")
            ? fetchExecutiveBrief(params.entityCode, params.fiscalYear, params.periodNumber, controller.signal)
            : null,
        ]);

        if (controller.signal.aborted) return;

        // Build context
        const ctx: CopilotContext = {
          entityCode: params.entityCode,
          fiscalYear: params.fiscalYear,
          periodNumber: params.periodNumber,
          role: params.role,
          executiveSummary,
          heatmap,
          alerts,
          defectQueue,
          completionForecast,
          breachForecasts,
          atlasDashboard,
          packDelta,
          executiveBrief,
        };

        // Build answer
        const answer = buildCopilotAnswer(questionType, ctx);

        const copilotMsg: CopilotMessage = {
          id: nextMsgId(),
          role: "copilot",
          questionType,
          text: answer.text,
          sections: answer.sections,
          actions: answer.actions,
          metadata: {
            entityCode: params.entityCode,
            fiscalYear: params.fiscalYear,
            periodNumber: params.periodNumber,
            generatedAt: new Date().toISOString(),
            deterministic: true,
          },
        };

        setMessages((prev) => [...prev, copilotMsg]);
      } catch (err) {
        if (controller.signal.aborted) return;
        const msg =
          err instanceof FinanceHttpError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to generate copilot response";
        setError(msg);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [params?.entityCode, params?.fiscalYear, params?.periodNumber, params?.role],
  );

  const askFreeform = useCallback(
    async (text: string): Promise<CopilotParsedIntent> => {
      const intent = parseCopilotIntent(text);

      // Override entity/period/year if parser extracted hints and they differ
      // We pass the display label as the question text so the UI shows a clean label
      await ask(intent.questionType, intent.displayLabel);

      return intent;
    },
    [ask],
  );

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, loading, error, ask, askFreeform, clear };
}
