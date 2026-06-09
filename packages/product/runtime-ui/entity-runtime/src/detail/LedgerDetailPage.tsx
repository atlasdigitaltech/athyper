"use client";

/**
 * LedgerDetailPage — read-only detail shell for immutable entity classes:
 *   LEDGER / LOG / AGGREGATE (detail_renderer="ledger").
 *
 * No edit mode. Only NAVIGATE operations are surfaced in the header.
 * Field layout comes from resolveDetailConfig (header fields + grouped sections).
 * An Activity tab is always appended for the audit trail.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@athyper/ui/primitives";
import type { CompiledEntity, EntityOperation } from "@athyper/api-contracts/metadata";
import type { HeaderTab } from "../header/types";
import { EntityHeader } from "../header/EntityHeader";
import { buildLedgerHeaderModel } from "../header/builders/buildLedgerHeaderModel";
import { resolveDetailConfig, resolveMasterConfig } from "@athyper/metadata-client/compiled-reader";
import { resolveFieldRenderer } from "../field-renderers/registry";
import { EventsPanel } from "../panels";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface LedgerDetailPageProps {
  entity:     CompiledEntity;
  record:     { id: string; data: Record<string, unknown>; status?: string };
  operations: EntityOperation[] | undefined;
  recordId:   string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LedgerDetailPage({
  entity,
  record,
  operations,
  recordId,
}: LedgerDetailPageProps) {
  const router       = useRouter();
  const data         = record.data;
  const config       = resolveMasterConfig(entity);
  const detailConfig = resolveDetailConfig(entity);

  const sectionTabs: HeaderTab[] = detailConfig.sections.map((s) => ({
    id:    s.group.group_key,
    label: s.group.label,
  }));

  const allTabs: HeaderTab[] = [
    ...sectionTabs,
    { id: "__activity", label: "Activity" },
  ];

  const [activeTab, setActiveTab] = useState(allTabs[0]?.id ?? "");

  const headerModel = buildLedgerHeaderModel(
    entity, data,
    {
      type_label:           config.type_label,
      classification_field: config.classification_field,
      header_facts:         config.header_facts,
    },
    allTabs.length > 1 ? allTabs : undefined,
    recordId,
    operations,
  );

  function handleAction(id: string) {
    const op = (operations ?? []).find((o) => o.permission_code === id);
    if (!op || op.handler_type !== "NAVIGATE" || !op.handler_target) return;
    router.push(op.handler_target.replace("{id}", encodeURIComponent(recordId)));
  }

  return (
    <>
      <EntityHeader
        model={headerModel}
        onBack={() => router.back()}
        onAction={handleAction}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div className="flex flex-col gap-2.5">
        {/* Identity / key fields card */}
        {detailConfig.headerFields.length > 0 && (
          <Card>
            <CardContent className="pt-5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
                {detailConfig.headerFields.map((field) => {
                  const Renderer = resolveFieldRenderer(field);
                  return (
                    <div key={field.name}>
                      <dt className="text-xs font-medium text-muted-foreground leading-normal mb-1">
                        {field.label ?? field.name}
                      </dt>
                      <dd className="text-sm font-normal text-foreground leading-snug">
                        <Renderer value={data[field.name]} field={field} mode="view" />
                      </dd>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section tabs */}
        {detailConfig.sections.map((section) =>
          activeTab === section.group.group_key ? (
            <Card key={section.group.group_key}>
              <CardContent className="pt-5">
                <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
                  {section.fields.map((field) => {
                    const Renderer = resolveFieldRenderer(field);
                    return (
                      <div key={field.name}>
                        <dt className="text-xs font-medium text-muted-foreground leading-normal mb-1">
                          {field.label ?? field.name}
                        </dt>
                        <dd className="text-sm font-normal text-foreground leading-snug">
                          <Renderer value={data[field.name]} field={field} mode="view" />
                        </dd>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null,
        )}

        {/* Activity tab — always present, shows the full audit trail */}
        {activeTab === "__activity" && (
          <Card>
            <CardContent className="pt-5">
              <EventsPanel
                entityCode={entity.entity_code}
                recordId={recordId}
                recordUuid={record.id}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
