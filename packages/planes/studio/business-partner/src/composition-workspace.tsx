"use client";
import {
  useMemo,
  useState,
  useRef,
  useEffect,
  type KeyboardEvent,
} from "react";
import {
  AppliedFilters,
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  Badge,
  Button,
  ObjectSearch,
  Select,
  Label,
} from "@athyper/platform-ui";
import {
  composeGraph,
  friendly,
  type CompositionNode,
} from "./composition-model";
import { ManagementToolbar } from "@athyper/platform-shell";
import { FilterIcon, SlidersHorizontalIcon } from "@athyper/platform-icons";
import { display, type Inspection } from "./workbench-model";
import { useCompositionNavigation } from "./composition-navigation";
export interface CompositionSelection {
  source: string;
  node: string;
  reveal?: number;
}
export function CompositionWorkspace({
  inspection,
  selection,
  onSelect,
  renderProperties,
  editable = false,
  changedKeys = new Set<string>(),
  canEdit,
}: {
  editable?: boolean;
  changedKeys?: ReadonlySet<string>;
  canEdit?: (node: CompositionNode) => boolean;
  renderProperties?: (node: CompositionNode, panel: string) => React.ReactNode;
  inspection: Inspection;
  selection?: CompositionSelection;
  onSelect?: (value: CompositionSelection) => void;
}) {
  const navigation = useCompositionNavigation();
  const source = `${inspection.source}:${inspection.id}`;
  const model = useMemo(() => composeGraph(inspection.data), [inspection.data]);
  const [localSelection, setLocalSelection] = useState("");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState("");
  const [panel, setPanel] = useState("Properties");
  const [mobilePane, setMobilePane] = useState("Objects");
  const [filter, setFilter] = useState("all");
  const [kind, setKind] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const shortcut = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.key !== "/" ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        target.closest(
          "input,textarea,select,[contenteditable=true],[role=dialog]",
        )
      )
        return;
      e.preventDefault();
      search.current?.focus();
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    setQuery("");
    setFilter("all");
    setKind("all");
    setClosedGroups(new Set());
    setCollapsed(new Set());
  }, [source]);
  const tree = useRef<HTMLDivElement>(null);
  const selected =
    model.map.get(
      selection?.source === source ? selection.node : localSelection,
    ) ?? model.groups.find((g) => g.nodes.length)?.nodes[0];
  useEffect(() => {
    if (!selection?.reveal || selection.source !== source) return;
    setQuery("");
    setFilter("all");
    setKind("all");
    setClosedGroups(new Set());
    setCollapsed(new Set());
    setMobilePane("Properties");
    setPanel("Properties");
  }, [selection?.reveal, source]);
  useEffect(() => {
    if (
      !selection?.reveal ||
      selection.source !== source ||
      mobilePane !== "Properties"
    )
      return;
    const frame = requestAnimationFrame(() => {
      const panel = document.getElementById("studio-composition-properties");
      panel?.focus();
      panel?.scrollIntoView?.({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selection?.reveal, source, mobilePane]);
  const choose = (node: CompositionNode) => {
    setMobilePane("Properties");
    setLocalSelection(node.key);
    setFocused(node.key);
    onSelect?.({ source, node: node.key });
  };
  const searching = Boolean(query.trim()) || filter !== "all" || kind !== "all";
  const needle = query.trim().toLowerCase();
  const category = new Map<string, string>();
  const markCategory = (node: CompositionNode, label: string) => {
    category.set(node.key, label);
    node.children.forEach((n) => markCategory(n, label));
  };
  model.groups.forEach((g) => g.nodes.forEach((n) => markCategory(n, g.label)));
  const direct = (node: CompositionNode) => {
    const text = [
      node.label,
      node.kind,
      category.get(node.key),
      ...Object.entries(node.value)
        .filter(([k]) => k === "id" || k.endsWith("Key"))
        .map(([, v]) => String(v)),
    ]
      .join(" ")
      .toLowerCase();
    return (
      text.includes(needle) &&
      (kind === "all" || node.kind === kind) &&
      (filter === "all" ||
        (filter === "changed" && changedKeys.has(node.key)) ||
        (filter === "issues" && node.issues.length > 0) ||
        (filter === "editable" && editable && canEdit?.(node)))
    );
  };
  const matches = (node: CompositionNode): boolean =>
    Boolean(direct(node)) || node.children.some(matches);
  const highlight = (label: string) => {
    const index = needle ? label.toLowerCase().indexOf(needle) : -1;
    return index < 0 ? (
      label
    ) : (
      <>
        {label.slice(0, index)}
        <mark>{label.slice(index, index + needle.length)}</mark>
        {label.slice(index + needle.length)}
      </>
    );
  };
  const visible: CompositionNode[] = [];
  const visit = (node: CompositionNode) => {
    if (searching && !matches(node)) return;
    visible.push(node);
    if (searching || !collapsed.has(node.key)) node.children.forEach(visit);
  };
  model.groups.forEach((g) => {
    if (searching || !closedGroups.has(g.collection)) g.nodes.forEach(visit);
  });
  const focusKey = visible.some((n) => n.key === focused)
    ? focused
    : (visible.find((n) => n.key === selected?.key)?.key ?? visible[0]?.key);
  const toggle = (key: string, close: boolean) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (close) next.add(key);
      else next.delete(key);
      return next;
    });
  function keyboard(event: KeyboardEvent, node: CompositionNode) {
    const index = visible.indexOf(node);
    let next: CompositionNode | undefined;
    if (event.key === "ArrowDown")
      next = visible[Math.min(index + 1, visible.length - 1)];
    else if (event.key === "ArrowUp") next = visible[Math.max(index - 1, 0)];
    else if (event.key === "Home") next = visible[0];
    else if (event.key === "End") next = visible.at(-1);
    else if (event.key === "ArrowRight") {
      if (collapsed.has(node.key)) toggle(node.key, false);
      else next = node.children.find((n) => visible.includes(n));
    } else if (event.key === "ArrowLeft") {
      if (node.children.length && !collapsed.has(node.key) && !searching)
        toggle(node.key, true);
      else next = node.parent ? model.map.get(node.parent) : undefined;
    } else if (event.key === "Enter" || event.key === " ") choose(node);
    else return;
    event.preventDefault();
    if (next) {
      setFocused(next.key);
      const element = Array.from(
        tree.current?.querySelectorAll<HTMLElement>("[data-node]") ?? [],
      ).find((e) => e.dataset.node === next!.key);
      element?.focus();
    }
  }
  const renderNode = (
    node: CompositionNode,
    level: number,
  ): React.ReactNode => {
    if (searching && !matches(node)) return null;
    const open = searching || !collapsed.has(node.key);
    return (
      <div
        role="treeitem"
        aria-level={level}
        aria-selected={selected?.key === node.key}
        aria-expanded={node.children.length ? open : undefined}
        tabIndex={focusKey === node.key ? 0 : -1}
        data-node={node.key}
        key={node.key}
        onFocus={(e) => {
          if (e.target === e.currentTarget) setFocused(node.key);
        }}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget) keyboard(e, node);
        }}
      >
        <div className="studio-designer__node" onClick={() => choose(node)}>
          {node.children.length ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`${open ? "Collapse" : "Expand"} ${node.label}`}
              onClick={(e) => {
                e.stopPropagation();
                toggle(node.key, open);
              }}
              disabled={searching}
            >
              {open ? "▾" : "▸"}
            </button>
          ) : (
            <span className="studio-designer__leaf" />
          )}
          <span>
            <span className="studio-designer__node-label">
              {highlight(node.label)}
            </span>
            <small>
              {node.kind}
              {changedKeys.has(node.key) ? " · Changed" : ""}
              {node.issues.length ? " · Needs attention" : ""}
            </small>
          </span>
        </div>
        {node.children.length && open ? (
          <div role="group">
            {node.children.map((n) => renderNode(n, level + 1))}
          </div>
        ) : null}
      </div>
    );
  };
  const path: CompositionNode[] = [];
  let ancestor: CompositionNode | undefined = selected;
  while (ancestor) {
    path.unshift(ancestor);
    ancestor = ancestor.parent ? model.map.get(ancestor.parent) : undefined;
  }
  const findings = model.nodes.filter((n) => n.issues.length);
  return (
    <div
      className="studio-designer"
      data-pane={mobilePane}
      id="composition-view-compose"
      tabIndex={-1}
      hidden={!!navigation.view && navigation.view !== "compose"}
    >
      <div className="studio-designer__heading">
        <div>
          <h2>Composition workspace</h2>
          <p>
            {inspection.source === "release"
              ? "Published source release"
              : "Change set"}{" "}
            · revision {inspection.version} · {model.nodes.length} objects
          </p>
        </div>
        <Badge>
          {inspection.status} · {editable ? "Editable draft" : "Read-only"}
        </Badge>
      </div>
      <details className="studio-designer__version">
        <summary>Version details</summary>
        <p>Source: {source}</p>
        <p>
          Runtime source and target activation are not established by this
          inspection.
        </p>
      </details>
      <div className="studio-designer__databar">
        <ManagementToolbar className="studio-designer__workbar">
          <ObjectSearch
            ref={search}
            id="studio-composition-search"
            label="Find an object"
            value={query}
            placeholder="Search fields, sections, operations or categories…"
            onValueChange={setQuery}
          />

          <Button
            variant={
              kind !== "all" || filter !== "all" ? "primary" : "secondary"
            }
            aria-expanded={filtersOpen}
            aria-controls="composition-filters"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <FilterIcon size={16} />
            <span>Filters</span>
            {kind !== "all" || filter !== "all" ? (
              <Badge>{Number(kind !== "all") + Number(filter !== "all")}</Badge>
            ) : null}
          </Button>
          <Menu>
            <MenuTrigger variant="secondary" aria-label="Controls">
              <SlidersHorizontalIcon size={16} /> Controls
            </MenuTrigger>
            <MenuContent>
              <MenuItem
                disabled={searching}
                onClick={() => {
                  setClosedGroups(new Set());
                  setCollapsed(new Set());
                }}
              >
                Expand all
              </MenuItem>
              <MenuItem
                disabled={searching}
                onClick={() =>
                  setClosedGroups(
                    new Set(model.groups.map((g) => g.collection)),
                  )
                }
              >
                Collapse all
              </MenuItem>
            </MenuContent>
          </Menu>
        </ManagementToolbar>
        <div
          id="composition-filters"
          className="studio-designer__filter-panel"
          hidden={!filtersOpen}
        >
          <Label htmlFor="composition-kind">Type</Label>
          <Select
            id="composition-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">All types</option>
            {[...new Set(model.nodes.map((n) => n.kind))].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
          <Label htmlFor="composition-filter">Show</Label>
          <Select
            id="composition-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All objects</option>
            <option value="changed">Changed</option>
            <option value="issues">With issues</option>
            <option value="editable">Editable</option>
          </Select>

          <Button variant="ghost" onClick={() => setFiltersOpen(false)}>
            Done
          </Button>
        </div>
        <AppliedFilters
          chips={[
            ...(query
              ? [
                  {
                    key: "query",
                    label: `Search: ${query}`,
                    onRemove: () => setQuery(""),
                  },
                ]
              : []),
            ...(kind !== "all"
              ? [
                  {
                    key: "kind",
                    label: `Type: ${kind}`,
                    onRemove: () => setKind("all"),
                  },
                ]
              : []),
            ...(filter !== "all"
              ? [
                  {
                    key: "filter",
                    label: `Show: ${{ changed: "Changed", issues: "With issues", editable: "Editable" }[filter] ?? filter}`,
                    onRemove: () => setFilter("all"),
                  },
                ]
              : []),
          ]}
          onClear={() => {
            setQuery("");
            setKind("all");
            setFilter("all");
          }}
        />
      </div>
      {searching ? (
        <p role="status">
          {model.nodes.filter(direct).length} matching objects
        </p>
      ) : null}
      {selected && searching && !visible.includes(selected) ? (
        <p role="status">
          Selected object is outside these results.{" "}
          <Button
            variant="ghost"
            size="small"
            onClick={() => {
              setQuery("");
              setFilter("all");
              setKind("all");
              setClosedGroups(new Set());
              setCollapsed(new Set());
            }}
          >
            Reveal selection
          </Button>
        </p>
      ) : null}
      <div
        className="studio-designer__mobile-switch"
        aria-label="Workspace panel"
      >
        {["Objects", "Properties"].map((p) => (
          <Button
            key={p}
            variant="secondary"
            aria-pressed={mobilePane === p}
            onClick={() => setMobilePane(p)}
          >
            {p}
          </Button>
        ))}
      </div>
      {findings.length ? (
        <details className="studio-designer__findings">
          <summary>{findings.length} objects need attention</summary>
          <ul>
            {findings.map((n) => (
              <li key={n.key}>
                <Button variant="ghost" size="small" onClick={() => choose(n)}>
                  {n.label}
                </Button>
                : {n.issues.join(" ")}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="studio-designer__layout">
        <div className="studio-designer__navigation">
          <div
            className="studio-designer__tree"
            ref={tree}
            role="group"
            aria-label="Business Partner composition"
          >
            {model.groups.map((g) => (
              <div role="none" key={g.collection}>
                <button
                  type="button"
                  className="studio-designer__group-title"
                  aria-expanded={searching || !closedGroups.has(g.collection)}
                  disabled={searching}
                  onClick={() =>
                    setClosedGroups((previous) => {
                      const next = new Set(previous);
                      if (next.has(g.collection)) next.delete(g.collection);
                      else next.add(g.collection);
                      return next;
                    })
                  }
                >
                  {closedGroups.has(g.collection) && !searching ? "▸" : "▾"}{" "}
                  {g.label} (
                  {
                    model.nodes.filter((n) => category.get(n.key) === g.label)
                      .length
                  }
                  )
                </button>
                {(searching || !closedGroups.has(g.collection)) &&
                g.nodes.some((n) => visible.includes(n)) ? (
                  <div role="tree" aria-label={g.label}>
                    {g.nodes.map((n) => renderNode(n, 1))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {!visible.length ? (
            <p role="status">
              {model.nodes.length
                ? "No matching objects."
                : "This source has no composition objects."}
            </p>
          ) : null}
        </div>
        <section
          id="studio-composition-properties"
          tabIndex={-1}
          className="studio-designer__properties"
          aria-label="Selected object properties"
        >
          {selected ? (
            <>
              <nav
                aria-label="Object ancestors"
                className="studio-designer__breadcrumbs"
              >
                {path.slice(0, -1).map((n) => (
                  <Button
                    variant="ghost"
                    size="small"
                    key={n.key}
                    onClick={() => choose(n)}
                  >
                    {n.label}
                  </Button>
                ))}
              </nav>
              {selection?.reveal ? (
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => {
                    navigation.go("changes");
                    const differences = document.getElementById(
                      "studio-composition-differences",
                    );
                    differences?.focus();
                    differences?.scrollIntoView?.({ block: "start" });
                  }}
                >
                  Return to differences
                </Button>
              ) : null}
              <h3>{selected.label}</h3>
              <p>
                {selected.kind} · {display(selected.value.status)}
              </p>
              {selected.issues.length ? (
                <p role="status">{selected.issues.join(" ")}</p>
              ) : null}
              <div
                className="studio-designer__tabs"
                aria-label="Object details"
              >
                {["Properties", "Rules", "References"].map((p) => (
                  <Button
                    key={p}
                    size="small"
                    variant="ghost"
                    aria-pressed={panel === p}
                    onClick={() => setPanel(p)}
                  >
                    {p}
                  </Button>
                ))}
              </div>
              {renderProperties?.(selected, panel)}
              <dl
                hidden={
                  editable &&
                  panel === "Properties" &&
                  Boolean(canEdit?.(selected))
                }
              >
                {Object.entries(selected.value)
                  .filter(
                    ([key, value]) =>
                      (panel === "References"
                        ? key.endsWith("Id") || key.endsWith("Key")
                        : panel === "Rules"
                          ? /rule|validation|required|condition/i.test(key)
                          : key !== "id" &&
                            !key.endsWith("Id") &&
                            !key.endsWith("Key") &&
                            !/rule|validation|condition/i.test(key)) &&
                      (value === null || typeof value !== "object"),
                  )
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>
                        {friendly(key.replace(/([a-z])([A-Z])/g, "$1 $2"))}
                      </dt>
                      <dd>{display(value)}</dd>
                    </div>
                  ))}
              </dl>
              {panel === "Rules" ? (
                <div>
                  {Object.entries(selected.value)
                    .filter(
                      ([key, value]) =>
                        /rule|validation|condition/i.test(key) &&
                        value &&
                        typeof value === "object",
                    )
                    .map(([key, value]) => (
                      <details key={key}>
                        <summary>{friendly(key)}</summary>
                        <pre>{JSON.stringify(value, null, 2)}</pre>
                      </details>
                    ))}
                </div>
              ) : null}
              {panel === "References" ? (
                <ul>
                  {Object.entries(selected.value)
                    .filter(([key]) => key !== "id" && key.endsWith("Id"))
                    .map(([key, value]) => {
                      const matches = model.nodes.filter(
                        (n) => n.value.id === value,
                      );
                      return (
                        <li key={key}>
                          {friendly(key)}:{" "}
                          {matches.length === 1 ? (
                            <Button
                              variant="ghost"
                              size="small"
                              onClick={() => choose(matches[0]!)}
                            >
                              {matches[0]!.label}
                            </Button>
                          ) : (
                            "Missing or ambiguous reference"
                          )}
                        </li>
                      );
                    })}
                </ul>
              ) : null}
              <details>
                <summary>Technical details · complete stored object</summary>
                <pre>{JSON.stringify(selected.value, null, 2)}</pre>
              </details>
            </>
          ) : (
            <p>Select an object to inspect its properties.</p>
          )}
        </section>
      </div>
      <details className="studio-designer__advanced">
        <summary>Technical details · complete stored graph</summary>
        <pre>{JSON.stringify(inspection.data, null, 2)}</pre>
      </details>
    </div>
  );
}
