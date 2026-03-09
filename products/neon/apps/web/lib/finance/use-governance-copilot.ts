"use client";

// lib/finance/use-governance-copilot.ts
//
// Phase 21: Governance Copilot hook.
// Manages conversation state, fetches Phase 20 data sources,
// and invokes the deterministic governance answer builder.

import { useState, useCallback, useRef } from "react";

import { finGet } from "./fetcher";
import {
  buildGovernanceAnswer,
  type GovernanceContext,
  type GovernanceQuestionType,
} from "./governance-answer-builder";

import type {
  CopilotMessage,
  CopilotRoleDTO,
} from "./types";

import type {
  ControlMemoryDTO,
  PathwayDataDTO,
  ProposalProvenanceDTO,
  KnowledgeSummaryDTO,
} from "./use-governance-knowledge";

// ---------------------------------------------------------------------------
// Quick Questions
// ---------------------------------------------------------------------------

export interface GovernanceCopilotQuestion {
  type: GovernanceQuestionType;
  label: string;
  description: string;
  icon: string;
  requires: GovernanceDataSource[];
}

type GovernanceDataSource =
  | "memory"
  | "pathways"
  | "provenance"
  | "summary";

export const GOVERNANCE_QUESTIONS: GovernanceCopilotQuestion[] = [
  {
    type: "GOVERNANCE_OVERVIEW",
    label: "What's the governance health?",
    description: "Graph relationships, control memory, pathway progression",
    icon: "Network",
    requires: ["summary", "pathways"],
  },
  {
    type: "ISSUE_EXPLAIN",
    label: "What caused recurring issues?",
    description: "Root cause analysis with occurrence history and linked programs",
    icon: "AlertTriangle",
    requires: ["memory", "pathways"],
  },
  {
    type: "PROPOSAL_EXPLAIN",
    label: "Why are proposals confident or not?",
    description: "Explainable confidence with similar programs and prior decisions",
    icon: "Sparkles",
    requires: ["provenance"],
  },
  {
    type: "PATHWAY_ANALYSIS",
    label: "What are the strongest patterns?",
    description: "Issue→recommendation→program→outcome pathway success rates",
    icon: "GitBranch",
    requires: ["pathways"],
  },
  {
    type: "NEXT_ACTIONS",
    label: "What governance actions are needed?",
    description: "Prioritized next steps with provenance and historical evidence",
    icon: "ListChecks",
    requires: ["memory", "pathways", "provenance"],
  },
  {
    type: "OBJECT_BRIEFING",
    label: "Brief me on a specific object",
    description: "State, linked objects, memory, and recommended action",
    icon: "BookOpen",
    requires: ["memory", "pathways", "provenance"],
  },
];

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface GovernanceCopilotParams {
  entityCode: string;
  role: CopilotRoleDTO;
}

export interface UseGovernanceCopilotResult {
  messages: CopilotMessage[];
  loading: boolean;
  error: string | null;
  ask: (
    questionType: GovernanceQuestionType,
    questionText: string,
    focusObjectKind?: string,
    focusObjectKey?: string,
  ) => Promise<void>;
  clear: () => void;
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

async function fetchMemory(
  entityCode: string,
  signal?: AbortSignal,
): Promise<ControlMemoryDTO[] | null> {
  try {
    const res = await finGet<{ data: ControlMemoryDTO[] }>(
      `/api/fin/assurance/knowledge-graph?entityCode=${entityCode}&view=memory`,
      signal,
    );
    return res.data;
  } catch {
    return null;
  }
}

async function fetchPathways(
  entityCode: string,
  signal?: AbortSignal,
): Promise<PathwayDataDTO | null> {
  try {
    const res = await finGet<{ data: PathwayDataDTO }>(
      `/api/fin/assurance/knowledge-graph?entityCode=${entityCode}&view=pathways`,
      signal,
    );
    return res.data;
  } catch {
    return null;
  }
}

async function fetchProvenance(
  entityCode: string,
  signal?: AbortSignal,
): Promise<ProposalProvenanceDTO[] | null> {
  try {
    const res = await finGet<{ data: ProposalProvenanceDTO[] }>(
      `/api/fin/assurance/knowledge-graph?entityCode=${entityCode}&view=provenance`,
      signal,
    );
    return res.data;
  } catch {
    return null;
  }
}

async function fetchSummary(
  entityCode: string,
  signal?: AbortSignal,
): Promise<KnowledgeSummaryDTO | null> {
  try {
    const res = await finGet<{ data: KnowledgeSummaryDTO }>(
      `/api/fin/assurance/knowledge-graph?entityCode=${entityCode}&view=summary`,
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

let govMsgIdCounter = 0;
function nextGovMsgId(): string {
  return `gov-msg-${++govMsgIdCounter}-${Date.now()}`;
}

export function useGovernanceCopilot(
  params: GovernanceCopilotParams | null,
): UseGovernanceCopilotResult {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(
    async (
      questionType: GovernanceQuestionType,
      questionText: string,
      focusObjectKind?: string,
      focusObjectKey?: string,
    ) => {
      if (!params) return;

      // Add user message
      const userMsg: CopilotMessage = {
        id: nextGovMsgId(),
        role: "user",
        text: questionText,
      };
      setMessages((prev) => [...prev, userMsg]);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const question = GOVERNANCE_QUESTIONS.find((q) => q.type === questionType);
        const requires = question?.requires ?? ["memory", "pathways", "provenance", "summary"];

        // Fetch required data in parallel
        const [memory, pathways, provenance, summary] = await Promise.all([
          requires.includes("memory")
            ? fetchMemory(params.entityCode, controller.signal)
            : null,
          requires.includes("pathways")
            ? fetchPathways(params.entityCode, controller.signal)
            : null,
          requires.includes("provenance")
            ? fetchProvenance(params.entityCode, controller.signal)
            : null,
          requires.includes("summary")
            ? fetchSummary(params.entityCode, controller.signal)
            : null,
        ]);

        if (controller.signal.aborted) return;

        const ctx: GovernanceContext = {
          entityCode: params.entityCode,
          role: params.role,
          memory,
          pathways,
          provenance,
          summary,
          focusObjectKind,
          focusObjectKey,
        };

        const answer = buildGovernanceAnswer(questionType, ctx);

        const copilotMsg: CopilotMessage = {
          id: nextGovMsgId(),
          role: "copilot",
          text: answer.text,
          sections: answer.sections,
          actions: answer.actions,
          metadata: {
            entityCode: params.entityCode,
            fiscalYear: 0,
            periodNumber: 0,
            generatedAt: new Date().toISOString(),
            deterministic: true,
          },
        };

        setMessages((prev) => [...prev, copilotMsg]);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : "Failed to generate governance response",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [params?.entityCode, params?.role],
  );

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, loading, error, ask, clear };
}
