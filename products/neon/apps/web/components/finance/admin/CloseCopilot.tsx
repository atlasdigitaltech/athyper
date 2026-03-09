"use client";

// components/finance/admin/CloseCopilot.tsx
//
// Phase 11B: Role-Aware Conversational Close Copilot.
// Chat-style interface with quick questions and structured responses.

import { useState, useRef, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cog,
  ChevronDown,
  Clock,
  Download,
  FileText,
  Flame,
  FlaskConical,
  ListChecks,
  SearchCode,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  TrendingDown,
  Trash2,
  User,
  Wand2,
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

import {
  useCloseCopilot,
  QUICK_QUESTIONS,
} from "@/lib/finance/use-close-copilot";

import { parseCopilotIntent } from "@/lib/finance/copilot-intent-parser";

import type {
  CopilotMessage,
  CopilotAnswerSection,
  CopilotAction,
  CopilotEvidence,
  CopilotDrillTarget,
  CopilotParsedIntent,
  CopilotRoleDTO,
  CopilotQuestionType,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CloseCopilotProps {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  onDrillNavigate?: (target: CopilotDrillTarget) => void;
}

// ---------------------------------------------------------------------------
// Icon map for quick questions
// ---------------------------------------------------------------------------

const QUESTION_ICONS: Record<string, typeof AlertTriangle> = {
  AlertTriangle,
  ListChecks,
  TrendingDown,
  RefreshCw,
  FileText,
  Shield,
  Clock,
  Download,
  Wand2,
  FlaskConical,
  SearchCode,
  Cog,
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CloseCopilot({
  entityCode,
  fiscalYear,
  periodNumber,
  onDrillNavigate,
}: CloseCopilotProps) {
  const [role, setRole] = useState<CopilotRoleDTO>("CONTROLLER");
  const [freeformText, setFreeformText] = useState("");
  const [lastIntent, setLastIntent] = useState<CopilotParsedIntent | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const params = useMemo(
    () => ({ entityCode, fiscalYear, periodNumber, role }),
    [entityCode, fiscalYear, periodNumber, role],
  );

  const { messages, loading, error, ask, askFreeform, clear } = useCloseCopilot(params);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, loading]);

  const handleQuickQuestion = (type: CopilotQuestionType, label: string) => {
    if (loading) return;
    ask(type, label);
  };

  // Live preview: parse intent as user types (debounced via state)
  const liveIntent = useMemo(() => {
    if (freeformText.trim().length < 3) return null;
    return parseCopilotIntent(freeformText);
  }, [freeformText]);

  const handleFreeformSubmit = async () => {
    const text = freeformText.trim();
    if (!text || loading) return;
    setFreeformText("");
    setLastIntent(null);
    const intent = await askFreeform(text);
    setLastIntent(intent);
  };

  const handleFreeformKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleFreeformSubmit();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header: role selector + clear */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-primary" />
          <span className="text-sm font-semibold">Close Copilot</span>
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
            onQuestion={handleQuickQuestion}
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
                Analyzing {entityCode} data...
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

      {/* Input bar — freeform + quick questions */}
      <div className="border-t px-4 py-3 space-y-2">
        {/* Freeform input */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={freeformText}
              onChange={(e) => setFreeformText(e.target.value)}
              onKeyDown={handleFreeformKeyDown}
              placeholder="Ask anything about this close period..."
              disabled={loading}
              className="h-8 w-full rounded-md border bg-background px-3 pr-8 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            {/* Live intent preview badge */}
            {liveIntent && (
              <span
                className={cn(
                  "absolute right-9 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[9px] font-medium",
                  liveIntent.confidence >= 0.7
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    : liveIntent.confidence >= 0.5
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                      : "bg-muted text-muted-foreground",
                )}
                title={`Intent: ${liveIntent.questionType} (${(liveIntent.confidence * 100).toFixed(0)}% — rule: ${liveIntent.matchRule})`}
              >
                {liveIntent.questionType.replace(/_/g, " ")}
              </span>
            )}
          </div>
          <Button
            size="sm"
            className="h-8 px-3"
            disabled={loading || freeformText.trim().length === 0}
            onClick={handleFreeformSubmit}
          >
            <Send className="size-3.5" />
          </Button>
        </div>

        {/* Quick question chips — show core analysis + flows, narratives only on welcome grid */}
        <div className="flex flex-wrap gap-1.5">
          {QUICK_QUESTIONS.filter((q) => !q.type.startsWith("NARRATIVE_")).map((q) => {
            const Icon = QUESTION_ICONS[q.icon] ?? MessageSquare;
            return (
              <button
                key={q.type}
                disabled={loading}
                onClick={() => handleQuickQuestion(q.type, q.label)}
                className="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <Icon className="size-2.5" />
                {q.label}
              </button>
            );
          })}
        </div>
      </div>
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
  onQuestion: (type: CopilotQuestionType, label: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="size-6 text-primary" />
      </div>
      <h2 className="mb-1 text-lg font-semibold">Close Copilot</h2>
      <p className="mb-6 max-w-md text-center text-sm text-muted-foreground">
        Your intelligent assistant for {entityCode} period close.
        Ask a question below or choose a quick topic.
        Answers are deterministic, evidence-backed, and role-filtered for {role.replace(/_/g, " ")}.
      </p>

      {/* Analysis & Action Questions */}
      <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
        {QUICK_QUESTIONS.filter((q) => !q.type.startsWith("NARRATIVE_")).map((q) => {
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

      {/* Narrative Generation */}
      <div className="mt-4 w-full max-w-lg">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Narrative Reports
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {QUICK_QUESTIONS.filter((q) => q.type.startsWith("NARRATIVE_")).map((q) => {
            const Icon = QUESTION_ICONS[q.icon] ?? MessageSquare;
            return (
              <button
                key={q.type}
                onClick={() => onQuestion(q.type, q.label)}
                className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10"
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
            <span>FY{message.metadata.fiscalYear} P{message.metadata.periodNumber}</span>
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
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          {section.stepNumber != null && (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {section.stepNumber}
            </span>
          )}
          {section.heading}
        </span>
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
              Open in {section.drillTarget.tab}{section.drillTarget.subTab ? ` → ${section.drillTarget.subTab}` : ""} →
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
