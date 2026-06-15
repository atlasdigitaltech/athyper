"use client";

import {
  AuditSummaryStrip,
  resolveAuditSummaryData,
} from "../header/AuditSummaryStrip";
import type { RuntimeSurfaceRendererProps } from "./types";

export function AuditSummarySurfaceRenderer({
  contract,
  record,
  recordId,
}: RuntimeSurfaceRendererProps) {
  const audit = resolveAuditSummaryData({
    record,
    recordId,
  });

  return (
    <AuditSummaryStrip
      {...audit}
      title={`${contract.entityName} Audit Summary`}
    />
  );
}
