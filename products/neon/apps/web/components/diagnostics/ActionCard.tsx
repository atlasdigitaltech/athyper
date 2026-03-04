"use client";

// components/diagnostics/ActionCard.tsx
//
// Reusable card for a single diagnostic action.

import { Check, Loader2, X } from "lucide-react";

import type { ActionResult } from "./useDiagnosticAction";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useMessages } from "@/lib/i18n/messages-context";

interface ActionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  buttonLabel: string;
  variant?: "default" | "primary";
  loading: boolean;
  result: ActionResult | null;
  onExecute: () => void;
}

export function ActionCard({
  icon: Icon,
  title,
  description,
  buttonLabel,
  variant = "default",
  loading,
  result,
  onExecute,
}: ActionCardProps) {
  const { t } = useMessages();
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-muted p-2">
            <Icon className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium">{title}</h4>
              {result && (
                <Badge
                  variant={result.ok ? "default" : "destructive"}
                  className="gap-1 shrink-0 animate-in fade-in duration-200"
                >
                  {result.ok ? (
                    <Check className="size-3" />
                  ) : (
                    <X className="size-3" />
                  )}
                  {result.message}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {description}
            </p>
          </div>
        </div>

        <Button
          variant={variant === "primary" ? "default" : "outline"}
          size="sm"
          className="w-full"
          disabled={loading}
          onClick={onExecute}
        >
          {loading ? (
            <>
              <Loader2 className="me-1.5 size-3.5 animate-spin" />
              {t("diag.action.running")}
            </>
          ) : (
            buttonLabel
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
