import { type WorkflowEvent } from "@athyper/api-contracts/workflow";
import { formatDate } from "../utils/formatDate";

interface WorkflowEventTrailProps {
  events: WorkflowEvent[];
}

export function WorkflowEventTrail({ events }: WorkflowEventTrailProps) {
  if (!events.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted-foreground mb-1">Trail</p>
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-start gap-2 text-xs text-muted-foreground"
        >
          <span className="w-32 shrink-0">{formatDate(event.created_at)}</span>
          <span>{event.actor_name ?? "System"}</span>
          <span>— {event.action ?? event.event_type}</span>
          {event.comment && <span className="italic">"{event.comment}"</span>}
        </div>
      ))}
    </div>
  );
}
