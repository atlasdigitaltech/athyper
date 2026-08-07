"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft, CheckCircle2, Clock3, GitCommitHorizontal, Rocket, RotateCcw, ShieldCheck } from "lucide-react";
import { Badge, Button, Input, Textarea } from "@athyper/platform-ui";
import type {
  MetaEntityActivityItem,
  MetaEntityCapabilities,
  MetaEntityChangeSetSummary,
  MetaEntityCheckpointResult,
  MetaEntityReleaseSummary,
} from "@athyper/meta-entity-authoring-contracts";
import { selectClassName } from "./editor-controls";

export type MetaEntityTransitionAction = "submit" | "return-to-draft" | "approve" | "reject" | "abandon";
export type MetaEntityReleaseAction = "publish" | "rollback" | "retire";

export interface MetaEntityReleaseDraft {
  revisionId: string;
  versionLabel?: string;
  rollbackOfReleaseId?: string;
  targetPlanes: readonly ("athyper" | "neon" | "mesh")[];
  minimumRuntimeVersion?: string;
  reason?: string;
  ticketReference?: string;
}

function shortHash(value: string): string {
  return value.length > 12 ? `${value.slice(0, 12)}…` : value;
}

export function HistoryPanel({
  revisions,
  releases,
  mutable,
  busy,
  changedPaths,
  onCheckpoint,
  onDiff,
}: {
  revisions: readonly MetaEntityCheckpointResult[];
  releases: readonly MetaEntityReleaseSummary[];
  mutable: boolean;
  busy: boolean;
  changedPaths: readonly string[] | null;
  onCheckpoint?: (compatibility: "backward_compatible" | "forward_compatible" | "full" | "breaking") => void;
  onDiff?: (leftRevisionId: string, rightRevisionId: string) => void;
}) {
  const [compatibility, setCompatibility] = useState<"backward_compatible" | "forward_compatible" | "full" | "breaking">("backward_compatible");
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const canCompare = left !== "" && right !== "" && left !== right;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-lg border border-border bg-card text-card-foreground">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-4">
          <div><h2 className="text-sm font-semibold text-foreground">Immutable checkpoints</h2><p className="mt-1 text-xs text-muted-foreground">Each checkpoint seals the canonical graph and its semantic paths.</p></div>
          <div className="flex items-end gap-2">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">Compatibility<select className={selectClassName} value={compatibility} onChange={(event) => setCompatibility(event.target.value as typeof compatibility)} disabled={busy || !mutable}><option value="backward_compatible">Backward compatible</option><option value="forward_compatible">Forward compatible</option><option value="full">Full</option><option value="breaking">Breaking</option></select></label>
            <Button size="sm" onClick={() => onCheckpoint?.(compatibility)} disabled={!onCheckpoint || !mutable || busy}><GitCommitHorizontal className="size-4" aria-hidden />Checkpoint</Button>
          </div>
        </div>
        <div className="divide-y divide-border">
          {!revisions.length && <p className="p-6 text-center text-sm text-muted-foreground">No checkpoints captured for this change set.</p>}
          {revisions.map((revision) => <div key={revision.id} className="flex items-start gap-3 p-4"><div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{revision.revisionNo}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-foreground">{shortHash(revision.contractHash)}</span><Badge variant={revision.validationStatus === "valid" ? "success" : "warning"}>{revision.validationStatus}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{new Date(revision.capturedAt).toLocaleString()} · {revision.changedPaths.length} changed paths</p></div></div>)}
        </div>
      </section>

      <div className="grid content-start gap-4">
        <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
          <div className="flex items-center gap-2"><ArrowRightLeft className="size-4 text-muted-foreground" aria-hidden /><h2 className="text-sm font-semibold text-foreground">Semantic diff</h2></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <select aria-label="Earlier checkpoint" className={selectClassName} value={left} onChange={(event) => setLeft(event.target.value)}><option value="">Earlier checkpoint</option>{revisions.map((revision) => <option key={revision.id} value={revision.id}>Revision {revision.revisionNo}</option>)}</select>
            <select aria-label="Later checkpoint" className={selectClassName} value={right} onChange={(event) => setRight(event.target.value)}><option value="">Later checkpoint</option>{revisions.map((revision) => <option key={revision.id} value={revision.id}>Revision {revision.revisionNo}</option>)}</select>
            <Button variant="outline" size="sm" disabled={!canCompare || !onDiff || busy} onClick={() => onDiff?.(left, right)}>Compare</Button>
          </div>
          {changedPaths && <div className="mt-4 max-h-56 overflow-y-auto rounded-md border border-border bg-muted p-3">{changedPaths.length ? <ul className="space-y-1">{changedPaths.map((path) => <li key={path} className="font-mono text-xs text-foreground">{path}</li>)}</ul> : <p className="text-sm text-muted-foreground">The selected contracts are semantically identical.</p>}</div>}
        </section>

        <section className="rounded-lg border border-border bg-card text-card-foreground">
          <div className="border-b border-border p-4"><h2 className="text-sm font-semibold text-foreground">Release ledger</h2><p className="mt-1 text-xs text-muted-foreground">Append-only publication, rollback, and retirement evidence.</p></div>
          <div className="divide-y divide-border">{!releases.length && <p className="p-6 text-center text-sm text-muted-foreground">This Entity has not been published.</p>}{releases.map((release) => <div key={release.id} className="flex items-start gap-3 p-4"><Rocket className="mt-0.5 size-4 text-muted-foreground" aria-hidden /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-foreground">Release {release.releaseNo}</span><Badge variant={release.releaseKind === "retire" ? "secondary" : release.releaseKind === "rollback" ? "warning" : "success"}>{release.releaseKind}</Badge>{release.versionLabel && <span className="font-mono text-xs text-muted-foreground">v{release.versionLabel}</span>}</div><p className="mt-1 text-xs text-muted-foreground">{release.targetPlanes.join(", ")} · {new Date(release.publishedAt).toLocaleString()}</p></div></div>)}</div>
        </section>
      </div>
    </div>
  );
}

export function ActivityPanel({ activity }: { activity: readonly MetaEntityActivityItem[] }) {
  return <section className="rounded-lg border border-border bg-card text-card-foreground"><div className="border-b border-border p-4"><h2 className="text-sm font-semibold text-foreground">Canonical audit activity</h2><p className="mt-1 text-xs text-muted-foreground">Evidence is read from audit.audit_log; it is not editable contract state.</p></div><div className="divide-y divide-border">{!activity.length && <p className="p-8 text-center text-sm text-muted-foreground">No canonical audit events are visible for this Entity.</p>}{activity.map((item) => <div key={item.id} className="flex gap-3 p-4"><Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-medium text-foreground">{item.eventCode}</span><Badge variant={item.outcome === "success" ? "success" : "destructive"}>{item.outcome}</Badge><span className="text-xs text-muted-foreground">{item.operation}</span></div><p className="mt-1 text-xs text-muted-foreground">{new Date(item.occurredAt).toLocaleString()}{item.actorPrincipalId ? ` · ${item.actorPrincipalId}` : " · system"}</p></div></div>)}</div></section>;
}

export function WorkflowPanel({
  changeSet,
  revisions,
  releases,
  capabilities,
  tenantOwned,
  busy,
  dirty,
  onTransition,
  onRelease,
}: {
  changeSet: MetaEntityChangeSetSummary;
  revisions: readonly MetaEntityCheckpointResult[];
  releases: readonly MetaEntityReleaseSummary[];
  capabilities: MetaEntityCapabilities;
  tenantOwned: boolean;
  busy: boolean;
  dirty: boolean;
  onTransition?: (action: MetaEntityTransitionAction, reason?: string) => void;
  onRelease?: (action: MetaEntityReleaseAction, draft: MetaEntityReleaseDraft) => void;
}) {
  const latestRevision = revisions[0] ?? null;
  const [reason, setReason] = useState("");
  const [ticketReference, setTicketReference] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [rollbackOfReleaseId, setRollbackOfReleaseId] = useState("");
  const [targetPlanes, setTargetPlanes] = useState<readonly ("athyper" | "neon" | "mesh")[]>(["neon"]);
  const actionDisabled = busy || dirty || !tenantOwned;
  const releaseDraft = useMemo<MetaEntityReleaseDraft | null>(() => latestRevision ? ({
    revisionId: latestRevision.id,
    versionLabel: versionLabel.trim() || undefined,
    rollbackOfReleaseId: rollbackOfReleaseId || undefined,
    targetPlanes,
    reason: reason.trim() || undefined,
    ticketReference: ticketReference.trim() || undefined,
  }) : null, [latestRevision, reason, rollbackOfReleaseId, targetPlanes, ticketReference, versionLabel]);
  const togglePlane = (plane: "athyper" | "neon" | "mesh") => setTargetPlanes((current) => current.includes(plane) ? current.filter((item) => item !== plane) : [...current, plane]);

  return <section className="border-b border-border bg-card px-4 py-3 text-card-foreground" aria-label="Change-set workflow"><div className="flex flex-wrap items-center gap-3"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-muted-foreground" aria-hidden /><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workflow</span><Badge variant="outline">{changeSet.status.replace("_", " ")}</Badge></div>{!tenantOwned && <span className="text-xs text-muted-foreground">Global package example: workflow is read-only under tenant authority.</span>}{dirty && <span className="text-xs text-warning">Save changes before a workflow action.</span>}<div className="ml-auto flex flex-wrap gap-2">{(changeSet.status === "draft" || changeSet.status === "rejected") && capabilities.author && <><Button size="sm" variant="outline" disabled={actionDisabled || !onTransition} onClick={() => onTransition?.("abandon")}>Abandon</Button><Button size="sm" disabled={actionDisabled || !latestRevision || !onTransition} onClick={() => onTransition?.("submit")}><CheckCircle2 className="size-4" aria-hidden />Submit for review</Button></>}{changeSet.status === "in_review" && capabilities.review && <><Button size="sm" variant="outline" disabled={actionDisabled || !onTransition} onClick={() => onTransition?.("return-to-draft", reason)}>Return to draft</Button><Button size="sm" variant="destructive" disabled={actionDisabled || !reason.trim() || !onTransition} onClick={() => onTransition?.("reject", reason)}>Reject</Button><Button size="sm" disabled={actionDisabled || !onTransition} onClick={() => onTransition?.("approve")}><CheckCircle2 className="size-4" aria-hidden />Approve</Button></>}</div></div>
    {(changeSet.status === "in_review" || changeSet.status === "approved") && <div className="mt-3 grid gap-3 rounded-md border border-border bg-muted p-3 lg:grid-cols-3"><label className="grid gap-1 text-xs font-medium text-muted-foreground">Decision reason<Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={changeSet.status === "in_review" ? "Required when rejecting" : "Required for rollback or retirement"} className="min-h-20 bg-background" /></label>{changeSet.status === "approved" && <><div className="grid content-start gap-3"><label className="grid gap-1 text-xs font-medium text-muted-foreground">Version label<Input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} placeholder="2.1.0" className="bg-background" /></label><label className="grid gap-1 text-xs font-medium text-muted-foreground">Ticket reference<Input value={ticketReference} onChange={(event) => setTicketReference(event.target.value)} placeholder="META-123" className="bg-background" /></label></div><div className="grid content-start gap-3"><fieldset><legend className="text-xs font-medium text-muted-foreground">Target planes</legend><div className="mt-2 flex flex-wrap gap-3">{(["athyper", "neon", "mesh"] as const).map((plane) => <label key={plane} className="flex items-center gap-2 text-xs text-foreground"><input type="checkbox" checked={targetPlanes.includes(plane)} onChange={() => togglePlane(plane)} className="size-4 accent-primary" />{plane}</label>)}</div></fieldset>{releases.length > 0 && <label className="grid gap-1 text-xs font-medium text-muted-foreground">Rollback target<select className={`${selectClassName} bg-background`} value={rollbackOfReleaseId} onChange={(event) => setRollbackOfReleaseId(event.target.value)}><option value="">Select prior release</option>{releases.map((release) => <option key={release.id} value={release.id}>Release {release.releaseNo}{release.versionLabel ? ` · v${release.versionLabel}` : ""}</option>)}</select></label>}<div className="flex flex-wrap gap-2">{capabilities.publish && <Button size="sm" disabled={actionDisabled || !releaseDraft || targetPlanes.length === 0 || !onRelease} onClick={() => releaseDraft && onRelease?.("publish", releaseDraft)}><Rocket className="size-4" aria-hidden />Publish</Button>}{capabilities.rollback && <Button size="sm" variant="outline" disabled={actionDisabled || !releaseDraft || !rollbackOfReleaseId || !reason.trim() || !ticketReference.trim() || !onRelease} onClick={() => releaseDraft && onRelease?.("rollback", releaseDraft)}><RotateCcw className="size-4" aria-hidden />Rollback</Button>}{capabilities.retire && <Button size="sm" variant="destructive" disabled={actionDisabled || !releaseDraft || !reason.trim() || !ticketReference.trim() || !onRelease} onClick={() => releaseDraft && onRelease?.("retire", releaseDraft)}>Retire</Button>}</div></div></>}</div>}
  </section>;
}
