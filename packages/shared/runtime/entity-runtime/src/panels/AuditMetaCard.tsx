"use client";

import { fmtDateTime } from "@athyper/runtime-shared/core";

export interface AuditMetaCardProps {
  createdAt?: unknown;
  createdBy?: unknown;
  updatedAt?: unknown;
  updatedBy?: unknown;
}

/**
 * Two-row audit summary card shown at the top of the Activity panel.
 * Consistent across simple entity, master entity, and approvable document.
 */
export function AuditMetaCard({ createdAt, createdBy, updatedAt, updatedBy }: AuditMetaCardProps) {
  if (!createdAt && !updatedAt) return null;

  return (
    <div className="mb-4 space-y-1.5 px-1">
      {!!createdAt && (
        <div className="flex items-center gap-3 text-xs">
          <span className="w-24 shrink-0 font-normal text-muted-foreground">Created</span>
          <span className="text-muted-foreground tabular-nums">{fmtDateTime(createdAt)}</span>
          {!!createdBy && (
            <span className="text-muted-foreground/60 truncate">· {String(createdBy)}</span>
          )}
        </div>
      )}
      {!!updatedAt && (
        <div className="flex items-center gap-3 text-xs">
          <span className="w-24 shrink-0 font-normal text-muted-foreground">Last Updated</span>
          <span className="text-muted-foreground tabular-nums">{fmtDateTime(updatedAt)}</span>
          {!!updatedBy && (
            <span className="text-muted-foreground/60 truncate">· {String(updatedBy)}</span>
          )}
        </div>
      )}
    </div>
  );
}
