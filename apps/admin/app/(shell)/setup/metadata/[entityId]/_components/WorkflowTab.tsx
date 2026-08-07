"use client";

import { WorkPanel } from "@athyper/platform-surface-kit";
import { Badge } from "@athyper/platform-ui";
import type { EntityDetail } from "./types";

export function WorkflowTab({ entity }: { entity: EntityDetail }) {
  return (
    <WorkPanel title="Flows" description="Create flows are owned by Meta Entity Contract v2 and are edited with the complete DRAFT graph.">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">Canonical owner: flows</Badge>
        <span className="text-muted-foreground">Use the Contracts tab to edit flow composition for {entity.entity_code ?? entity.name}.</span>
      </div>
    </WorkPanel>
  );
}
