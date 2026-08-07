import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@athyper/platform-ui";
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
          <Link href={createHref}>
            <Plus aria-hidden="true" className="size-4" />
            {runtimeListText.actions.createNew}
          </Link>
        </Button>
      )}
      {toolbarActions
        .filter((a) => !a.disabled)
        .map((a) => (
          <Button key={a.key} asChild variant="ghost" size="sm">
            <Link href={a.href}>{a.label}</Link>
          </Button>
        ))}
    </div>
  );
}
