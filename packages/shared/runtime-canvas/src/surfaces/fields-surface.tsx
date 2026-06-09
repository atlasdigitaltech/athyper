"use client";

import { useMemo } from "react";
import { WorkPanel } from "@athyper/surface-kit";
import {
  buildMetaEntityFieldGroups,
  evaluateMetaEntityFieldVisibility,
  formatFieldTitle,
  formatFieldValue,
} from "@athyper/runtime-shared/meta-entity";
import { RuntimeFieldValueView } from "../fields/runtime-field-value-view";
import type { RuntimeSurfaceRendererProps } from "./types";

const COLUMNS_CLASS: Record<1 | 2 | 3, string> = {
  1: "grid gap-3",
  2: "grid gap-3 md:grid-cols-2",
  3: "grid gap-3 md:grid-cols-2 lg:grid-cols-3",
};

export function FieldsSurfaceRenderer({
  contract,
  record,
  recordId,
  detailState,
  flags,
}: RuntimeSurfaceRendererProps) {
  const fieldGroups = useMemo(
    () => buildMetaEntityFieldGroups(contract, "detail"),
    [contract],
  );

  const recordData = record ?? {};
  const useSharedRenderers = flags?.sharedFieldRenderers ?? false;

  if (detailState?.status === "unavailable") {
    return (
      <FieldsUnavailableState
        message={detailState.message ?? "This record could not be loaded in the active organization scope."}
      />
    );
  }

  if (fieldGroups.length === 0) {
    return (
      <FieldsUnavailableState message="No fields are configured for detail view." />
    );
  }

  return (
    <div id={`record-${recordId}-fields`} className="flex flex-col gap-2.5">
      {fieldGroups.map((group) => {
        const visibleFields = group.fields.filter((field) => {
          const result = evaluateMetaEntityFieldVisibility(field, {
            surface: "detail",
            values: recordData,
            record: recordData,
          });
          return result.visible;
        });

        if (visibleFields.length === 0) return null;

        return (
          <WorkPanel key={group.key} title={group.label}>
            <dl className={COLUMNS_CLASS[group.columns]}>
              {visibleFields.map((field) => {
                const title = formatFieldTitle(recordData, field);

                return (
                  <div key={field.key} className="py-1">
                    <dt className="text-sm font-medium text-muted-foreground">
                      {field.label}
                    </dt>
                    <dd
                      title={title}
                      className="mt-0.5 truncate text-sm font-medium text-foreground"
                    >
                      {useSharedRenderers ? (
                        <RuntimeFieldValueView
                          field={field}
                          record={recordData}
                          sourceEntityCode={contract.entityCode}
                        />
                      ) : (
                        formatFieldValue(recordData, field)
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </WorkPanel>
        );
      })}
    </div>
  );
}

function FieldsUnavailableState({ message }: { message: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border bg-background p-6 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
