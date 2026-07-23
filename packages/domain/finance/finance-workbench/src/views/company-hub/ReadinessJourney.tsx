"use client";

import Link from "next/link";
import {
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Circle,
  CircleAlert,
  ClipboardCheck,
  ListTree,
  MapPin,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type {
  JourneyStep,
  JourneyStepKey,
  JourneyStepState,
} from "../../lib/finance-setup.types";
import { DefinitionStateChip } from "./DefinitionStateChip";
import { PostabilityChip } from "./PostabilityChip";

const STEP_ICON: Record<JourneyStepKey, LucideIcon> = {
  foundation:    MapPin,
  chart:         ListTree,
  books:         BookOpenCheck,
  gl_controls:   ClipboardCheck,
  house_banks:   Wallet,
  fiscal_period: CalendarDays,
};

const STATE_TONE: Record<JourneyStepState, { ring: string; dot: string; label: string }> = {
  complete:    { ring: "ring-success/30 bg-success/10",       dot: "bg-success",       label: "Complete"    },
  in_progress: { ring: "ring-warning/30 bg-warning/10",       dot: "bg-warning",       label: "In progress" },
  not_started: { ring: "ring-muted-foreground/20 bg-muted",   dot: "bg-muted-foreground/40", label: "Not started" },
  blocked:     { ring: "ring-destructive/30 bg-destructive/10", dot: "bg-destructive",  label: "Blocked"     },
};

function CoverageRing({ pct, tone }: { pct: number; tone: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const dash = (clamped / 100) * 100;
  return (
    <svg
      className="h-11 w-11 -rotate-90"
      viewBox="0 0 36 36"
      role="img"
      aria-label={`Coverage ${clamped}%`}
    >
      <circle cx="18" cy="18" r="15.9155" className="fill-none stroke-muted" strokeWidth="3" />
      <circle
        cx="18"
        cy="18"
        r="15.9155"
        className={cn("fill-none", tone)}
        strokeWidth="3"
        strokeDasharray={`${dash}, 100`}
        strokeLinecap="round"
      />
      <text
        x="18"
        y="21"
        textAnchor="middle"
        className="rotate-90 fill-foreground text-[10px] font-medium"
        style={{ transform: "rotate(90deg)", transformOrigin: "18px 18px" }}
      >
        {clamped}%
      </text>
    </svg>
  );
}

function StepMarker({ step, index }: { step: JourneyStep; index: number }) {
  const Icon = STEP_ICON[step.key];
  const tone = STATE_TONE[step.state];
  const stateIcon = step.state === "complete" ? CheckCircle2
    : step.state === "blocked" ? CircleAlert
    : Circle;
  const StateIcon = stateIcon;

  const showRing = step.key === "gl_controls" || step.key === "house_banks";
  const pct = step.coveragePct ?? 0;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-2 rounded-xl border p-3 ring-1 transition-shadow",
        tone.ring,
        "border-border/60 hover:shadow-sm",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-background", tone.dot)}>
          {index + 1}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">{step.label}</span>
      </div>

      <div className="flex items-center gap-3">
        {showRing && step.coveragePct !== null ? (
          <CoverageRing pct={pct} tone={
            step.state === "complete" ? "stroke-success"
              : step.state === "blocked" ? "stroke-destructive"
              : "stroke-warning"
          } />
        ) : (
          <StateIcon
            className={cn(
              "h-8 w-8",
              step.state === "complete" && "text-success",
              step.state === "blocked" && "text-destructive",
              step.state === "in_progress" && "text-warning",
              step.state === "not_started" && "text-muted-foreground/60",
            )}
            aria-hidden
          />
        )}

        <div className="flex flex-col text-xs text-muted-foreground">
          <span>{tone.label}</span>
          {step.chip?.kind === "definition" ? (
            <DefinitionStateChip
              state={step.chip.descriptor.state}
              vocabulary={step.chip.descriptor.vocabulary}
              objectKind={step.chip.descriptor.objectKind}
              size="sm"
            />
          ) : step.chip?.kind === "postability" ? (
            <PostabilityChip
              chip={step.chip.descriptor.chip}
              reasonCode={step.chip.descriptor.reasonCode}
              size="sm"
            />
          ) : null}
          {step.conflictCount > 0 && (
            <span className="mt-0.5 font-medium text-destructive">
              {step.conflictCount} {step.conflictCount === 1 ? "issue" : "issues"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export interface ReadinessJourneyProps {
  steps: JourneyStep[];
  className?: string;
}

export function ReadinessJourney({ steps, className }: ReadinessJourneyProps) {
  return (
    <section
      className={cn("rounded-lg border bg-card p-4", className)}
      aria-labelledby="finance-setup-journey"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 id="finance-setup-journey" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Readiness Journey
        </h2>
        <span className="text-xs text-muted-foreground">
          {steps.filter(s => s.state === "complete").length} of {steps.length} complete
        </span>
      </div>
      <ol
        role="list"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        {steps.map((step, i) => (
          <li key={step.key} role="listitem" className="min-w-0">
            <Link
              href={step.primaryHref}
              className="block outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
              aria-current={step.state === "in_progress" || step.state === "blocked" ? "step" : undefined}
              aria-label={`${step.label} — ${STATE_TONE[step.state].label}${step.conflictCount ? `, ${step.conflictCount} issues` : ""}`}
            >
              <StepMarker step={step} index={i} />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
