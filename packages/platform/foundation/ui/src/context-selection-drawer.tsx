"use client";
import {
  HistoryIcon,
  RefreshCwIcon,
  SearchIcon,
  CloseIcon,
} from "@athyper/platform-icons";
import { useId, useRef, useState, useEffect, type ReactNode } from "react";
import {
  Button,
  DrawerRoot,
  DrawerTrigger,
  DrawerPanel,
  DrawerHeader,
  DrawerContext,
  DrawerMetric,
  DrawerToolbar,
  DrawerBody,
  DrawerFooter,
  DrawerFooterActions,
  DrawerFooterSummary,
  Input,
  DrawerNavigation,
  DrawerTabs,
  DrawerTabList,
  DrawerTab,
  DrawerTabPanel,
  Badge,
} from "./index";
export interface ContextChoice {
  key: string;
  label: string;
  group: string;
  description?: string;
  keywords?: string;
  details?: ReactNode;
}
/** Single-context selection. Browsing is local; the owner validates and commits a switch. */
export function ContextSelectionDrawer({
  title,
  description,
  currentKey,
  currentLabel,
  choices,
  loading,
  errors = [],
  onRefresh,
  onConfirm,
  children,
}: {
  title: string;
  description: string;
  currentKey: string;
  currentLabel: string;
  choices: readonly ContextChoice[];
  loading: boolean;
  errors?: readonly string[];
  onRefresh: () => void;
  onConfirm: (key: string, signal: AbortSignal) => Promise<boolean>;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [pending, setPending] = useState(currentKey),
    [query, setQuery] = useState(""),
    [group, setGroup] = useState("all"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const id = useId();
  function changeOpen(value: boolean) {
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setOpen(value);
    setError("");
    if (value) {
      setPending(currentKey);
      setQuery("");
      setGroup("all");
    }
  }
  useEffect(() => () => request.current?.abort(), []);
  const groups = [...new Set(choices.map((c) => c.group))];
  const activeGroup = group === "all" || groups.includes(group) ? group : "all";
  const visible = choices.filter(
    (c) =>
      (activeGroup === "all" || c.group === activeGroup) &&
      `${c.label} ${c.description ?? ""} ${c.keywords ?? ""} ${c.key}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const selected = choices.find((c) => c.key === pending);
  async function confirm() {
    if (!selected || busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const accepted = await onConfirm(selected.key, controller.signal);
      if (!controller.signal.aborted) {
        if (accepted) changeOpen(false);
        else
          setError(
            "Version was not changed. Your current workspace is retained.",
          );
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Could not open the selected context.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <DrawerRoot open={open} onOpenChange={changeOpen}>
      <DrawerTrigger className="a-button a-button--secondary a-context-selection__trigger">
        <HistoryIcon aria-hidden="true" /> {currentLabel}{" "}
        <span aria-hidden="true">⌄</span>
      </DrawerTrigger>
      <DrawerPanel
        size="standard"
        variant="navigation"
        mobilePresentation="fullscreen"
        className="a-context-selection"
      >
        <DrawerHeader
          icon={<HistoryIcon />}
          title={title}
          description={description}
          actions={
            <Button
              variant="ghost"
              aria-label="Refresh list"
              title="Refresh list"
              disabled={loading || busy}
              onClick={onRefresh}
            >
              <RefreshCwIcon aria-hidden="true" />
            </Button>
          }
        />
        <DrawerToolbar>
          <DrawerContext>
            <DrawerMetric
              label="Available"
              value={loading ? "…" : choices.length}
            />
            <DrawerMetric label="Current" value={currentLabel} />
          </DrawerContext>
        </DrawerToolbar>
        <DrawerTabs
          value={encodeURIComponent(activeGroup)}
          onValueChange={(value) => setGroup(decodeURIComponent(value))}
        >
          <DrawerNavigation aria-label="Version categories">
            <DrawerTabList aria-label="Version type">
              {["all", ...groups].map((g) => (
                <DrawerTab key={g} value={encodeURIComponent(g)}>
                  {g === "all"
                    ? "All"
                    : g === "Published releases"
                      ? "Releases"
                      : g}
                  <span className="a-context-selection__count">
                    {g === "all"
                      ? choices.length
                      : choices.filter((c) => c.group === g).length}
                  </span>
                </DrawerTab>
              ))}
            </DrawerTabList>
          </DrawerNavigation>
          <DrawerToolbar className="a-context-selection__search-toolbar">
            <div className="a-context-selection__search">
              <SearchIcon aria-hidden="true" />
              <Input
                id={`${id}-search`}
                aria-label="Search available versions"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, revision or ID…"
              />
              {query ? (
                <Button
                  variant="ghost"
                  aria-label="Clear version search"
                  onClick={() => {
                    setQuery("");
                    document.getElementById(`${id}-search`)?.focus();
                  }}
                >
                  <CloseIcon aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </DrawerToolbar>
          <DrawerBody>
            {loading ? <p role="status">Loading available versions…</p> : null}
            {errors.map((e) => (
              <p role="alert" key={e}>
                {e}
              </p>
            ))}
            {error ? <p role="alert">{error}</p> : null}
            <DrawerTabPanel value={encodeURIComponent(activeGroup)}>
              {groups.map((g) => {
                const items = visible.filter((c) => c.group === g);
                return items.length ? (
                  <fieldset key={g} className="a-context-selection__group">
                    <legend>{g}</legend>
                    {items.map((c) => (
                      <div
                        key={c.key}
                        className="a-context-selection__choice"
                        data-selected={pending === c.key}
                      >
                        <label>
                          <input
                            type="radio"
                            name={`${id}-choice`}
                            value={c.key}
                            checked={pending === c.key}
                            disabled={busy}
                            onChange={() => {
                              setPending(c.key);
                              setError("");
                            }}
                          />
                          <span>
                            <strong>{c.label}</strong>
                            {c.description ? (
                              <small>{c.description}</small>
                            ) : null}
                          </span>
                          {c.key === currentKey ? <Badge>Current</Badge> : null}
                        </label>
                        {c.details ? (
                          <details>
                            <summary>Details</summary>
                            {c.details}
                          </details>
                        ) : null}
                      </div>
                    ))}
                  </fieldset>
                ) : null;
              })}
            </DrawerTabPanel>
            {["all", ...groups]
              .filter((g) => g !== activeGroup)
              .map((g) => (
                <DrawerTabPanel key={g} value={encodeURIComponent(g)} />
              ))}
            {!loading && !errors.length && !visible.length ? (
              <p>
                No versions match your search. Clear the search or choose
                another type.
              </p>
            ) : null}
            {selected && !visible.some((c) => c.key === pending) ? (
              <p>The selected version is outside these results.</p>
            ) : null}
            {children}
          </DrawerBody>
        </DrawerTabs>
        <DrawerFooter>
          <DrawerFooterSummary>
            <strong role="status">{visible.length} matching versions</strong>
            <span>Selected: {selected?.label ?? "Choose a version"}</span>
          </DrawerFooterSummary>
          <DrawerFooterActions>
            <Button variant="secondary" onClick={() => changeOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!selected || busy || loading || pending === currentKey}
              onClick={() => void confirm()}
            >
              {busy ? "Opening…" : "Open version"}
            </Button>
          </DrawerFooterActions>
        </DrawerFooter>
      </DrawerPanel>
    </DrawerRoot>
  );
}
