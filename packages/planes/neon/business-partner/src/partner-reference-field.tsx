import { useEffect, useState } from "react";
import {
  entityListDescriptorOperation,
  entityListOperation,
  entityListQuery,
} from "@athyper/platform-api-client";
import { useApiClient, useSessionIdentity } from "@athyper/platform-shell-app-foundation";
import type { DataInputHandlers } from "@athyper/platform-entity-form-detail";

/** Uses the authorized entity directory, including its published search policy. */
export function PartnerReferenceField({
  field,
  value,
  onChange,
  id,
  name,
  disabled,
}: Parameters<DataInputHandlers[string]>[0]) {
  const http = useApiClient();
  const identity = useSessionIdentity();
  const scopeKey = JSON.stringify(identity.scope);
  const [descriptor, setDescriptor] = useState<Parameters<typeof entityListQuery>[1]>();
  const [descriptorError, setDescriptorError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    setDescriptor(undefined);setDescriptorError(undefined);
    void http.request(entityListDescriptorOperation,{params:{entityCode:"business_partner"},signal:controller.signal})
      .then(value=>{if(!controller.signal.aborted)setDescriptor(value);})
      .catch(cause=>{if(!controller.signal.aborted)setDescriptorError(cause instanceof Error?cause.message:"Partner directory is unavailable.");});
    return ()=>controller.abort();
  },[http,scopeKey]);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<
    readonly { id: string; label: string }[]
  >([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    setOptions([]);
    setError(undefined);
    if (!query.trim() || !descriptor) return () => controller.abort();
    const timeout = setTimeout(() => {
      void (async () => {
        const params = { entityCode: "business_partner" };
        if (query.trim().length < descriptor.surface.search.minimumQueryLength)
          return;
        const result = await http.request(entityListOperation, {
          params,
          query: entityListQuery(
            { query, filters: [], sort: [], columns: [] },
            descriptor,
          ),
          signal: controller.signal,
        });
        if (!controller.signal.aborted)
          setOptions(
            result.rows.map((row) => ({
              id: row.id,
              label: String(row.values.name ?? row.values.code ?? row.id),
            })),
          );
      })().catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : String(cause));
      });
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [http, query, descriptor, scopeKey]);
  return (
    <>
      <label htmlFor={id}>
        {field.label}
        {field.required ? " *" : ""}
      </label>
      <input
        id={id}
        name={name}
        disabled={disabled}
        value={query}
        placeholder={field.placeholder}
        autoComplete="off"
        aria-describedby={error || descriptorError ? id + "-lookup-error" : undefined}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("");
        }}
      />
      {!value && options.length > 0 ? (
        <ul aria-label={field.label}>
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setQuery(option.label);
                  onChange(option.id);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error || descriptorError ? (
        <span id={id + "-lookup-error"} role="status">
          {error ?? descriptorError}
        </span>
      ) : null}
    </>
  );
}
