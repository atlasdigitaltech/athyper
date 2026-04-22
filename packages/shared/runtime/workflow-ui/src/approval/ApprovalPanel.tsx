import { Users } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  Card, CardContent, CardHeader, CardTitle,
  Badge, Separator, Skeleton,
} from "@athyper/ui/primitives";
import {
  type ApprovalContext,
  type WorkflowStageDetail,
  type WorkItem,
  type WorkflowEvent,
} from "@athyper/api-contracts/workflow";
import { stageIntentFromStatus } from "../utils/stageIntent";
import { intentToBadgeVariant } from "../utils/intentToBadgeVariant";
import { workflowStatusIcon } from "../utils/workflowStatusIcon";
import { formatDate } from "../utils/formatDate";
import { WorkflowEventTrail } from "../events/WorkflowEventTrail";

export interface ApprovalPanelProps {
  context: ApprovalContext | null;
  eventTrail?: WorkflowEvent[];
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

export function ApprovalPanel({
  context,
  eventTrail,
  isLoading,
  error,
  className,
}: ApprovalPanelProps) {
  if (isLoading || !context) {
    return (
      <div className={cn("space-y-4", className)}>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "rounded-md border border-destructive/30 bg-destructive/10 p-3",
          "[font-size:var(--doc-support-size)] text-destructive",
          className,
        )}
      >
        {error}
      </div>
    );
  }

  const { stages, behaviors, current_stage_index } = context;

  if (!stages.length) {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed p-6 text-center",
          "[font-size:var(--doc-support-size)] text-muted-foreground",
          className,
        )}
      >
        No approval stages configured
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap gap-2">
        {behaviors.allow_self_approval && (
          <Badge variant="muted" className="[font-size:var(--doc-badge-size)]">
            Self-approval allowed
          </Badge>
        )}
        {behaviors.allow_reassignment && (
          <Badge variant="muted" className="[font-size:var(--doc-badge-size)]">
            Reassignment allowed
          </Badge>
        )}
        {behaviors.require_reason_on_reject && (
          <Badge variant="muted" className="[font-size:var(--doc-badge-size)]">
            Reason required on reject
          </Badge>
        )}
        {behaviors.early_reject_on_quorum_fail && (
          <Badge variant="warning" className="[font-size:var(--doc-badge-size)]">
            Early reject on quorum fail
          </Badge>
        )}
      </div>

      {stages.map((stage, i) => (
        <StageCard
          key={stage.id}
          stage={stage}
          isCurrent={i === current_stage_index}
          events={eventTrail?.filter((e) => e.stage_id === stage.id) ?? []}
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
  const intent = stageIntentFromStatus(stage.status);

  return (
    <Card className={cn(isCurrent && "ring-1 ring-primary")}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="[font-size:var(--doc-field-value-size)]">
              Stage {stage.stage_order}: {stage.stage_name}
            </CardTitle>
            <Badge
              variant={intentToBadgeVariant(intent)}
              className="[font-size:var(--doc-badge-size)]"
            >
              {stage.status}
            </Badge>
          </div>
          <Badge variant="muted" className="flex items-center gap-1 [font-size:var(--doc-badge-size)]">
            {stage.stage_mode === "PARALLEL" && (
              <Users aria-hidden className="h-3 w-3" />
            )}
            {stage.stage_mode}
          </Badge>
        </div>

        {stage.quorum_progress && stage.quorum && (
          <div className="mt-1 flex items-center gap-1 [font-size:var(--doc-support-size)] text-muted-foreground">
            <span>
              Quorum: {stage.quorum.strategy} —{" "}
              {stage.quorum_progress.approved_count}/{stage.quorum_progress.total_count} approved
              {stage.quorum.required != null && ` (need ${stage.quorum.required})`}
            </span>
            {stage.quorum_progress.is_met && workflowStatusIcon("approved")}
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
            <WorkflowEventTrail events={events} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function WorkItemRow({ item }: { item: WorkItem }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2">
      {workflowStatusIcon(item.status)}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="[font-size:var(--doc-field-value-size)] font-medium">
            {item.assignee_name ?? `${item.assignee_id.slice(0, 8)}…`}
          </span>
          <Badge variant="muted" className="[font-size:var(--doc-badge-size)]">
            {item.assignee_type}
          </Badge>
          {item.delegated_to && (
            <span className="[font-size:var(--doc-support-size)] text-muted-foreground">
              → {item.delegated_to_name ?? `${item.delegated_to.slice(0, 8)}…`}
            </span>
          )}
        </div>
        {item.remarks && (
          <p className="mt-0.5 italic [font-size:var(--doc-support-size)] text-muted-foreground">
            "{item.remarks}"
          </p>
        )}
      </div>
      <div className="[font-size:var(--doc-support-size)] text-muted-foreground">
        {item.decision_at ? formatDate(item.decision_at, "date") : "Pending"}
      </div>
    </div>
  );
}
