"use client";
import React, { createContext, useContext, useState } from "react";
import {
  ChoiceSelect,
  CompanyGroups,
  ScopePickerToolbar,
  type CompanyChoice,
} from "@athyper/platform-ui";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
export type DirectorySelection = Readonly<
  Record<string, string | readonly string[] | undefined> & {
    operatingOrganizationIds?: readonly string[];
    companyCodeIds?: readonly string[];
  }
>;
type ScopeFilter = {
  readonly key: string;
  readonly requires?: readonly string[];
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
};
export interface DirectoryFilterAdapter {
  readonly value: DirectorySelection;
  readonly companies: readonly CompanyChoice[];
  readonly organizations: readonly {
    id: string;
    displayName: string;
    companyAssignments: readonly { companyCodeId: string }[];
  }[];
  readonly unavailable?: boolean;
  readonly apply: (value: DirectorySelection) => void;
}
export const DirectoryFilterContext = createContext<
  DirectoryFilterAdapter | undefined
>(undefined);
export const useDirectoryFilters = () => useContext(DirectoryFilterContext);
export function DirectoryFilterEditor({
  adapter,
  value,
  onChange,
  kinds,
}: {
  adapter: DirectoryFilterAdapter;
  value: DirectorySelection;
  onChange: (value: DirectorySelection) => void;
  kinds: readonly string[];
}) {
  const intl = useEntityI18n();
  const [query, setQuery] = useState("");
  const companyIds = value.companyCodeIds ?? [],
    organizationIds = value.operatingOrganizationIds ?? [];
  const organizations = adapter.organizations.filter((org) =>
    `${org.displayName} ${"code" in org ? org.code : ""}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <>
      {adapter.unavailable ? (
        <p role="alert">{intl.message("list.chrome.accessUnavailable")}</p>
      ) : null}
      <div className="a-directory-filter a-directory-filter--single">
        {kinds.includes("organization") ? (
          <div>
            <ScopePickerToolbar
              showControls={false}
              query={query}
              onQueryChange={setQuery}
              searchLabel={intl.message("list.chrome.searchOrganizations")}
              allLabel={intl.message("list.chrome.allOrganizations")}
              allSelected={!organizationIds.length}
              onAll={() => onChange({ ...value, operatingOrganizationIds: [] })}
              selectedCount={organizationIds.length}
              availableCount={organizations.length}
            />
            <div className="a-directory-organizations">
              {organizations.map((org) => (
                <label
                  className="a-company-groups__row"
                  data-selected={organizationIds.includes(org.id) || undefined}
                  key={org.id}
                >
                  <input
                    type="checkbox"
                    disabled={
                      adapter.unavailable ||
                      (organizationIds.length >= 100 &&
                        !organizationIds.includes(org.id))
                    }
                    checked={organizationIds.includes(org.id)}
                    onChange={() =>
                      onChange({
                        ...value,
                        operatingOrganizationIds: organizationIds.includes(
                          org.id,
                        )
                          ? organizationIds.filter((id) => id !== org.id)
                          : [...organizationIds, org.id],
                      })
                    }
                  />
                  <span>
                    <strong>{org.displayName}</strong>
                    {"code" in org ? <small>{String(org.code)}</small> : null}
                  </span>
                </label>
              ))}
            </div>
            {!organizations.length ? (
              <p role="status">{intl.message("list.chrome.noOrganizations")}</p>
            ) : null}
          </div>
        ) : null}
        {kinds.includes("company") ? (
          <div>
            <CompanyGroups
              companies={adapter.unavailable ? [] : adapter.companies}
              selectedIds={companyIds}
              query={query}
              onQueryChange={setQuery}
              onSelectionChange={(ids) =>
                onChange({ ...value, companyCodeIds: ids })
              }
            />
          </div>
        ) : null}
      </div>
    </>
  );
}

/** Organization/company are shared scope coordinates; other dependencies are filter keys. */
function dependencyValue(key: string, value: DirectorySelection) {
  return value[
    key === "organization"
      ? "operatingOrganizationIds"
      : key === "company"
        ? "companyCodeIds"
        : key
  ];
}
function selectionValueKey(value: string | readonly string[] | undefined) {
  return Array.isArray(value)
    ? JSON.stringify([...value].sort())
    : (value ?? "");
}
export function directorySelectionKey(value: DirectorySelection) {
  return JSON.stringify(
    Object.entries(value)
      .filter(([, selected]) =>
        typeof selected === "string"
          ? Boolean(selected)
          : Boolean(selected?.length),
      )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, selected]) => [key, selectionValueKey(selected)]),
  );
}
export function scopeFilterReady(
  filter: ScopeFilter,
  value: DirectorySelection,
  adapter: DirectoryFilterAdapter,
) {
  const requires = filter.requires ?? [];
  const selected = requires.every((key) => {
    const dependency = dependencyValue(key, value);
    return key === "organization" || key === "company"
      ? Array.isArray(dependency) && dependency.length === 1
      : typeof dependency === "string" && Boolean(dependency);
  });
  const compatible =
    !requires.includes("organization") ||
    !requires.includes("company") ||
    Boolean(
      adapter.organizations
        .find((org) => org.id === value.operatingOrganizationIds?.[0])
        ?.companyAssignments.some(
          (company) => company.companyCodeId === value.companyCodeIds?.[0],
        ),
    );
  return selected && compatible;
}
/** Clear dependent selections transitively when their inputs change or become unavailable. */
export function reconcileDirectorySelection(
  filters: readonly ScopeFilter[],
  previous: DirectorySelection,
  next: DirectorySelection,
  adapter: DirectoryFilterAdapter,
): DirectorySelection {
  const result = { ...next };
  for (let pass = 0; pass <= filters.length; pass++) {
    let changed = false;
    for (const filter of filters) {
      if (result[filter.key] === undefined) continue;
      const dependenciesChanged = (filter.requires ?? []).some(
        (key) =>
          selectionValueKey(dependencyValue(key, previous)) !==
          selectionValueKey(dependencyValue(key, result)),
      );
      if (
        dependenciesChanged ||
        !scopeFilterReady(filter, result, adapter) ||
        !filter.options.some((option) => option.value === result[filter.key])
      ) {
        result[filter.key] = undefined;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return result;
}
export function ScopeQuickFilters({
  filters,
  value,
  adapter,
  onChange,
}: {
  filters: readonly import("@athyper/contract-platform-entity-list").EntityScopeFilterV1[];
  value: DirectorySelection;
  adapter: DirectoryFilterAdapter;
  onChange: (value: DirectorySelection) => void;
}) {
  const intl = useEntityI18n();
  return (
    <div className="a-entity-list__scope-quick-filters">
      {filters.map((filter) => {
        const ready = scopeFilterReady(filter, value, adapter);
        return (
          <label key={filter.key}>
            {filter.label}
            <ChoiceSelect
              label={filter.label}
              value={
                typeof value[filter.key] === "string" ? String(value[filter.key]) : ""
              }
              disabled={!ready || adapter.unavailable}
              onChange={(next) =>
                onChange(
                  reconcileDirectorySelection(
                    filters,
                    value,
                    { ...value, [filter.key]: next || undefined },
                    adapter,
                  ),
                )
              }
              options={[
                { value: "", label: filter.emptyLabel },
                ...filter.options.map((option) => ({ value: option.value, label: option.label })),
              ]}
            />
            {!ready ? (
              <small>{intl.message("list.chrome.selectRequiredFilters")}</small>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}
