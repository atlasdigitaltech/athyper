"use client";
import { useEffect, useRef, useState, useId } from "react";
import {
  activityCollectionState,
  collectionActivityQuery,
  defaultActivityQuery,
  parseActivityQuery,
  type ActivityKind,
  type ActivitySavedViews,
} from "@athyper/contract-platform-activity";
import {
  parseCollectionState,
  type CollectionState,
} from "@athyper/contract-platform-collection";
import {
  AppliedFilters,
  Button,
  Input,
  Label,
  MenuItem,
  ObjectSearch,
  Select,
  ViewSelector,
  PanelEmptyState,
  FilterChipGroup,
} from "@athyper/platform-ui";
import {
  FilterIcon,
  SlidersHorizontalIcon,
  SortIcon,
  GroupIcon,
  LayoutIcon,
} from "@athyper/platform-icons";
import {
  CollectionDrawerHost,
  CollectionDraftFooter,
  FilterValueEditor,
  filterValueFromInput,
  filterInputValue,
} from "@athyper/platform-collection-controls";
import { ActivityNotificationActions } from "./activity-notification-actions";
import { ManagementToolbar } from "./management-workspace";
import type { ShellActivityDataSource } from "./activity-center";

type Panel = "filters" | "sort" | "group" | "display" | "views";
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function ActivityQueryControls({
  kind,
  data,
  compact = false,
}: {
  kind: ActivityKind;
  data: ShellActivityDataSource;
  compact?: boolean;
}) {
  const configuration = data.collections?.[kind]?.configuration,
    q = data.queries?.[kind] ?? defaultActivityQuery(kind),
    info = data.queryInfo?.[kind];
  const [panel, setPanel] = useState<Panel>(),
    [draft, setDraft] = useState<CollectionState>(),
    [search, setSearch] = useState(""),
    [error, setError] = useState<string>(),
    [preview, setPreview] = useState<number>(),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [legacy, setLegacy] = useState<{ name: string; query: unknown }[]>([]);
  const searchId = useId();
  const input = useRef<HTMLInputElement>(null),
    legacyKey = info?.viewScope
      ? `athyper.activity.views.v1:${info.viewScope}:${kind}`
      : undefined;
  let state: CollectionState | undefined;
  try {
    if (configuration) state = activityCollectionState(kind, q, configuration);
  } catch {}
  const serialized = JSON.stringify(state);
  useEffect(() => setSearch(state?.query ?? ""), [serialized]);
  useEffect(() => {
    setPanel(undefined);
    setDraft(undefined);
    setError(undefined);
  }, [kind]);
  useEffect(() => {
    setLegacy([]);
    if (!legacyKey) return;
    try {
      const value = JSON.parse(localStorage.getItem(legacyKey) ?? "[]");
      if (Array.isArray(value)) setLegacy(value.slice(0, 30));
    } catch {}
  }, [legacyKey]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(
          e.target instanceof HTMLElement &&
          (e.target.isContentEditable ||
            /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))
        )
      ) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!draft || !panel || !configuration) return;
    const controller = new AbortController();
    setPreview(undefined);
    const timer = setTimeout(() => {
      try {
        const valid = parseCollectionState(draft, configuration.fields);
        void data
          .onPreviewQuery?.(
            kind,
            collectionActivityQuery(kind, valid, q.timeZone),
            controller.signal,
          )
          .then((count) => {
            if (!controller.signal.aborted) setPreview(count);
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError(String(e.message ?? e));
          });
      } catch (e) {
        setError((e as Error).message);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draft, panel, configuration, kind, q.timeZone, data.onPreviewQuery]);
  if (!configuration)
    return data.loading ? (
      <p role="status">Loading activity configuration…</p>
    ) : (
      <PanelEmptyState
        icon={<FilterIcon />}
        title="Activity configuration unavailable"
        description={
          data.collectionErrors?.[kind] ??
          "Ask your administrator to publish this collection for the current workspace."
        }
      />
    );
  if (!state || data.collectionErrors?.[kind])
    return (
      <PanelEmptyState
        icon={<FilterIcon />}
        title="This view is no longer compatible"
        action={
          <Button
            onClick={() =>
              data.onQueryChange?.(
                kind,
                collectionActivityQuery(
                  kind,
                  configuration.defaultState,
                  q.timeZone,
                ),
              )
            }
          >
            Reset view
          </Button>
        }
      />
    );
  const current = state,
    views = data.savedViews?.[kind],
    working = draft ?? current;
  const apply = (next: CollectionState) => {
    try {
      const value = parseCollectionState(next, configuration.fields);
      data.onQueryChange?.(
        kind,
        collectionActivityQuery(kind, value, q.timeZone),
      );
      setPanel(undefined);
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const open = (key: Panel) => {
    setDraft(structuredClone(current));
    setError(undefined);
    setPanel(key);
  };
  const patch = (value: Partial<CollectionState>) => {
    setError(undefined);
    setDraft({ ...working, ...value });
  };
  const command = async (value: Record<string, unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      return await data.onViewCommand?.(kind, value);
    } catch (e) {
      setError(`${(e as Error).message}. Reload views and try again.`);
    } finally {
      setBusy(false);
    }
  };
  const active = views?.views.find(
    (v) => v.compatible && same(v.state.collection, current),
  );
  const footer = (
    <CollectionDraftFooter
      count={preview}
      dirty={!same(working, current)}
      error={error}
      onCancel={() => setPanel(undefined)}
      onReset={() => patch(configuration.defaultState)}
      onApply={() => apply(working)}
    />
  );
  const fields = configuration.fields.filter((f) => f.operators.length);
  const filters = (
    <>
      <div className="a-collection-fields">
        <p>
          {working.filters.length} active filters ·{" "}
          {preview === undefined
            ? "Preview pending"
            : `${preview} matching items`}
        </p>
        {working.filters.map((filter, index) => {
          const field = fields.find((f) => f.key === filter.field);
          if (!field) return null;
          const choices = field.choices?.length
            ? field.choices
            : field.choiceSource
              ? (field.key === "entity"
                  ? info?.facets?.entities
                  : info?.facets?.types
                )?.map((value) => ({ value, label: value }))
              : undefined;
          const editorField = {
            ...field,
            filterOperators: field.operators,
            filterOptions: choices,
          };
          const replace = (value: typeof filter) =>
            patch({
              filters: working.filters.map((f, i) => (i === index ? value : f)),
            });
          return (
            <div className="a-collection-filter-row" key={index}>
              <Select
                aria-label={`Field ${index + 1}`}
                value={field.key}
                onChange={(e) => {
                  const next = fields.find((f) => f.key === e.target.value)!;
                  replace({
                    field: next.key,
                    operator: next.operators[0]!,
                    value: "",
                  });
                }}
              >
                {fields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </Select>
              <Select
                aria-label={`Operator ${index + 1}`}
                value={filter.operator}
                onChange={(e) =>
                  replace({
                    ...filter,
                    operator: e.target.value as typeof filter.operator,
                    value: "",
                  })
                }
              >
                {field.operators.map((op) => (
                  <option key={op} value={op}>
                    {(
                      {
                        eq: "Equals",
                        in: "Is one of",
                        contains: "Contains",
                        gte: "On or after",
                        lte: "On or before",
                        relative: "Relative period",
                      } as Record<string, string>
                    )[op] ?? op}
                  </option>
                ))}
              </Select>
              <FilterValueEditor
                field={editorField}
                operator={filter.operator}
                value={filterInputValue(filter, field.valueKind)}
                filterNumber={index + 1}
                onChange={(raw) =>
                  replace({
                    ...filter,
                    value: filterValueFromInput(
                      filter.operator,
                      raw,
                      field.valueKind,
                      choices,
                    ),
                  })
                }
              />
              <Button
                variant="ghost"
                aria-label={`Remove filter ${index + 1}`}
                onClick={() =>
                  patch({
                    filters: working.filters.filter((_, i) => i !== index),
                  })
                }
              >
                Remove
              </Button>
            </div>
          );
        })}
        <Button
          variant="secondary"
          disabled={working.filters.length >= 20}
          onClick={() => {
            const f =
              fields.find((f) => configuration.quickFields.includes(f.key)) ??
              fields[0];
            if (f)
              patch({
                filters: [
                  ...working.filters,
                  { field: f.key, operator: f.operators[0]!, value: "" },
                ],
              });
          }}
        >
          Add filter
        </Button>
      </div>
      {footer}
    </>
  );
  const selectField = (
    label: string,
    value: string,
    choices: readonly { key: string; label: string }[],
    onChange: (v: string) => void,
  ) => (
    <Label>
      {label}
      <Select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {choices.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </Select>
    </Label>
  );
  const sort = (
    <>
      <div className="a-collection-fields">
        {working.sort.map((sort, i) => (
          <div key={i}>
            {selectField(
              `Sort field ${i + 1}`,
              sort.field,
              configuration.fields.filter((f) => f.sortable),
              (field) =>
                patch({
                  sort: working.sort.map((v, n) =>
                    n === i ? { ...v, field } : v,
                  ),
                }),
            )}
            {selectField(
              `Direction ${i + 1}`,
              sort.direction,
              [
                { key: "asc", label: "Ascending" },
                { key: "desc", label: "Descending" },
              ],
              (direction) =>
                patch({
                  sort: working.sort.map((v, n) =>
                    n === i
                      ? { ...v, direction: direction as "asc" | "desc" }
                      : v,
                  ),
                }),
            )}
            <Button
              variant="ghost"
              onClick={() =>
                patch({ sort: working.sort.filter((_, n) => n !== i) })
              }
            >
              Remove sort
            </Button>
          </div>
        ))}
        <Button
          onClick={() => {
            const f = configuration.fields.find(
              (f) => f.sortable && !working.sort.some((s) => s.field === f.key),
            );
            if (f)
              patch({
                sort: [...working.sort, { field: f.key, direction: "asc" }],
              });
          }}
        >
          Add sort
        </Button>
      </div>
      {footer}
    </>
  );
  const group = (
    <>
      <div className="a-collection-fields">
        {selectField(
          "Group by",
          working.group ?? "",
          [
            { key: "", label: "No grouping" },
            ...configuration.fields.filter((f) => f.groupable),
          ],
          (group) => patch({ group: group || undefined }),
        )}
      </div>
      {footer}
    </>
  );
  const display = (
    <>
      <div className="a-collection-fields">
        {selectField(
          "Display density",
          working.density,
          [
            { key: "comfortable", label: "Comfortable" },
            { key: "compact", label: "Compact" },
            { key: "spacious", label: "Spacious" },
          ],
          (density) =>
            patch({ density: density as CollectionState["density"] }),
        )}
      </div>
      {footer}
    </>
  );
  const manage = (
    <div className="a-collection-fields">
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => void command({ action: "reload" })}
      >
        Reload views
      </Button>
      <Label>
        View name
        <Input
          value={name}
          maxLength={160}
          onChange={(e) => setName(e.target.value)}
        />
      </Label>
      <Button
        disabled={busy || !name.trim()}
        onClick={() =>
          void command({
            action: "create",
            name,
            visibility: "personal",
            state: {
              schemaVersion: configuration.viewVersion,
              collection: current,
            },
          })
        }
      >
        Save personal view
      </Button>
      {views?.capabilities.createShared ? (
        <Button
          disabled={busy || !name.trim()}
          onClick={() =>
            void command({
              action: "create",
              name,
              visibility: "shared",
              state: {
                schemaVersion: configuration.viewVersion,
                collection: current,
              },
            })
          }
        >
          Save shared view
        </Button>
      ) : null}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() =>
          void command({ action: "default", id: "system", target: "personal" })
        }
      >
        Use published default
      </Button>
      {views?.views.map((v) => (
        <div key={v.id}>
          <strong>{v.name}</strong> · {v.scope}
          {!v.compatible ? (
            <p>
              This view uses unavailable settings. Save a new view or delete it.
            </p>
          ) : null}
          <Button
            disabled={busy || !v.compatible}
            onClick={() =>
              void command({ action: "default", id: v.id, target: "personal" })
            }
          >
            Make my default
          </Button>
          {v.scope === "shared" && views.capabilities.setSharedDefault ? (
            <Button
              disabled={busy || !v.compatible}
              onClick={() =>
                void command({ action: "default", id: v.id, target: "shared" })
              }
            >
              Make shared default
            </Button>
          ) : null}
          {v.scope === "personal" ||
          (v.scope === "shared" && views.capabilities.manageShared) ? (
            <>
              <Button
                disabled={busy}
                onClick={() =>
                  void command({
                    action: "update",
                    id: v.id,
                    version: v.version,
                    state: {
                      schemaVersion: configuration.viewVersion,
                      collection: current,
                    },
                  })
                }
              >
                Update to current settings
              </Button>
              <Button
                disabled={busy}
                onClick={() => void command({ action: "delete", id: v.id })}
              >
                Delete
              </Button>
            </>
          ) : null}
        </div>
      ))}
      {legacy.length ? (
        <>
          <p>{legacy.length} views are saved only in this browser.</p>
          <Button
            disabled={busy}
            onClick={() =>
              void (async () => {
                let pending = [...legacy];
                for (const v of legacy) {
                  try {
                    const state = activityCollectionState(
                      kind,
                      parseActivityQuery(kind, v.query),
                      configuration,
                    );
                    const result = await command({
                      action: "create",
                      name: v.name,
                          importKey:JSON.stringify([v.name,state]),
                      visibility: "personal",
                      state: {
                        schemaVersion: configuration.viewVersion,
                        collection: state,
                      },
                    });
                    if (!result) return;
                    pending = pending.filter((x) => x !== v);
                    setLegacy(pending);
                    if (legacyKey)
                      localStorage.setItem(legacyKey, JSON.stringify(pending));
                  } catch (e) {
                    setError((e as Error).message);
                    return;
                  }
                }
                if (legacyKey) localStorage.removeItem(legacyKey);
                setLegacy([]);
              })()
            }
          >
            Import browser views
          </Button>
        </>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
  const options = [
    { key: "filters" as const, label: "Filters", Icon: FilterIcon },
    { key: "sort" as const, label: "Sort", Icon: SortIcon },
    { key: "group" as const, label: "Group by", Icon: GroupIcon },
    { key: "display" as const, label: "Display settings", Icon: LayoutIcon },
    { key: "views" as const, label: "Manage views", Icon: LayoutIcon },
  ].map((item) => ({
    ...item,
    description: `Configure your authorized ${configuration.title.toLowerCase()}.`,
  }));
  return (
    <div
      className={`athyper-activity-query${compact ? " athyper-activity-query--compact" : ""}`}
    >
      <ManagementToolbar>
        {!compact ? (
          <ViewSelector
            name={
              active?.name ??
              (same(current, configuration.defaultState)
                ? "System default"
                : "Custom")
            }
          >
            {views?.views
              .filter((v) => v.compatible)
              .map((v) => (
                <MenuItem key={v.id} onClick={() => apply(v.state.collection)}>
                  {v.name}
                </MenuItem>
              ))}
            <MenuItem onClick={() => apply(configuration.defaultState)}>
              System default
            </MenuItem>
            <MenuItem onClick={() => open("views")}>Manage views</MenuItem>
          </ViewSelector>
        ) : null}
        <form
          data-slot="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ ...current, query: search });
          }}
        >
          <ObjectSearch
            id={searchId}
            ref={input}
            label="Search activity"
            placeholder="Search activity or related records…"
            value={search}
            onValueChange={(value) => {
              setSearch(value);
              if (!value) apply({ ...current, query: "" });
            }}
          />
        </form>
        <div data-slot="actions">
          <Button
            variant="secondary"
            onClick={() => (panel ? setPanel(undefined) : open("filters"))}
          >
            <FilterIcon size={16} />
            Filters
          </Button>
          {!compact ? (
            <Button variant="secondary" onClick={() => open("sort")}>
              <SlidersHorizontalIcon size={16} />
              Controls
            </Button>
          ) : null}
        </div>
      </ManagementToolbar>
      <div className="athyper-activity-query__summary">
      <FilterChipGroup
        label="Activity views"
        value={active?.id ?? ""}
        onValueChange={(id) => {
          const v = views?.views.find((v) => v.id === id);
          if (v?.compatible) apply(v.state.collection);
        }}
        items={(views?.views ?? [])
          .filter((v) => v.scope === "system" && v.compatible)
          .map((v) => ({ value: v.id, label: v.name }))}
      />
      {kind === "notifications" ? <ActivityNotificationActions data={data} /> : null}
      </div>
      {current.filters.length ? (
        <AppliedFilters
          chips={current.filters.map((f, i) => ({
            key: String(i),
            label: `${configuration.fields.find((x) => x.key === f.field)?.label ?? f.field}: ${String(f.value)}`,
            onRemove: () =>
              apply({
                ...current,
                filters: current.filters.filter((_, n) => n !== i),
              }),
          }))}
          onClear={() => apply({ ...current, filters: [] })}
        />
      ) : null}
      {panel ? (
        compact ? (
          filters
        ) : (
          <CollectionDrawerHost
            active={panel}
            onSelect={setPanel}
            onOpenChange={(open) => {
              if (!open) setPanel(undefined);
            }}
            options={options}
            sections={{ filters, sort, group, display, views: manage }}
          />
        )
      ) : null}
      {error && !panel ? <p role="alert">{error}</p> : null}
      {!data.loading && info?.matchingCount !== undefined ? (
        <p role="status" className="athyper-activity-query__count">
          {info.matchingCount} matching{" "}
          {kind === "notifications" ? "notifications" : "tasks"}
        </p>
      ) : null}
    </div>
  );
}
