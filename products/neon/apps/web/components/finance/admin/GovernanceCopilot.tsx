"use client";

// components/finance/admin/GovernanceCopilot.tsx
//
// Phase 21: Governance Copilot & Explainable Action Assistant.
// Deterministic, evidence-backed Q&A over the governance knowledge graph.

import { useState, useRef, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  GitBranch,
  ListChecks,
  Loader2,
  MessageSquare,
  Network,
  Send,
  Sparkles,
  Trash2,
  User,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

import {
  useGovernanceCopilot,
  GOVERNANCE_QUESTIONS,
} from "@/lib/finance/use-governance-copilot";

import type {
  CopilotMessage,
  CopilotAnswerSection,
  CopilotAction,
  CopilotEvidence,
  CopilotDrillTarget,
  CopilotRoleDTO,
} from "@/lib/finance/types";

import type { GovernanceQuestionType } from "@/lib/finance/governance-answer-builder";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GovernanceCopilotProps {
  entityCode: string;
  onDrillNavigate?: (target: CopilotDrillTarget) => void;
}

// ---------------------------------------------------------------------------
// Icon map for governance questions
// ---------------------------------------------------------------------------

const QUESTION_ICONS: Record<string, typeof AlertTriangle> = {
  Network,
  AlertTriangle,
  Sparkles,
  GitBranch,
  ListChecks,
  BookOpen,
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function GovernanceCopilot({
  entityCode,
  onDrillNavigate,
}: GovernanceCopilotProps) {
  const [role, setRole] = useState<CopilotRoleDTO>("CONTROLLER");
  const [briefingInput, setBriefingInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const params = useMemo(
    () => ({ entityCode, role }),
    [entityCode, role],
  );

  const { messages, loading, error, ask, clear } = useGovernanceCopilot(params);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, loading]);

  const handleQuestion = (type: GovernanceQuestionType, label: string) => {
    if (loading) return;
    ask(type, label);
  };

  const handleBriefing = () => {
    if (loading || !briefingInput.trim()) return;
    const parts = briefingInput.trim().split(":");
    const kind = parts.length > 1 ? parts[0] : undefined;
    const key = parts.length > 1 ? parts.slice(1).join(":") : parts[0];
    ask(
      "OBJECT_BRIEFING",
      `Brief me on ${briefingInput}`,
      kind,
      key,
    );
    setBriefingInput("");
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header: role selector + clear */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Network className="size-4 text-primary" />
          <span className="text-sm font-semibold">Governance Copilot</span>
          <Badge variant="outline" className="text-xs">
            Deterministic
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={role}
            onValueChange={(v) => setRole(v as CopilotRoleDTO)}
          >
            <SelectTrigger className="h-7 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CONTROLLER">Controller</SelectItem>
              <SelectItem value="CFO">CFO</SelectItem>
              <SelectItem value="CLOSE_MANAGER">Close Manager</SelectItem>
              <SelectItem value="ACCOUNTANT">Accountant</SelectItem>
            </SelectContent>
          </Select>
          {messages.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={clear}>
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && !loading ? (
          <WelcomeScreen
            entityCode={entityCode}
            role={role}
            onQuestion={handleQuestion}
          />
        ) : (
          <div className="space-y-4">
            {messages.map((msg) =>
              msg.role === "user" ? (
                <UserMessage key={msg.id} message={msg} />
              ) : (
                <CopilotResponse key={msg.id} message={msg} onDrillNavigate={onDrillNavigate} />
              ),
            )}

            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Analyzing governance graph for {entityCode}...
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <XCircle className="size-4" />
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick question bar + briefing input (always visible at bottom) */}
      {messages.length > 0 && (
        <div className="border-t px-4 py-3">
          <p className="mb-2 text-xs text-muted-foreground">Ask another question:</p>
          <div className="flex flex-wrap gap-1.5">
            {GOVERNANCE_QUESTIONS.filter((q) => q.type !== "OBJECT_BRIEFING").map((q) => {
              const Icon = QUESTION_ICONS[q.icon] ?? MessageSquare;
              return (
                <button
                  key={q.type}
                  disabled={loading}
                  onClick={() => handleQuestion(q.type, q.label)}
                  className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  <Icon className="size-3" />
                  {q.label}
                </button>
              );
            })}
          </div>
          {/* Object briefing input */}
          <div className="mt-2 flex items-center gap-2">
            <BookOpen className="size-3.5 shrink-0 text-muted-foreground" />
            <Input
              placeholder="Object briefing — e.g. issue:unreconciled_items or program_type:reconciliation"
              value={briefingInput}
              onChange={(e) => setBriefingInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleBriefing(); }}
              disabled={loading}
              className="h-7 text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              disabled={loading || !briefingInput.trim()}
              onClick={handleBriefing}
            >
              <Send className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Welcome Screen
// ---------------------------------------------------------------------------

function WelcomeScreen({
  entityCode,
  role,
  onQuestion,
}: {
  entityCode: string;
  role: CopilotRoleDTO;
  onQuestion: (type: GovernanceQuestionType, label: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
        <Network className="size-6 text-primary" />
      </div>
      <h2 className="mb-1 text-lg font-semibold">Governance Copilot</h2>
      <p className="mb-6 max-w-md text-center text-sm text-muted-foreground">
        Explainable Q&A over the {entityCode} governance knowledge graph.
        Answers are deterministic, evidence-backed, and role-filtered for {role.replace(/_/g, " ")}.
      </p>

      <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
        {GOVERNANCE_QUESTIONS.map((q) => {
          const Icon = QUESTION_ICONS[q.icon] ?? MessageSquare;
          return (
            <button
              key={q.type}
              onClick={() => onQuestion(q.type, q.label)}
              className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
            >
              <div className="mt-0.5 shrink-0 rounded-md bg-primary/10 p-1.5">
                <Icon className="size-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{q.label}</p>
                <p className="text-xs text-muted-foreground">{q.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// User Message
// ---------------------------------------------------------------------------

function UserMessage({ message }: { message: CopilotMessage }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
        <User className="size-3.5" />
      </div>
      <div className="rounded-lg bg-muted px-3 py-2 text-sm">
        {message.text}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copilot Response
// ---------------------------------------------------------------------------

function CopilotResponse({ message, onDrillNavigate }: { message: CopilotMessage; onDrillNavigate?: (target: CopilotDrillTarget) => void }) {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    () => new Set(message.sections?.map((_, i) => i) ?? []),
  );

  const toggleSection = (idx: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Bot className="size-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {/* Main text */}
        <p className="text-sm leading-relaxed">{message.text}</p>

        {/* Sections */}
        {message.sections?.map((section, i) => (
          <SectionCard
            key={i}
            section={section}
            expanded={expandedSections.has(i)}
            onToggle={() => toggleSection(i)}
            onDrillNavigate={onDrillNavigate}
          />
        ))}

        {/* Actions */}
        {message.actions && message.actions.length > 0 && (
          <div className="rounded-lg border bg-primary/5 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
              Recommended Actions
            </p>
            <div className="space-y-2">
              {message.actions.map((action, i) => (
                <ActionCard key={i} action={action} onDrillNavigate={onDrillNavigate} />
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        {message.metadata && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{message.metadata.entityCode}</span>
            <span>·</span>
            <span>{new Date(message.metadata.generatedAt).toLocaleTimeString()}</span>
            {message.metadata.deterministic && (
              <>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                  <CheckCircle2 className="size-2.5" />
                  Deterministic
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Card
// ---------------------------------------------------------------------------

function SectionCard({
  section,
  expanded,
  onToggle,
  onDrillNavigate,
}: {
  section: CopilotAnswerSection;
  expanded: boolean;
  onToggle: () => void;
  onDrillNavigate?: (target: CopilotDrillTarget) => void;
}) {
  const severityCls =
    section.severity === "critical"
      ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
      : section.severity === "high"
        ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"
        : "border-border bg-card";

  return (
    <div className={cn("rounded-lg border p-3", severityCls)}>
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-xs font-semibold">{section.heading}</span>
        <div className="flex items-center gap-1.5">
          {section.severity && (
            <Badge
              variant={
                section.severity === "critical" || section.severity === "high"
                  ? "destructive"
                  : "secondary"
              }
              className="text-[10px]"
            >
              {section.severity}
            </Badge>
          )}
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </div>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {/* Content text */}
          <p className="whitespace-pre-line text-xs leading-relaxed text-foreground/80">
            {section.content}
          </p>

          {/* Evidence pills */}
          {section.evidence.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {section.evidence.map((ev, i) => (
                <EvidencePill key={i} evidence={ev} onDrillNavigate={onDrillNavigate} />
              ))}
            </div>
          )}

          {/* Section drill-through link */}
          {section.drillTarget && onDrillNavigate && (
            <button
              onClick={() => onDrillNavigate(section.drillTarget!)}
              className="mt-1 text-[10px] font-medium text-primary hover:underline"
            >
              Open in {section.drillTarget.tab}{section.drillTarget.subTab ? ` > ${section.drillTarget.subTab}` : ""} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence Pill
// ---------------------------------------------------------------------------

function EvidencePill({ evidence, onDrillNavigate }: { evidence: CopilotEvidence; onDrillNavigate?: (target: CopilotDrillTarget) => void }) {
  const severityCls =
    evidence.severity === "critical"
      ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
      : evidence.severity === "high"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
        : "bg-muted text-muted-foreground";

  const clickable = evidence.drillTarget && onDrillNavigate;

  const Tag = clickable ? "button" : "span";

  return (
    <Tag
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]",
        severityCls,
        clickable && "cursor-pointer ring-offset-background transition-colors hover:ring-1 hover:ring-primary/50",
      )}
      title={evidence.value ? `${evidence.label}: ${evidence.value}` : evidence.label}
      onClick={clickable ? () => onDrillNavigate(evidence.drillTarget!) : undefined}
    >
      <span className="max-w-[200px] truncate">{evidence.label}</span>
      {evidence.value && (
        <span className="font-medium">{evidence.value}</span>
      )}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Action Card
// ---------------------------------------------------------------------------

function ActionCard({ action, onDrillNavigate }: { action: CopilotAction; onDrillNavigate?: (target: CopilotDrillTarget) => void }) {
  const clickable = action.drillTarget && onDrillNavigate;

  return (
    <div
      className={cn(
        "flex items-start gap-2",
        clickable && "cursor-pointer rounded-md p-1 -m-1 transition-colors hover:bg-accent/50",
      )}
      onClick={clickable ? () => onDrillNavigate(action.drillTarget!) : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") onDrillNavigate(action.drillTarget!); } : undefined}
    >
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
        {action.priority}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">
          {action.title}
          {clickable && <span className="ml-1 text-primary">→</span>}
        </p>
        <p className="text-[10px] text-muted-foreground">{action.rationale}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {action.ownerRole.replace(/_/g, " ")}
          </Badge>
          {action.estimatedImpact && (
            <span className="text-[10px] text-muted-foreground">
              Impact: {action.estimatedImpact}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
