"use client";

import { useState } from "react";
import {
  Button, Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, Input, Label,
} from "@athyper/ui/primitives";
import { bffFetch, BffError } from "@athyper/runtime-shared/client";
import type { MfaActionClass, MfaElevateResponse } from "@athyper/api-contracts/iam";

/**
 * MFA step-up dialog. Renders a six-digit TOTP input and submits it against
 * POST /api/iam/mfa/elevate with the action class returned by the upstream
 * mutation's STEP_UP_REQUIRED response. On success, calls `onElevated` so the
 * caller can retry the original mutation.
 */
export interface StepUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionClass: MfaActionClass;
  onElevated: () => void;
}

export function StepUpDialog({ open, onOpenChange, actionClass, onElevated }: StepUpDialogProps) {
  const [code, setCode]     = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoad]  = useState(false);

  async function handleElevate() {
    if (code.length !== 6) return;
    setError("");
    setLoad(true);
    try {
      const result = await bffFetch<MfaElevateResponse>("/api/iam/mfa/elevate", {
        method: "POST",
        body: { action_class: actionClass, code: code.trim(), method_type: "totp" },
      });
      if (!result.ok) {
        setError(result.message ?? "Invalid code");
        return;
      }
      setCode("");
      onOpenChange(false);
      onElevated();
    } catch (err) {
      const msg = err instanceof BffError ? err.message : "Failed to verify code";
      setError(msg);
    } finally {
      setLoad(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) { setCode(""); setError(""); }
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Security Verification</DialogTitle>
          <DialogDescription>Enter your current TOTP code to continue.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label className="text-xs">TOTP Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => { if (e.key === "Enter") void handleElevate(); }}
              placeholder="000000"
              className="mt-1 font-mono"
              maxLength={6}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button size="sm" onClick={handleElevate} disabled={loading || code.length !== 6}>
            {loading ? "Verifying…" : "Verify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
