"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button, Checkbox, Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea,
} from "@athyper/ui/primitives";
import { DatePicker } from "@athyper/ui/composites";
import { bffFetch, BffError } from "@athyper/runtime-shared/client";
import type {
  DelegationGrantRequest,
  DelegationGrantResponse,
  DelegationScopeType,
  PermissionItem,
  PermissionsCatalog,
  PrincipalSearchItem,
  PrincipalSearchResults,
  StepUpRequiredResponse,
} from "@athyper/api-contracts/iam";

import { StepUpDialog } from "./step-up-dialog";

const SCOPE_TYPES: DelegationScopeType[] = ["task", "entity", "workflow", "module", "company_code"];

/**
 * Grant-delegation dialog. Lets the caller pick a delegate, scope, permissions,
 * and expiry, then submits the grant. If the runtime returns STEP_UP_REQUIRED,
 * opens the MFA dialog and retries on success.
 */
export interface GrantDelegationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGranted: () => void;
}

export function GrantDelegationDialog({ open, onOpenChange, onGranted }: GrantDelegationDialogProps) {
  const [delegateSearch, setDelegateSearch]     = useState("");
  const [selectedDelegate, setSelectedDelegate] = useState<PrincipalSearchItem | null>(null);
  const [scopeType, setScopeType]               = useState<DelegationScopeType | "">("");
  const [scopeRef, setScopeRef]                 = useState("");
  const [selectedPermIds, setSelectedPermIds]   = useState<Set<string>>(new Set());
  const [expiresAt, setExpiresAt]               = useState("");
  const [reason, setReason]                     = useState("");
  const [submitError, setSubmitError]           = useState("");
  const [submitting, setSubmitting]             = useState(false);
  const [stepUpOpen, setStepUpOpen]             = useState(false);

  const { data: principalResults } = useQuery({
    queryKey: ["iam-principal-search-del", delegateSearch],
    queryFn: async () => {
      if (delegateSearch.trim().length < 2) return { items: [] } as PrincipalSearchResults;
      return bffFetch<PrincipalSearchResults>(
        `/api/iam/principals?q=${encodeURIComponent(delegateSearch)}&limit=20`,
      );
    },
    enabled: delegateSearch.trim().length >= 2,
    staleTime: 30_000,
  });

  const { data: permData } = useQuery({
    queryKey: ["iam-permissions-grant"],
    queryFn: () => bffFetch<PermissionsCatalog>("/api/iam/permissions"),
    enabled: open,
    staleTime: 300_000,
  });

  const permissions = permData?.items ?? [];
  const permsByModule = permissions.reduce<Record<string, PermissionItem[]>>((acc, p) => {
    const m = p.module_code ?? "Other";
    (acc[m] ??= []).push(p);
    return acc;
  }, {});

  function reset() {
    setDelegateSearch(""); setSelectedDelegate(null); setScopeType("");
    setScopeRef(""); setSelectedPermIds(new Set()); setExpiresAt("");
    setReason(""); setSubmitError(""); setSubmitting(false);
  }

  async function handleSubmit() {
    if (!selectedDelegate || !scopeType || selectedPermIds.size === 0 || !expiresAt) {
      setSubmitError("All required fields must be filled.");
      return;
    }
    setSubmitError(""); setSubmitting(true);
    try {
      const payload: DelegationGrantRequest = {
        delegate_id: selectedDelegate.id,
        scope_type: scopeType,
        scope_ref: scopeRef.trim() || null,
        permissions: Array.from(selectedPermIds),
        // DatePicker(kind="instant") already emits a UTC ISO with the Z suffix —
        // no client-side parsing needed (was: new Date(expiresAt).toISOString()).
        expires_at: expiresAt,
        reason: reason.trim() || null,
      };
      await bffFetch<DelegationGrantResponse>("/api/iam/delegations/my", {
        method: "POST",
        body: payload,
      });
      reset();
      onOpenChange(false);
      onGranted();
    } catch (err) {
      if (err instanceof BffError && err.status === 403) {
        // STEP_UP_REQUIRED — the message text starts with the error code from
        // the BFF unwrap. Open the step-up dialog; the bffFetch path replays.
        setStepUpOpen(true);
      } else {
        const msg = err instanceof BffError ? err.message : "Failed to grant delegation";
        setSubmitError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const principals = principalResults?.items ?? [];

  return (
    <>
      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        actionClass="delegation_accept"
        onElevated={handleSubmit}
      />
      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Grant Access Delegation</DialogTitle>
            <DialogDescription>Delegate specific permissions to another user.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div>
              <Label className="text-xs font-medium">Delegate to</Label>
              {selectedDelegate ? (
                <div className="mt-1.5 flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <p className="text-xs font-medium">{selectedDelegate.display_name ?? selectedDelegate.name}</p>
                    {selectedDelegate.login_email && (
                      <p className="text-xs text-muted-foreground">{selectedDelegate.login_email}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedDelegate(null)}>Change</Button>
                </div>
              ) : (
                <div className="relative mt-1.5">
                  <Input
                    value={delegateSearch}
                    onChange={(e) => setDelegateSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="text-xs"
                  />
                  {principals.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                      {principals.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-accent"
                          onClick={() => { setSelectedDelegate(p); setDelegateSearch(""); }}
                        >
                          <p className="text-xs font-medium">{p.display_name ?? p.name}</p>
                          {p.login_email && <p className="text-xs text-muted-foreground">{p.login_email}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Scope Type</Label>
                <Select value={scopeType} onValueChange={(v) => setScopeType(v as DelegationScopeType)}>
                  <SelectTrigger className="mt-1.5 h-8 text-xs"><SelectValue placeholder="Select scope" /></SelectTrigger>
                  <SelectContent>
                    {SCOPE_TYPES.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium">Scope Reference</Label>
                <Input
                  value={scopeRef}
                  onChange={(e) => setScopeRef(e.target.value)}
                  placeholder="e.g. entity code or ID"
                  className="mt-1.5 h-8 text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium">Permissions</Label>
              <div className="mt-1.5 max-h-48 space-y-3 overflow-y-auto rounded-md border border-border p-2">
                {Object.entries(permsByModule).map(([moduleCode, perms]) => (
                  <div key={moduleCode}>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">{moduleCode}</p>
                    <div className="space-y-1">
                      {perms.map((p) => (
                        <label key={p.id} className="flex cursor-pointer items-center gap-2">
                          <Checkbox
                            checked={selectedPermIds.has(p.id)}
                            onCheckedChange={(checked) => {
                              setSelectedPermIds((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(p.id); else next.delete(p.id);
                                return next;
                              });
                            }}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-xs">{p.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {permissions.length === 0 && <p className="text-xs text-muted-foreground">Loading permissions…</p>}
              </div>
              {selectedPermIds.size > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">{selectedPermIds.size} selected</p>
              )}
            </div>

            <div>
              <Label className="text-xs font-medium">Expires At</Label>
              <div className="mt-1.5">
                <DatePicker
                  kind="instant"
                  value={expiresAt || null}
                  onChange={(next) => setExpiresAt(next ?? "")}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium">Reason (optional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you granting this delegation?"
                className="mt-1.5 text-xs"
                rows={2}
              />
            </div>

            {submitError && <p className="text-xs text-destructive">{submitError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { reset(); onOpenChange(false); }} disabled={submitting}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Granting…" : "Grant Delegation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

