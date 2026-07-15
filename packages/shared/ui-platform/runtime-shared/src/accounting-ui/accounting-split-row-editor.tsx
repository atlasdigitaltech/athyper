"use client";

import type { ReactNode } from "react";
import { cn } from "@athyper/theme/utils";
import { LABEL_SM } from "@athyper/ui/typography";

export interface AccountingSplitRowEditorProps {
  title: ReactNode;
  glAccount: ReactNode;
  splitValue: ReactNode;
  distributed: ReactNode;
  costCenter: ReactNode;
  profitCenter: ReactNode;
  project: ReactNode;
  description: ReactNode;
  splitLabel: string;
  deleteAction?: ReactNode;
  reason?: ReactNode;
  asset?: ReactNode;
  applyAction?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function AccountingSplitRowEditor({
  title,
  glAccount,
  splitValue,
  distributed,
  costCenter,
  profitCenter,
  project,
  description,
  splitLabel,
  deleteAction,
  reason,
  asset,
  applyAction,
  className,
  compact = false,
}: AccountingSplitRowEditorProps) {
  return (
    <div className={cn("rounded-md border border-border bg-card", compact ? "p-2" : "p-3", className)}>
      <div className={cn("flex items-center justify-between gap-3", compact ? "mb-2" : "mb-3")}>
        <div className="min-w-0 text-xs font-semibold text-muted-foreground">{title}</div>
        {deleteAction}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(16rem,1fr)_9rem_10rem]">
        <FieldSlot label="GL Account" required>
          {glAccount}
        </FieldSlot>
        <FieldSlot label={splitLabel} required align="right">
          {splitValue}
        </FieldSlot>
        <FieldSlot label="Distributed" align="right">
          {distributed}
        </FieldSlot>
      </div>

      <div className={cn("grid grid-cols-1 gap-3 md:grid-cols-2", compact ? "mt-2" : "mt-3")}>
        <FieldSlot label="Cost Centre">{costCenter}</FieldSlot>
        <FieldSlot label="Project">{project}</FieldSlot>
      </div>

      <div className={cn("grid grid-cols-1 gap-3 md:grid-cols-2", compact ? "mt-2" : "mt-3")}>
        <FieldSlot label="Profit Centre">{profitCenter}</FieldSlot>
        {asset ? (
          <FieldSlot label="Asset">{asset}</FieldSlot>
        ) : <div />}
      </div>

      {reason && <div className={compact ? "mt-2" : "mt-3"}>{reason}</div>}

      <div className={compact ? "mt-2" : "mt-3"}>
        <FieldSlot label="Description">{description}</FieldSlot>
      </div>

      {applyAction && <div className="mt-3 flex justify-end">{applyAction}</div>}
    </div>
  );
}

function FieldSlot({
  label,
  required,
  align,
  children,
}: {
  label: ReactNode;
  required?: boolean;
  align?: "left" | "right";
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className={cn(LABEL_SM, align === "right" && "text-right")}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </div>
      {children}
    </div>
  );
}
