/**
 * @athyper/workflow-ui — Approval Panel
 *
 * Rec 14: Full approval redesign with quorum, stage mode, SLA,
 * and reassignment trail from log.workflow_event_log.
 */
import { CheckCircle, XCircle, Clock, Forward, AlertTriangle, Users } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Card, CardContent, CardHeader, CardTitle, Badge, Separator } from "@athyper/ui/primitives";
import { resolveSemanticColors } from "@athyper/theme/semantic-colors";
import {
  type ApprovalContext,
  type WorkflowStageDetail,
  type WorkItem,
  type WorkflowEvent,
} from "@athyper/api-contracts/workflow";

export interface ApprovalPanelProps {
  context: ApprovalContext;
  eventTrail?: WorkflowEvent[];
  className?: string;
}

export function ApprovalPanel({ context, eventTrail, className }: ApprovalPanelProps) {
  const { stages, behaviors, current_stage_index } = context;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Behavior flags */}
      <div className="flex flex-wrap gap-2">
        {behaviors.allow_self_approval && <Badge variant="muted">Self-approval allowed</Badge>}
        {behaviors.allow_reassignment && <Badge variant="muted">Reassignment allowed</Badge>}
        {behaviors.require_reason_on_reject && <Badge variant="muted">Reason required on reject</Badge>}
        {behaviors.early_reject_on_quorum_fail && <Badge variant="warning">Early reject on quorum fail</Badge>}
      </div>

      {stages.map((stage, i) => (
        <StageCard
          key={stage.id}
          stage={stage}
          isCurrent={i === current_stage_index}
          events={eventTrail?.filter((e) => e.id === stage.id) ?? []}
        />
      ))}
    </div>
  );
}

interface StageCardProps {
  stage: WorkflowStageDetail;
  isCurrent: boolean;
  events: WorkflowEvent[];
}

function StageCard({ stage, isCurrent, events }: StageCardProps) {
  const stageIntent = stage.status === "completed" ? "success"
    : stage.status === "rejected" ? "error"
    : stage.status === "active" ? "info"
    : "muted";

  const colors = resolveSemanticColors(stageIntent);

  return (
    <Card className={cn(isCurrent && "ring-1 ring-primary")}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">
              Stage {stage.stage_order}: {stage.stage_name}
            </CardTitle>
            <Badge variant={stageIntent === "success" ? "success" : stageIntent === "error" ? "destructive" : "outline"} className="text-[10px]">
              {stage.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="muted" className="text-[10px]">
              {stage.stage_mode === "PARALLEL" ? <Users className="mr-1 h-3 w-3 inline" /> : null}
              {stage.stage_mode}
            </Badge>
          </div>
        </div>

        {stage.quorum_progress && (
          <div className="mt-1 text-xs text-muted-foreground">
            Quorum: {stage.quorum.strategy} — {stage.quorum_progress.approved_count}/{stage.quorum_progress.total_count} approved
            {stage.quorum.required != null && ` (need ${stage.quorum.required})`}
            {stage.quorum_progress.is_met && <CheckCircle className="ml-1 inline h-3 w-3 text-success" />}
          </div>
        )}
      </CardHeader>

      <CardContent>
        <div className="space-y-2">
          {stage.work_items.map((item) => (
            <WorkItemRow key={item.id} item={item} />
          ))}
        </div>

        {events.length > 0 && (
          <>
            <Separator className="my-3" />
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase text-muted-foreground">Trail</p>
              {events.map((event) => (
                <div key={event.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-32 shrink-0">{new Date(event.created_at).toLocaleString()}</span>
                  <span>{event.actor_name ?? "System"}</span>
                  <span>— {event.action ?? event.event_type}</span>
                  {event.comment && <span className="italic">"{event.comment}"</span>}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function WorkItemRow({ item }: { item: WorkItem }) {
  const statusIcon = {
    approved: <CheckCircle className="h-3.5 w-3.5 text-success" />,
    rejected: <XCircle className="h-3.5 w-3.5 text-destructive" />,
    pending: <Clock className="h-3.5 w-3.5 text-warning" />,
    delegated: <Forward className="h-3.5 w-3.5 text-info" />,
    timed_out: <AlertTriangle className="h-3.5 w-3.5 text-destructive" />,
  }[item.status] ?? <Clock className="h-3.5 w-3.5 text-muted-foreground" />;

  return (
    <div className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2">
      {statusIcon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{item.assignee_id.slice(0, 8)}…</span>
          <Badge variant="muted" className="text-[10px]">{item.assignee_type}</Badge>
          {item.delegated_to && (
            <span className="text-xs text-muted-foreground">
              → delegated to {item.delegated_to.slice(0, 8)}…
            </span>
          )}
        </div>
        {item.remarks && (
          <p className="mt-0.5 text-xs text-muted-foreground italic">"{item.remarks}"</p>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {item.decision_at ? new Date(item.decision_at).toLocaleDateString() : "Pending"}
      </div>
    </div>
  );
}
