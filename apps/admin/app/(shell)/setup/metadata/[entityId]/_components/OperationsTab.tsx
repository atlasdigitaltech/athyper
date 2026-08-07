"use client";

import { WorkPanel } from "@athyper/platform-surface-kit";
import { Badge } from "@athyper/platform-ui";

export function OperationsTab({ entityName }: { entityName: string }) {
  return (
    <WorkPanel title="Operations" description="Commands and action presentation are owned by the Contract v2 operations section.">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">Canonical owner: operations</Badge>
        <span className="text-muted-foreground">Use the Contracts tab to edit operation code, permission, handler, confirmation, and placement for {entityName}.</span>
      </div>
    </WorkPanel>
  );
}
