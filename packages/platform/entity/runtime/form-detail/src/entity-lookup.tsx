"use client";
import { Maximize2Icon } from "@athyper/platform-icons";
import { useOptionalI18n } from "@athyper/platform-i18n/react";
import { entityEnglishMessages } from "@athyper/platform-i18n/entity-messages";
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  intakeConditionMatches,
  type EntityLookupField,
} from "@athyper/contract-platform-entity-runtime";
import type {
  EntityListRowV1,
  ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import type { HttpClient } from "@athyper/platform-api-client";
import {
  type LookupDescriptorCache,
  searchLookupDirectory,
  lookupSearchBehavior,
} from "@athyper/platform-entity-list-view/lookup-directory";
import {
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
} from "@athyper/platform-ui";
const EntityListRuntime = lazy(() =>
  import("@athyper/platform-entity-list-view").then((module) => ({
    default: module.EntityListRuntime,
  })),
);
export type EntityLookupRow = EntityListRowV1;
export interface LookupActionDecision {
  readonly state: "hidden" | "disabled" | "enabled";
  readonly reason?: string;
}
export interface LookupActionDecisions {
  readonly select: LookupActionDecision;
  readonly creation: Readonly<Record<string, LookupActionDecision>>;
}
export interface EntityLookupAdapter {
  /** Resolve operation authority independently from UI metadata and selection readiness. */
  resolveActions?(signal: AbortSignal): Promise<LookupActionDecisions>;
  readonly targetEntity: string;
  readonly client: HttpClient;
  readonly actions: readonly ("select" | "create" | "view")[];
  /** Selection handlers must recheck domain eligibility before assigning/advancing. */
  select?(row: EntityLookupRow): void | Promise<void>;
  selectMany?(rows: readonly EntityLookupRow[]): void | Promise<void>;
  create?(actionKey: string): void | Promise<void>;
  readonly creationActions?: readonly string[];
  validateSelection?(
    rows: readonly EntityLookupRow[],
  ): Promise<readonly EntityLookupRow[]>;
  viewHref?(row: EntityLookupRow): string;
  /** Scope includes user, tenant and work context. No record labels are stored. */
  readonly recentScope?: string;
  resolveRecent?(
    ids: readonly string[],
    signal: AbortSignal,
  ): Promise<readonly EntityLookupRow[]>;
}
export type EntityLookupAdapters = Readonly<
  Record<string, EntityLookupAdapter>
>;
const display = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
/** Presentation is metadata; authorized data access and domain effects remain registered code. */
export function EntityLookup({
  field,
  answers,
  adapters,
  disabled = false,
  value = [],
  onChange,
}: {
  readonly field: EntityLookupField;
  readonly answers: Readonly<Record<string, unknown>>;
  readonly adapters?: EntityLookupAdapters;
  readonly disabled?: boolean;
  readonly value?: readonly EntityLookupRow[];
  readonly onChange?: (
    rows: readonly EntityLookupRow[],
  ) => void | Promise<void>;
}) {
  const i18n = useOptionalI18n();
  const sharedText = (key: keyof typeof entityEnglishMessages) => {
    const text = i18n?.message(key);
    return text && text !== key ? text : entityEnglishMessages[key];
  };
  const id = useId(),
    options = field.lookup;
  const adapter = Object.hasOwn(adapters ?? {}, options.adapterKey)
    ? adapters![options.adapterKey]
    : undefined;
  const [query, setQuery] = useState(""),
    [result, setResult] = useState<{
      rows: readonly EntityLookupRow[];
      hasNext: boolean;
    }>();
  const [selected, setSelected] = useState<readonly EntityLookupRow[]>(value),
    [draft, setDraft] = useState<readonly EntityLookupRow[]>(value);
  const [searchBehavior, setSearchBehavior] = useState(
    options.display.defaults.searchBehavior,
  );
  const [initialControl, setInitialControl] = useState<"display" | undefined>();
  const [directoryReady, setDirectoryReady] = useState(false);
  const [directoryEmpty, setDirectoryEmpty] = useState(false);
  const [decisions, setDecisions] = useState<LookupActionDecisions>();
  const resolver = useRef(adapter?.resolveActions);
  resolver.current = adapter?.resolveActions;
  useEffect(() => {
    const controller = new AbortController();
    let revision = 0;
    const refresh = () => {
      const current = ++revision;
      setDecisions(undefined);
      void resolver
        .current?.(controller.signal)
        .then((next) => {
          if (!controller.signal.aborted && current === revision)
            setDecisions(next);
        })
        .catch(() => {
          /* Failed authority remains non-actionable. */
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [adapter?.client, options.adapterKey, JSON.stringify(answers)]);
  async function requireAction(key?: string) {
    const next = await resolver.current?.(new AbortController().signal);
    setDecisions(next);
    const decision = key ? next?.creation[key] : next?.select;
    if (decision?.state !== "enabled")
      throw Error(decision?.reason ?? "This action is not available.");
  }
  const [interacted, setInteracted] = useState(false);
  const [open, setOpen] = useState(false),
    [state, setState] = useState<ListLocationStateV1>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string>(),
    [recent, setRecent] = useState<readonly EntityLookupRow[]>([]);
  const pending = useRef<AbortController | undefined>(undefined),
    acting = useRef(false),
    trigger = useRef<HTMLButtonElement>(null);
  const optionsKey = JSON.stringify(options),
    recentKey = adapter?.recentScope
      ? `athyper.lookup.recent.${adapter.recentScope}.${options.targetEntity}.${field.key}`
      : undefined;
  const lookupCache = useMemo<LookupDescriptorCache | undefined>(
    () => (adapter?.recentScope ? {} : undefined),
    [
      adapter?.client,
      adapter?.recentScope,
      optionsKey,
      JSON.stringify(answers),
    ],
  );
  const compatible =
    (!onChange || !!adapter?.validateSelection) &&
    adapter?.targetEntity === options.targetEntity &&
    (options.mode === "browse" ||
      (adapter.actions.includes("select") &&
        (options.selectionMode === "multiple"
          ? !!adapter.selectMany || !!onChange
          : !!adapter.select || !!onChange)));
  const fullInline =
    options.presentation.viewType === "full" &&
    options.presentation.fullViewHost === "inline";
  useEffect(() => {
    if (
      !interacted ||
      !compatible ||
      !adapter ||
      options.presentation.viewType !== "compact"
    )
      return;
    const controller = new AbortController();
    void lookupSearchBehavior(
      adapter.client,
      options.targetEntity,
      options,
      field.key,
      controller.signal,
      lookupCache,
    )
      .then((behavior) => {
        if (!controller.signal.aborted) setSearchBehavior(behavior);
      })
      .catch(() => {
        /* Search itself reports authorization/transport failures. */
      });
    return () => controller.abort();
  }, [optionsKey, adapter?.client, interacted, lookupCache]);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    setResult(undefined);
    setRecent([]);
    setBusy(false);
    return () => pending.current?.abort();
  }, [
    adapter?.client,
    adapter?.recentScope,
    optionsKey,
    JSON.stringify(answers),
  ]);
  useEffect(() => {
    setSelected(value);
    setDraft(value);
  }, [JSON.stringify(value)]);
  useEffect(() => {
    if (
      !interacted ||
      !options.recent.enabled ||
      !recentKey ||
      !adapter?.resolveRecent
    )
      return;
    const controller = new AbortController();
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(recentKey) ?? "[]",
      );
      const ids = Array.isArray(stored)
        ? stored
            .filter((v): v is string => typeof v === "string")
            .slice(0, options.recent.limit)
        : [];
      if (!ids.length) return;
      void adapter
        .resolveRecent(ids, controller.signal)
        .then((rows) => {
          if (!controller.signal.aborted)
            setRecent(rows.filter((row) => ids.includes(row.id)));
        })
        .catch(() => {});
    } catch {
      /* Optional device history. */
    }
    return () => controller.abort();
  }, [recentKey, optionsKey, interacted]);
  function reset() {
    pending.current?.abort();
    pending.current = undefined;
    setResult(undefined);
    setError(undefined);
    setBusy(false);
  }
  async function search() {
    if (!compatible || disabled || acting.current || !query.trim()) return;
    reset();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      const next = await searchLookupDirectory(
        adapter!.client,
        options.targetEntity,
        options,
        query.trim(),
        controller.signal,
        state,
        lookupCache,
      );
      if (!controller.signal.aborted) setResult(next);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Unable to search. Please try again.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    if (searchBehavior !== "instant" || !query.trim() || open || fullInline)
      return;
    const timer = setTimeout(() => void search(), 350);
    return () => clearTimeout(timer);
  }, [query, open, optionsKey, searchBehavior]);
  const title = (row: EntityLookupRow) =>
    options.result.titleFields
      .map((key) => display(row.values[key]))
      .find(Boolean) || row.id;
  async function commit(rows: readonly EntityLookupRow[]) {
    if (
      disabled ||
      acting.current ||
      options.mode !== "choose" ||
      !rows.length ||
      (options.selectionMode === "single" && rows.length !== 1)
    )
      return;
    acting.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await requireAction();
      if (adapter?.validateSelection) {
        const validated = await adapter.validateSelection(rows);
        if (
          validated.length !== rows.length ||
          validated.some(
            (row) => !rows.some((candidate) => candidate.id === row.id),
          )
        )
          throw Error(
            "Some selected records are no longer eligible. Search again.",
          );
        rows = validated;
      }
      if (onChange) await onChange(rows);
      else if (options.selectionMode === "multiple")
        await adapter!.selectMany!(rows);
      else await adapter!.select!(rows[0]!);
      setSelected(rows);
      setDraft(rows);
      setOpen(false);
      if (options.recent.enabled && recentKey)
        try {
          const prior: unknown = JSON.parse(
            localStorage.getItem(recentKey) ?? "[]",
          );
          localStorage.setItem(
            recentKey,
            JSON.stringify(
              [
                ...new Set([
                  ...rows.map((row) => row.id),
                  ...(Array.isArray(prior)
                    ? prior.filter((v) => typeof v === "string")
                    : []),
                ]),
              ].slice(0, options.recent.limit),
            ),
          );
        } catch {
          /* Selection does not depend on optional history. */
        }
      trigger.current?.focus();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to use this selection.",
      );
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }
  function changeDraft(rows: readonly EntityLookupRow[]) {
    if (!disabled && !busy) setDraft(rows);
  }
  function close() {
    if (acting.current) return;
    setOpen(false);
    setDraft(selected);
    trigger.current?.focus();
  }
  function showFull(control?: "display") {
    setInteracted(true);
    setInitialControl(control);
    setState((current) =>
      current
        ? {
            ...current,
            query: query || undefined,
            cursor: undefined,
            pageIndex: undefined,
          }
        : current,
    );
    reset();
    setDraft(selected);
    setOpen(true);
  }
  function creation(view: "compact" | "full", primary = false) {
    const action = options.actions.find(
      (a) =>
        a.kind === "create" && intakeConditionMatches(a.visibleWhen, answers),
    );
    const key = options.creation.actionKey;
    if (
      (view === "full" && !directoryReady) ||
      !options.creation.showIn.includes(view) ||
      !key ||
      !adapter?.creationActions?.includes(key) ||
      !adapter.create ||
      !adapter.actions.includes("create") ||
      decisions?.creation[key]?.state === "hidden" ||
      !decisions?.creation[key]
    )
      return null;
    return (
      <Button
        type="button"
        variant={primary ? "primary" : "secondary"}
        disabled={
          disabled || busy || decisions?.creation[key]?.state !== "enabled"
        }
        title={decisions?.creation[key]?.reason}
        onClick={() => {
          if (acting.current) return;
          acting.current = true;
          setBusy(true);
          setError(undefined);
          void Promise.resolve()
            .then(() => requireAction(key))
            .then(() => adapter.create!(key))
            .catch((e) =>
              setError(
                e instanceof Error ? e.message : "Unable to start request.",
              ),
            )
            .finally(() => {
              acting.current = false;
              setBusy(false);
            });
        }}
      >
        {action?.label ?? options.creation.label}
      </Button>
    );
  }
  if (!compatible)
    return (
      <p role="alert">
        This lookup requires an available, compatible entity adapter.
      </p>
    );
  const viewAction = options.actions.find(
    (action) =>
      action.kind === "view" &&
      intakeConditionMatches(action.visibleWhen, answers),
  );
  const recordLink =
    viewAction && adapter?.actions.includes("view") && adapter.viewHref
      ? (row: EntityLookupRow) => {
          const href = adapter.viewHref!(row);
          return /^\/(?!\/)[^\x00-\x20\\]*$/.test(href) ? href : undefined;
        }
      : undefined;
  const panel = (
    <Suspense
      fallback={<p role="status">{sharedText("entity.reference.loading")}</p>}
    >
      <EntityListRuntime
        client={adapter!.client}
        entityCode={options.targetEntity}
        contentOnly
        embedding={{
          recordHref: recordLink,
          onSearchBehaviorChange: setSearchBehavior,
          initialControl,
          preferenceNamespace: field.key,
          onResults: (ready, empty) => {
            setDirectoryReady(ready);
            setDirectoryEmpty(!!empty);
          },
          emptyContent: {
            ...options.messages,
            ...(decisions?.creation[options.creation.actionKey ?? ""]?.state ===
            "enabled"
              ? {}
              : { emptyDescription: "There are no records to display." }),
          },
          emptyAction: draft.length ? null : creation("full", true),
          options,
          initialQuery: query,
          initialState: state,
          onStateChange: (next) => {
            setState(next);
            setQuery(next.query ?? "");
          },
          selectionAllowed: decisions?.select.state === "enabled",
          selectedRows: draft,
          onSelectionChange: changeDraft,
        }}
      />
      {error ? <p role="alert">{error}</p> : null}
      <div className="a-entity-lookup__actions a-entity-lookup__footer">
        {!fullInline ? (
          <Button
            type="button"
            variant="secondary"
            className="a-entity-lookup__cancel"
            disabled={busy}
            onClick={close}
          >
            Cancel
          </Button>
        ) : null}
        {options.mode === "choose" &&
        (!directoryEmpty || draft.length > 0) &&
        decisions?.select.state !== "hidden" ? (
          <Button
            type="button"
            className="a-entity-lookup__confirm"
            disabled={
              disabled ||
              busy ||
              !directoryReady ||
              !draft.length ||
              decisions?.select.state !== "enabled"
            }
            title={decisions?.select.reason}
            onClick={() => void commit(draft)}
          >
            {options.selectionMode === "multiple"
              ? `${options.messages?.selectMultiple ?? "Use selected records"} (${draft.length})`
              : (options.actions.find(
                  (a) =>
                    a.kind === "select" &&
                    intakeConditionMatches(a.visibleWhen, answers),
                )?.label ?? "Use selected record")}
          </Button>
        ) : null}
        {!directoryEmpty || draft.length > 0 ? creation("full") : null}
      </div>
    </Suspense>
  );
  const expandedInline = open && options.presentation.fullViewHost === "inline";
  const rows = result?.rows ?? (!query.trim() ? recent : []);
  return (
    <div className="a-entity-lookup" aria-busy={busy}>
      {fullInline ? (
        panel
      ) : (
        <>
          <div hidden={expandedInline}>
            {options.presentation.viewType === "compact" ? (
              <>
                <Label htmlFor={id}>{field.label}</Label>
                {field.helpText ? <p>{field.helpText}</p> : null}
                {selected.length ? (
                  <div className="a-entity-lookup__actions">
                    {selected.map((row) => (
                      <span key={row.id}>
                        {title(row)}
                        {onChange ? (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={disabled || busy}
                            onClick={() => {
                              const next = selected.filter(
                                (item) => item.id !== row.id,
                              );
                              void requireAction()
                                .then(() => onChange(next))
                                .then(() => {
                                  setSelected(next);
                                  setDraft(next);
                                })
                                .catch((e) => setError(String(e)));
                            }}
                          >
                            Remove {title(row)}
                          </Button>
                        ) : null}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="a-entity-lookup__search">
                  <Input
                    id={id}
                    onFocus={() => setInteracted(true)}
                    placeholder={sharedText("entity.reference.search")}
                    value={query}
                    disabled={disabled || acting.current}
                    onChange={(e) => {
                      setQuery(e.currentTarget.value);
                      reset();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void search();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    disabled={disabled || busy || !query.trim()}
                    onClick={() => void search()}
                  >
                    {options.searchLabel}
                  </Button>
                  <Button
                    ref={trigger}
                    type="button"
                    variant="secondary"
                    disabled={disabled || busy}
                    aria-label={sharedText("entity.reference.browse")}
                    title={sharedText("entity.reference.browse")}
                    className="a-entity-lookup__browse"
                    onClick={() => showFull()}
                  >
                    <Maximize2Icon size={18} />
                    <span>{sharedText("entity.reference.browse")}</span>
                  </Button>
                </div>
                {error && !open ? <p role="alert">{error}</p> : null}
                {result ? (
                  <p role="status">
                    {rows.length
                      ? options.resultsMessage
                      : options.emptyMessage}
                  </p>
                ) : rows.length ? (
                  <p>Recent selections</p>
                ) : null}
                <ul className="a-entity-lookup__results">
                  {rows.map((row) => (
                    <li key={row.id}>
                      <span>
                        <strong>{title(row)}</strong>
                        {options.result.detailFields
                          .map((key) => display(row.values[key]))
                          .filter(Boolean)
                          .map((detail, index) => (
                            <small key={index}>{detail}</small>
                          ))}
                        {recordLink?.(row) ? (
                          <a href={recordLink(row)}>{viewAction!.label}</a>
                        ) : null}
                      </span>
                      {options.mode === "choose" &&
                      decisions?.select.state !== "hidden" ? (
                        options.selectionMode === "single" ? (
                          <Button
                            type="button"
                            disabled={
                              disabled ||
                              busy ||
                              decisions?.select.state !== "enabled"
                            }
                            onClick={() => void commit([row])}
                          >
                            Select
                          </Button>
                        ) : (
                          <label>
                            <input
                              type="checkbox"
                              checked={draft.some((item) => item.id === row.id)}
                              disabled={disabled || busy}
                              onChange={(e) =>
                                changeDraft(
                                  e.currentTarget.checked
                                    ? [...draft, row]
                                    : draft.filter(
                                        (item) => item.id !== row.id,
                                      ),
                                )
                              }
                            />
                            Select {title(row)}
                          </label>
                        )
                      ) : null}
                    </li>
                  ))}
                </ul>
                {options.selectionMode === "multiple" && draft.length ? (
                  <Button
                    type="button"
                    disabled={
                      disabled || busy || decisions?.select.state !== "enabled"
                    }
                    onClick={() => void commit(draft)}
                  >
                    {options.messages?.selectMultiple ?? "Use selected records"}{" "}
                    ({draft.length})
                  </Button>
                ) : null}
                {result?.hasNext ? <p>{options.moreMessage}</p> : null}
                {result ? creation("compact") : null}
              </>
            ) : null}
            {options.presentation.viewType !== "compact" ? (
              <Button
                ref={trigger}
                type="button"
                variant="secondary"
                disabled={disabled || busy}
                onClick={() => showFull()}
              >
                {options.mode === "choose" ? "Choose records" : "View records"}
              </Button>
            ) : null}
            {options.presentation.viewType === "compact" &&
            options.display.settingsShowIn.includes("compact") ? (
              <Button
                type="button"
                variant="secondary"
                disabled={disabled || busy}
                onClick={() => showFull("display")}
              >
                Display settings
              </Button>
            ) : null}
          </div>
          {options.presentation.fullViewHost === "inline" ? (
            open ? (
              panel
            ) : null
          ) : (
            <Dialog
              open={open}
              onOpenChange={(shown) => {
                if (!shown) close();
              }}
            >
              <DialogContent
                title={field.label}
                className="a-entity-lookup__dialog"
              >
                {panel}
              </DialogContent>
            </Dialog>
          )}
        </>
      )}
    </div>
  );
}
