"use client";

/**
 * FlowStepNav — horizontal step indicator bar at the top of the wizard.
 *
 * Visual states per step:
 *   completed — filled circle + check mark, connector filled
 *   active    — filled circle + step number, connector dashed
 *   upcoming  — empty ring + step number, connector dashed
 */

import React from "react";
import { Check } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { FlowStep } from "@athyper/api-contracts/documents";

export interface FlowStepNavProps {
  steps: FlowStep[];
  currentStepIndex: number;
  onStepClick?: (index: number) => void;
  className?: string;
}

export function FlowStepNav({
  steps,
  currentStepIndex,
  onStepClick,
  className,
}: FlowStepNavProps) {
  const sorted = [...steps].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <nav
      aria-label="Wizard steps"
      className={cn("flex items-center", className)}
    >
      {sorted.map((step, idx) => {
        const isCompleted = idx < currentStepIndex;
        const isActive = idx === currentStepIndex;
        const isClickable = isCompleted && onStepClick;

        return (
          <React.Fragment key={step.step_key}>
            {/* Step node */}
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick(idx)}
              className={cn(
                "flex flex-col items-center gap-1 min-w-0",
                isClickable ? "cursor-pointer" : "cursor-default",
              )}
            >
              {/* Circle */}
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors",
                  isCompleted &&
                    "border-primary bg-primary text-primary-foreground",
                  isActive &&
                    "border-primary bg-primary text-primary-foreground ring-2 ring-primary/20",
                  !isCompleted &&
                    !isActive &&
                    "border-border bg-background text-muted-foreground",
                )}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  "max-w-[80px] truncate text-center text-xs font-medium leading-tight",
                  isActive
                    ? "text-primary"
                    : isCompleted
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </button>

            {/* Connector line between steps */}
            {idx < sorted.length - 1 && (
              <div
                className={cn(
                  "mb-5 h-0.5 flex-1 mx-2 transition-colors",
                  idx < currentStepIndex ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
