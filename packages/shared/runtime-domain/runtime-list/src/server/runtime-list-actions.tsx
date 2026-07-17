import { Plus } from "lucide-react";
import { Button } from "@athyper/ui";
import type { ResolvedToolbarAction } from "../core/types";
import { runtimeListText } from "../core/resources";

interface RuntimeListActionsProps {
  createHref:     string | null;
  toolbarActions: ResolvedToolbarAction[];
}

export function RuntimeListActions({ createHref, toolbarActions }: RuntimeListActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {createHref && (
        <Button asChild variant="primary" size="sm">
          <a href={createHref}>
            <Plus aria-hidden="true" className="size-4" />
            {runtimeListText.actions.createNew}
          </a>
        </Button>
      )}
      {toolbarActions
        .filter((a) => !a.disabled)
        .map((a) => (
          <Button key={a.key} asChild variant="ghost" size="sm">
            <a href={a.href}>{a.label}</a>
          </Button>
        ))}
    </div>
  );
}
