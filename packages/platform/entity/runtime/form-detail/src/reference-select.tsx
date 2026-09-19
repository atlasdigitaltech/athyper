"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { SearchableSelect, type ReferenceOption } from "@athyper/platform-ui";
import { useOptionalI18n } from "@athyper/platform-i18n/react";
import { entityEnglishMessages } from "@athyper/platform-i18n/entity-messages";
import type { RecentChoicePolicy } from "@athyper/contract-platform-entity-runtime";
import {
  referenceHistoryOperation,
  updateReferenceHistoryOperation,
  type HttpClient,
  type ReferenceHistoryItem,
} from "@athyper/platform-api-client";
import {
  subscribeReferenceHistory,
  type ReferenceHistoryStore,
} from "./reference-history-store";
export interface ReferenceChoiceScope {
  readonly plane: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly contextKey?: string;
}
export interface ReferenceHistoryBinding {
  readonly client: HttpClient;
  readonly entityCode: string;
  readonly surfaceKey: string;
  readonly fieldKey: string;
  readonly query?: Readonly<Record<string, string>>;
}
export function referenceRecentKey(
  scope: ReferenceChoiceScope | undefined,
  source: string,
): string | undefined {
  return scope?.plane && scope.tenantId && scope.principalId
    ? `athyper.reference.recent.v2.${JSON.stringify([scope.plane, scope.tenantId, scope.principalId, scope.contextKey ?? "", source])}`
    : undefined;
}
const legacyPolicy: RecentChoicePolicy = {
  enabled: true,
  limit: 5,
  persistence: "browser",
  scope: "businessContext",
  retentionDays: 90,
};
export function ReferenceSelect(props: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly ReferenceOption[];
  readonly sourceKey: string;
  readonly recentScope?: ReferenceChoiceScope;
  readonly recentPolicy?: RecentChoicePolicy;
  readonly history?: ReferenceHistoryBinding;
  readonly onChange: (value: string) => void;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly describedBy?: string;
  readonly "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  readonly onBlur?: () => void;
}) {
  const policy = props.recentPolicy ?? legacyPolicy;
  const scope =
    props.recentScope && policy.scope === "referenceSource"
      ? { ...props.recentScope, contextKey: undefined }
      : props.recentScope;
  const storageKey = policy.enabled
    ? referenceRecentKey(scope, props.sourceKey)
    : undefined;
  return (
    <ScopedReferenceSelect
      key={JSON.stringify([
        storageKey,
        policy,
        props.history?.entityCode,
        props.history?.surfaceKey,
        props.history?.fieldKey,
      ])}
      {...props}
      policy={policy}
      storageKey={storageKey}
    />
  );
}
function ScopedReferenceSelect({
  storageKey,
  policy,
  history,
  sourceKey: _source,
  recentScope: _scope,
  recentPolicy: _policy,
  ...props
}: Parameters<typeof ReferenceSelect>[0] & {
  storageKey?: string;
  policy: RecentChoicePolicy;
}) {
  const i18n = useOptionalI18n();
  const message = (key: keyof typeof entityEnglishMessages) => {
    const text = i18n?.message(key);
    return text && text !== key ? text : entityEnglishMessages[key];
  };
  const [recent, setRecent] = useState<readonly ReferenceHistoryItem[]>([]);
  const store = useRef<ReferenceHistoryStore | undefined>(undefined),
    activated = useRef(false);
  // Keep eligibility bindings distinct even when their persisted history is shared.
  const eligibility = useMemo(
    () => props.options.map((option) => option.value).sort(),
    [props.options],
  );
  const bindingKey = JSON.stringify([
    history?.entityCode,
    history?.surfaceKey,
    history?.fieldKey,
    Object.entries(history?.query ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    eligibility,
  ]);
  const transport = async (
    signal: AbortSignal,
    action?: "select" | "clear",
    key?: string,
  ) => {
    const target = history!;
    const response = await target.client.request(
      action ? updateReferenceHistoryOperation : referenceHistoryOperation,
      {
        params: { entityCode: target.entityCode },
        query: {
          ...target.query,
          surface: target.surfaceKey,
          field: target.fieldKey,
        },
        ...(action ? { body: { action, ...(key ? { key } : {}) } } : {}),
        signal,
      },
    );
    return response.items;
  };
  const remote = policy.enabled && policy.persistence === "server" && !!history;
  const refresh = useRef(() => {});
  refresh.current = () => {
    if (activated.current && remote)
      store.current?.refresh(bindingKey, transport);
  };
  useEffect(() => {
    if (!storageKey) return;
    const subscription = subscribeReferenceHistory(
      storageKey,
      policy.limit,
      policy.retentionDays ?? 90,
      (current) => setRecent(current.items),
      () => refresh.current(),
    );
    store.current = subscription.store;
    return () => {
      store.current = undefined;
      subscription.unsubscribe();
    };
  }, [storageKey, policy.limit, policy.retentionDays]);
  useEffect(() => {
    refresh.current();
  }, [bindingKey, remote]);
  return (
    <SearchableSelect
      {...props}
      locale={i18n?.localization.uiLocale}
      onOpen={() => {
        activated.current = true;
        store.current?.prune();
        refresh.current();
      }}
      recentValues={policy.enabled ? recent.map((item) => item.key) : []}
      recentLimit={policy.limit}
      onClearRecent={
        policy.enabled && storageKey
          ? () => {
              store.current?.mutate(
                "clear",
                undefined,
                remote ? transport : undefined,
              );
            }
          : undefined
      }
      messages={{
        search: message("entity.reference.search"),
        recent: message("entity.reference.recent"),
        all: message("entity.reference.all"),
        results: message("entity.reference.results"),
        empty: message("entity.reference.empty"),
        unavailable: message("entity.reference.unavailable"),
        required: message("entity.reference.required"),
        clear: message("entity.reference.clear"),
        clearRecent: message("entity.reference.clearRecent"),
      }}
      onChange={(value) => {
        props.onChange(value);
        if (
          !storageKey ||
          !value ||
          !props.options.some((option) => option.value === value)
        )
          return;
        store.current?.mutate("select", value, remote ? transport : undefined);
      }}
    />
  );
}
