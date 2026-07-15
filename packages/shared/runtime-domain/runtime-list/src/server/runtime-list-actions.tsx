import { Plus } from "lucide-react";
import type { ResolvedToolbarAction } from "../core/types";
import { runtimeListText } from "../core/resources";

interface RuntimeListActionsProps {
  createHref:     string | null;
  toolbarActions: ResolvedToolbarAction[];
}

export function RuntimeListActions({ createHref, toolbarActions }: RuntimeListActionsProps) {
  const btnCls = "inline-flex h-8 items-center gap-1.5 rounded-md border bg-foreground px-3 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50";
  const secCls = "inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50";

  return (
    <div className="flex items-center gap-2">
      {createHref && (
        <a href={createHref} className={btnCls}>
          <Plus className="size-4" />
          {runtimeListText.actions.createNew}
        </a>
      )}
      {toolbarActions
        .filter((a) => !a.disabled)
        .map((a) => (
          <a key={a.key} href={a.href} className={secCls}>
            {a.label}
          </a>
        ))}
    </div>
  );
}
