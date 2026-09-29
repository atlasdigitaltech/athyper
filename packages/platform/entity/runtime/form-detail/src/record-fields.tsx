"use client";
import type { EntityDetailDescriptorV1, EntityRecordV1 } from "@athyper/contract-platform-entity-runtime";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
export function EntityRecordFields({descriptor,record,fieldKeys}: {descriptor:EntityDetailDescriptorV1;record:EntityRecordV1;fieldKeys:readonly string[]}) {
 const intl = useEntityI18n();
 return (
                      <dl className="a-record-detail-fields">
                        {fieldKeys
                          .flatMap(
                            (key) =>
                              descriptor.fields.find(
                                (field) => field.key === key,
                              ) ?? [],
                          )
                          .map((field) => {
                            const value = record.values[field.key];
                            const temporal =
                              (field.kind === "date" ||
                                field.kind === "datetime") &&
                              typeof value === "string" &&
                              Number.isFinite(Date.parse(value));
                            return (
                              <div key={field.key}>
                                <dt>{field.label}</dt>
                                <dd>
                                  {temporal ? (
                                    <time
                                      dateTime={value as string}
                                      title={value as string}
                                    >
                                      {intl
                                        ? intl.date(
                                            value as string,
                                            field.kind === "date"
                                              ? {
                                                  dateStyle: "medium",
                                                  timeZone: "UTC",
                                                }
                                              : {
                                                  dateStyle: "medium",
                                                  timeStyle: "short",
                                                },
                                          )
                                        : display(value)}
                                    </time>
                                  ) : (
                                    typeof value === "boolean" ? intl.message(value ? "entity.value.yes" : "entity.value.no") : typeof value === "number" && Number.isFinite(value) ? intl.number(value, {maximumFractionDigits:20}) : display(value)
                                  )}
                                </dd>
                              </div>
                            );
                          })}
                      </dl>
 );
}
function display(value: unknown): string {
  return value === null || value === undefined || value === ""
    ? "—"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
}
