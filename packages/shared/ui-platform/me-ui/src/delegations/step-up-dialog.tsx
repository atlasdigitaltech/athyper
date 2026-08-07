"use client";

import { useState } from "react";
import {
  Button, Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@athyper/platform-ui/primitives";
import { bffFetch, BffError } from "@athyper/runtime-shared/client";
import type { MfaActionClass, MfaElevateResponse } from "@athyper/api-contracts/iam";

/**
 * MFA step-up dialog. Keycloak owns the challenge. If the current bearer token
 * already contains fresh Keycloak MFA evidence, the IAM endpoint grants the
 * short, session-bound elevation. Otherwise the BFF starts an action-specific
 * Keycloak step-up transaction.
 */
export interface stepUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionClass: MfaActionClass;
  onElevated: () => void;
}

export type StepUpDialogProps = stepUpDialogProps;

export function stepUpDialog({ open, onOpenChange, actionClass, onElevated }: stepUpDialogProps) {
  const [error, setError]   = useState("");
  const [loading, setLoad]  = useState(false);

  async function handleElevate() {
    setError("");
    setLoad(true);
    try {
      const result = await bffFetch<MfaElevateResponse>("/api/iam/mfa/elevate", {
        method: "POST",
        body: { action_class: actionClass },
      });
      if (!result.ok) {
        setError(result.message ?? "Keycloak MFA is required.");
        return;
      }
      onOpenChange(false);
      onElevated();
    } catch (err) {
      if (err instanceof BffError) {
        try {
          const stepUp = await bffFetch<{ reauthenticate_url?: string }>("/api/auth/step-up/start", {
            method: "POST",
            body: { action_class: actionClass, returnUrl: window.location.href },
          });
          if (!stepUp.reauthenticate_url) throw new Error("missing step-up URL");
          window.location.assign(stepUp.reauthenticate_url);
        } catch {
          setError("Keycloak step-up could not be started. Try again.");
        }
        return;
      }
      setError("Keycloak MFA could not be started. Try again.");
    } finally {
      setLoad(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setError("");
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Security Verification</DialogTitle>
          <DialogDescription>Complete MFA in Keycloak to continue.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button size="sm" onClick={handleElevate} disabled={loading}>
            {loading ? "Opening Keycloak…" : "Continue with Keycloak"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const StepUpDialog = stepUpDialog;
