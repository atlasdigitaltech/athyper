"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@neon/ui";
import { useState } from "react";

import type { ActionDescriptor } from "@/lib/entity-page/types";

// Map descriptor action variants to the Button component's supported variants ("primary" | "ghost").
// Destructive actions get primary styling with a red className override.
const buttonVariantMap: Record<string, "primary" | "ghost"> = {
  default: "primary",
  destructive: "primary",
  outline: "ghost",
  secondary: "ghost",
};

// Destructive actions get a semantic destructive override
function getDestructiveClass(variant: string): string {
  return variant === "destructive"
    ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
    : "";
}

interface EntityActionBarProps {
  actions: ActionDescriptor[];
  onAction: (actionCode: string) => void;
  disabled?: boolean;
}

export function EntityActionBar({
  actions,
  onAction,
  disabled,
}: EntityActionBarProps) {
  const [confirmAction, setConfirmAction] = useState<ActionDescriptor | null>(
    null,
  );

  if (actions.length === 0) return null;

  const handleClick = (action: ActionDescriptor) => {
    if (action.requiresConfirmation) {
      setConfirmAction(action);
    } else {
      onAction(action.code);
    }
  };

  const handleConfirm = () => {
    if (confirmAction) {
      onAction(confirmAction.code);
      setConfirmAction(null);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {actions.map((action) => (
          <Button
            key={action.code}
            variant={buttonVariantMap[action.variant] ?? "primary"}
            className={getDestructiveClass(action.variant)}
            disabled={!action.enabled || disabled}
            onClick={() => handleClick(action)}
            title={
              !action.enabled && action.disabledReason
                ? `Disabled: ${action.disabledReason}`
                : undefined
            }
          >
            {action.label}
          </Button>
        ))}
      </div>

      {/* Confirmation dialog */}
      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Action</DialogTitle>
            <DialogDescription>
              {confirmAction?.confirmationMessage ??
                `Are you sure you want to ${confirmAction?.label?.toLowerCase()}?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              variant={
                buttonVariantMap[confirmAction?.variant ?? "default"] ??
                "primary"
              }
              className={
                confirmAction ? getDestructiveClass(confirmAction.variant) : ""
              }
              onClick={handleConfirm}
            >
              {confirmAction?.label ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
