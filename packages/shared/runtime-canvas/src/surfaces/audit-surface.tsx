"use client";

import { WorkPanel } from "@athyper/surface-kit";
import { formatRecordValue, toNonBlankString } from "@athyper/runtime-shared/meta-entity";
import type { RuntimeSurfaceRendererProps } from "./types";

const AUDIT_FIELDS = [
  { name: "created_at", label: "Created At" },
  { name: "created_by", label: "Created By" },
  { name: "updated_at", label: "Updated At" },
  { name: "updated_by", label: "Updated By" },
  { name: "status_changed_at", label: "Status Changed At" },
  { name: "status_changed_by", label: "Status Changed By" },
] as const;

export function AuditSummarySurfaceRenderer({
  contract,
  record,
}: RuntimeSurfaceRendererProps) {
  const policy = contract.policy;
  const recordData = record ?? {};
  const data = isRecord(recordData["data"]) ? recordData["data"] : {};

  const auditFieldEntries = AUDIT_FIELDS.map(({ name, label }) => {
    const value = data[name] ?? recordData[name];
    const text = toNonBlankString(value);
    return { label, value: text ?? formatRecordValue(value) };
  }).filter(({ value }) => value !== "-");

  return (
    <WorkPanel title="Audit Summary">
      <div className="flex flex-col gap-4">
        {auditFieldEntries.length > 0 ? (
          <dl className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {auditFieldEntries.map(({ label, value }) => (
              <div key={label} className="rounded-md border bg-background p-3">
                <dt className="text-xs font-medium text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-1 truncate text-sm font-medium text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <dl className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {policy.auditMode ? (
            <div className="rounded-md border bg-background p-3">
              <dt className="text-xs font-medium text-muted-foreground">Audit Mode</dt>
              <dd className="mt-1 truncate text-sm font-medium text-foreground capitalize">{policy.auditMode}</dd>
            </div>
          ) : null}
          {policy.securityTier ? (
            <div className="rounded-md border bg-background p-3">
              <dt className="text-xs font-medium text-muted-foreground">Security Tier</dt>
              <dd className="mt-1 truncate text-sm font-medium text-foreground capitalize">{policy.securityTier}</dd>
            </div>
          ) : null}
          {policy.governanceLevel ? (
            <div className="rounded-md border bg-background p-3">
              <dt className="text-xs font-medium text-muted-foreground">Governance Level</dt>
              <dd className="mt-1 truncate text-sm font-medium text-foreground capitalize">{policy.governanceLevel}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </WorkPanel>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
