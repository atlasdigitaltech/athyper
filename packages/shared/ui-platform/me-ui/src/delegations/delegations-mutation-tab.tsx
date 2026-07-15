"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { Badge, Button } from "@athyper/ui/primitives";
import { bffFetch, BffError } from "@athyper/runtime-shared/client";
import type { DelegationsMyList } from "@athyper/api-contracts/iam";

import { InfoRow, SectionCard, Banner, SkeletonCard, StatusBadge, str, fmtDate } from "../_shared";
import { StepUpDialog } from "./step-up-dialog";
import { GrantDelegationDialog } from "./grant-delegation-dialog";

const QK_DELEGATIONS_MY = ["iam-delegations-my"] as const;

/**
 * Self-service delegations tab — list given + received, grant new, revoke own.
 * Both mutations are gated by MFA step-up via <StepUpDialog>; on 403 the
 * dialog opens and the original mutation replays after success.
 */
export function DelegationsMutationTab() {
  const queryClient = useQueryClient();
  const [grantOpen, setGrantOpen]             = useState(false);
  const [stepUpOpen, setStepUpOpen]           = useState(false);
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);
  const [revokeError, setRevokeError]         = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: QK_DELEGATIONS_MY,
    queryFn: () => bffFetch<DelegationsMyList>("/api/iam/delegations/my"),
    staleTime: 0,
  });

  async function handleRevoke(id: string) {
    setRevokeError(null);
    try {
      await bffFetch(`/api/iam/delegations/${id}/revoke-own`, { method: "POST" });
      void queryClient.invalidateQueries({ queryKey: QK_DELEGATIONS_MY });
    } catch (err) {
      if (err instanceof BffError && err.status === 403) {
        setPendingRevokeId(id);
        setStepUpOpen(true);
        return;
      }
      const msg = err instanceof BffError ? err.message : "Failed to revoke delegation";
      setRevokeError(msg);
    }
  }

  const given    = data?.given    ?? [];
  const received = data?.received ?? [];
  const activeGiven  = given.filter((d) => !d.is_revoked);
  const revokedGiven = given.filter((d) => d.is_revoked);
  const activeReceived = received.filter((d) => !d.is_revoked);

  if (isLoading) return <SkeletonCard lines={4} />;
  if (isError)   return <Banner variant="warn">Failed to load delegations.</Banner>;

  return (
    <>
      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        actionClass="delegation_accept"
        onElevated={() => {
          if (pendingRevokeId) {
            const id = pendingRevokeId;
            setPendingRevokeId(null);
            void handleRevoke(id);
          }
        }}
      />
      <GrantDelegationDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        onGranted={() => void queryClient.invalidateQueries({ queryKey: QK_DELEGATIONS_MY })}
      />

      {revokeError && <Banner variant="warn">{revokeError}</Banner>}

      <SectionCard
        title="Delegations Given"
        icon={RefreshCw}
        badge={<Badge variant="warning" className="text-xs">{activeGiven.length} active</Badge>}
        managedBy={{
          manager: "You",
          source: "master.delegation_grant (delegator_id = you)",
          editPath: "Use the Grant button to create a new delegation",
        }}
      >
        <div className="mb-3">
          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setGrantOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Grant Delegation
          </Button>
        </div>

        {activeGiven.length > 0 ? (
          activeGiven.map((d) => (
            <div key={d.id} className="mb-3 last:mb-0 rounded-md bg-muted p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-foreground">To: {str(d.delegate_name ?? d.delegate_id)}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status="active">Active</StatusBadge>
                  <Button
                    variant="ghost" size="sm"
                    className="h-6 gap-1 text-xs text-destructive hover:text-destructive"
                    onClick={() => void handleRevoke(d.id)}
                  >
                    <Trash2 className="h-3 w-3" /> Revoke
                  </Button>
                </div>
              </div>
              <InfoRow label="Scope"   value={`${d.scope_type}${d.scope_ref ? `: ${d.scope_ref}` : ""}`} />
              <InfoRow label="Reason"  value={str(d.reason)} />
              <InfoRow label="Expires" value={fmtDate(d.expires_at)} />
              {d.permissions.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Permissions</p>
                  <div className="flex flex-wrap gap-1">
                    {d.permissions.map((p) => (
                      <span key={p} className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-xs">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">No active delegations granted.</p>
        )}

        {revokedGiven.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              {revokedGiven.length} revoked delegations
            </summary>
            <div className="mt-2 space-y-2">
              {revokedGiven.map((d) => (
                <div key={d.id} className="rounded-md bg-muted/50 p-2 opacity-60">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">To: {str(d.delegate_name ?? d.delegate_id)}</p>
                    <StatusBadge status="suspended">Revoked</StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {d.scope_type}{d.scope_ref ? `: ${d.scope_ref}` : ""} · Expires: {fmtDate(d.expires_at)}
                  </p>
                </div>
              ))}
            </div>
          </details>
        )}
      </SectionCard>

      <SectionCard
        title="Delegations Received"
        icon={RefreshCw}
        badge={<Badge variant="warning" className="text-xs">{activeReceived.length} active</Badge>}
        managedBy={{
          manager: "Delegators",
          source: "master.delegation_grant (delegate_id = you)",
          editPath: "Contact the delegator to modify or revoke",
        }}
      >
        {activeReceived.length > 0 ? (
          activeReceived.map((d) => (
            <div key={d.id} className="mb-3 last:mb-0 rounded-md bg-muted p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">From: {str(d.delegator_name ?? d.delegator_id)}</span>
                <StatusBadge status="active">Active</StatusBadge>
              </div>
              <InfoRow label="Scope Type" value={str(d.scope_type)} />
              <InfoRow label="Scope Ref"  value={str(d.scope_ref)} mono />
              <InfoRow label="Reason"     value={str(d.reason)} />
              <InfoRow label="Expires"    value={fmtDate(d.expires_at)} hint="Delegation expires at this date" />
              {d.permissions.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Delegated Permissions</p>
                  <div className="flex flex-wrap gap-1">
                    {d.permissions.map((p) => (
                      <span key={p} className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-xs">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">No delegations received.</p>
        )}
      </SectionCard>
    </>
  );
}


