"use client";

/**
 * RowActionMenu — per-row ⋯ dropdown of record-required DETAIL operations.
 * Extracted from EntityListPage to allow import by RowMetaStrip.
 */

import { useState } from "react";
import { Loader2, MoreHorizontal } from "lucide-react";
import { resolveActionsForSurface } from "@athyper/metadata-client/operation-reader";
import type { EntityOperation } from "@athyper/api-contracts/metadata";

export function RowActionMenu({
  row,
  entityCode,
  operations,
}: {
  row:        Record<string, unknown>;
  entityCode: string;
  operations: EntityOperation[];
}) {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);

  const recordId = String(row.id ?? "");

  const rowOps = resolveActionsForSurface(operations, "DETAIL").filter(
    (a) => a.requiresRecord && a.handlerType !== "NAVIGATE",
  );

  if (rowOps.length === 0) return null;

  const dispatch = async (action: ReturnType<typeof resolveActionsForSurface>[number]) => {
    setOpen(false);
    if (!recordId) return;
    setLoading(true);
    try {
      const code = action.permissionCode.split(".").pop() ?? action.permissionCode;
      await fetch(`/api/relay/api/records/${entityCode}/${recordId}/action/${code}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({}),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex justify-end">
      <button
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        aria-label="Row actions"
      >
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <MoreHorizontal className="h-4 w-4" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-0.5 w-44 rounded-lg border bg-popover py-1 shadow-md">
            {rowOps.map((action) => (
              <button
                key={action.permissionCode}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
                onClick={() => void dispatch(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
