"use client";
import { useCallback } from "react";
import type { EntitySurfaceFieldV1 } from "@athyper/contract-platform-entity-runtime";
import { entityReferenceChoicesOperation } from "@athyper/platform-api-client";
import { useApiClient, useEntityContext, useExperienceRevision, usePermissions, useSessionIdentity } from "@athyper/platform-shell-app-foundation";
import { FormField, SearchableSelect } from "@athyper/platform-ui";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { createEntityReferenceMessages } from "@athyper/platform-i18n/entity-reference-messages";

/** The same authorized paginated choices used by Entity filters, with no local catalogue. */
export function ReferenceFieldInput({field, entityCode, value, values, onChange, error}: {
  error?: string; field: EntitySurfaceFieldV1; entityCode: string; value: unknown;
  values: Readonly<Record<string,unknown>>; onChange: (value: unknown) => void;
}) {
  const client=useApiClient(), intl=useEntityI18n();
  const identity=useSessionIdentity(), context=useEntityContext(), revision=useExperienceRevision();
  const permissions=[...usePermissions()].sort();
  const dependencies=Object.fromEntries((field.referenceLookup?.dependencies ?? []).map(key => [key,values[key]]));
  const dependencyKey=JSON.stringify(dependencies);
  const scope=JSON.stringify([identity.state,identity.scope,context?.generation,revision,permissions,entityCode,field.key,dependencyKey]);
  const ready=identity.state === "authenticated" && revision.state === "ready" && (!context || context.status === "ready") && Object.values(dependencies).every(v => typeof v === "string" && !!v);
  const loadPage=useCallback(async(input:{query:string;cursor?:string;value?:string;signal:AbortSignal}) => client.request(entityReferenceChoicesOperation,{
    params:{entityCode,fieldKey:field.key}, signal:input.signal,
    query:{...(input.query ? {query:input.query} : {}),...(input.cursor ? {cursor:input.cursor} : {}),...(input.value ? {value:input.value} : {}),...(Object.keys(dependencies).length ? {dependencies:dependencyKey} : {})},
  }),[client,scope]);
  return <FormField label={field.label} required={field.required} error={error} hint={field.helpText}>{control => <SearchableSelect
    key={scope} {...control} label={field.label} value={ready ? String(value ?? "") : ""}
    options={[]} loadPage={ready ? loadPage : undefined} disabled={!ready || field.readOnly}
    required={field.required} messages={createEntityReferenceMessages(intl.message)}
    onChange={next => onChange(next === "" ? null : next)}
  />}</FormField>;
}
