"use client";
import type { EntityDetailDescriptorV1, EntityRecordV1 } from "@athyper/contract-platform-entity-runtime";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { formatEntityValue } from "@athyper/platform-i18n/entity-value";
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
                            return (
                              <div key={field.key}>
                                <dt>{field.label}</dt>
                                <dd>
                                  {(field.kind === "date" || field.kind === "datetime") && typeof value === "string" && Number.isFinite(Date.parse(value)) ? (
                                    <time
                                      dateTime={value as string}
                                      title={value as string}
                                    >
                                      {formatEntityValue(value, field, intl)}
                                    </time>
                                  ) : (
                                    formatEntityValue(value, field, intl)
                                  )}
                                </dd>
                              </div>
                            );
                          })}
                      </dl>
 );
}
