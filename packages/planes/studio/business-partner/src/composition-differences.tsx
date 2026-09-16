"use client";
import { useState } from "react";
import { Badge, Button, Input, Label, Select } from "@athyper/platform-ui";
import { composeGraph } from "./composition-model";
import { differences } from "./workbench-edit-model";
import { display, type Json } from "./workbench-model";

type Change = {
  collection: string;
  id: string;
  kind: string;
  before: unknown;
  after: unknown;
};
export function CompositionDifferences({
  changes,
  base,
  candidate,
  working,
  surfaceId,
  navigate,
}: {
  changes: Change[];
  base: Json;
  candidate: Json;
  working: Json;
  surfaceId: string;
  navigate: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [scope, setScope] = useState("all");
  const before = composeGraph(base),
    after = composeGraph(candidate),
    current = composeGraph(working);
  function path(model: ReturnType<typeof composeGraph>, key: string) {
    const result = [];
    const seen = new Set<string>();
    let node = model.map.get(key);
    while (node && !seen.has(node.key)) {
      seen.add(node.key);
      result.unshift(node);
      node = node.parent ? model.map.get(node.parent) : undefined;
    }
    return result;
  }
  const entries = changes.map((change) => {
    const key = `${change.collection}:${change.id}`;
    const oldPath = path(before, key),
      newPath = path(after, key);
    const nodes = newPath.length ? newPath : oldPath;
    return {
      change,
      key,
      nodes,
      label: nodes.at(-1)?.label || change.collection,
      inSurface: [...oldPath, ...newPath].some(
        (n) => n.key === `surfaces:${surfaceId}`,
      ),
    };
  });
  const visible = entries.filter(
    (e) =>
      (kind === "all" || e.change.kind === kind) &&
      (scope === "all" || e.inSurface) &&
      `${e.label} ${e.key} ${e.nodes.map((n) => n.label).join(" ")} ${differences(
        e.change.before,
        e.change.after,
      )
        .map((d) => d.path)
        .join(" ")}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <section
      id="studio-composition-differences"
      tabIndex={-1}
      aria-label="Configuration differences"
      className="studio-differences"
    >
      <header>
        <h2>Changes ({changes.length})</h2>
        <div className="studio-differences__counts">
          {["added", "changed", "removed"].map((k) => (
            <Badge key={k}>
              {k}: {changes.filter((c) => c.kind === k).length}
            </Badge>
          ))}
        </div>
      </header>
      <div className="studio-differences__filters">
        <div>
          <Label htmlFor="difference-search">Search changes</Label>
          <Input
            id="difference-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Object, property or path…"
          />
        </div>
        <div>
          <Label htmlFor="difference-kind">Change type</Label>
          <Select
            id="difference-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">All changes</option>
            {["added", "changed", "removed"].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="difference-scope">Scope</Label>
          <Select
            id="difference-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="all">Whole configuration</option>
            <option value="surface" disabled={!surfaceId}>
              Selected surface
            </option>
          </Select>
        </div>
      </div>
      <p role="status">
        {visible.length} of {changes.length} changed objects
      </p>
      {visible.length ? (
        <ul className="studio-differences__list">
          {visible.map(({ change: c, key, nodes, label }) => (
            <li key={key}>
              <header>
                <div>
                  <p className="studio-differences__path">
                    {nodes
                      .slice(0, -1)
                      .map((n) => n.label)
                      .join(" › ") ||
                      nodes.at(-1)?.kind ||
                      c.collection}
                  </p>
                  <strong>{label}</strong> <Badge>{c.kind}</Badge>
                </div>
                {current.map.has(key) ? (
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => navigate(key)}
                  >
                    Inspect object
                  </Button>
                ) : (
                  <span>
                    {c.kind === "removed"
                      ? "Removed from this configuration"
                      : "Unavailable in current workspace"}
                  </span>
                )}
              </header>
              <div className="studio-differences__table-wrap">
                <table>
                  <caption>Property changes for {label}</caption>
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Before</th>
                      <th>After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {differences(c.before ?? {}, c.after ?? {}).map((d) => (
                      <tr key={d.path}>
                        <th scope="row">{d.path || "Object"}</th>
                        <td>{display(d.before)}</td>
                        <td>{display(d.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details>
                <summary>Technical details · before / after values</summary>
                <div className="studio-composition-review__previews">
                  <pre>{display(c.before)}</pre>
                  <pre>{display(c.after)}</pre>
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {changes.length
            ? "No changes match these filters."
            : "No differences between these configurations."}
        </p>
      )}
      {(query || kind !== "all" || scope !== "all") && (
        <Button
          variant="ghost"
          onClick={() => {
            setQuery("");
            setKind("all");
            setScope("all");
          }}
        >
          Clear change filters
        </Button>
      )}
    </section>
  );
}
