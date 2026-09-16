"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Label,
  PreviewFrame,
  Select,
} from "@athyper/platform-ui";
import { CompositionEvidence } from "./composition-evidence";
import { CompositionDifferences } from "./composition-differences";
import { composeGraph } from "./composition-model";
import { differences } from "./workbench-edit-model";
import { display, record, type Inspection, type Json } from "./workbench-model";
import type { CompositionSelection } from "./composition-workspace";
export type CompositionPreview = (
  graph: Json,
  revision: string,
  surfaceId: string,
) => ReactNode;
export function compositionChanges(before: Json, after: Json) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].flatMap((collection) => {
    const a =
        before[collection] === undefined && Array.isArray(after[collection])
          ? []
          : before[collection],
      b =
        after[collection] === undefined && Array.isArray(before[collection])
          ? []
          : after[collection];
    if (
      !Array.isArray(a) ||
      !Array.isArray(b) ||
      ![...a, ...b].every((v) => typeof record(v).id === "string") ||
      new Set(a.map((v) => record(v).id)).size !== a.length ||
      new Set(b.map((v) => record(v).id)).size !== b.length
    ) {
      return differences(a, b, collection).length
        ? [{ collection, id: "", kind: "changed", before: a, after: b }]
        : [];
    }
    const am = new Map(a.map((v) => [String(record(v).id), v])),
      bm = new Map(b.map((v) => [String(record(v).id), v]));
    return [...new Set([...am.keys(), ...bm.keys()])]
      .filter((id) => differences(am.get(id), bm.get(id)).length)
      .map((id) => ({
        collection,
        id,
        kind: !am.has(id) ? "added" : !bm.has(id) ? "removed" : "changed",
        before: am.get(id),
        after: bm.get(id),
      }));
  });
}
export function CompositionReview(props: Parameters<typeof ReviewContent>[0]) {
  return (
    <ReviewContent key={`${props.saved.source}:${props.saved.id}`} {...props} />
  );
}
function ReviewContent({
  baseline,
  saved,
  working,
  selection,
  onSelect,
  renderPreview,
}: {
  baseline: Inspection;
  saved: Inspection;
  working: Json;
  selection?: CompositionSelection;
  onSelect?: (value: CompositionSelection) => void;
  renderPreview?: CompositionPreview;
}) {
  const [mode, setMode] = useState("working"),
    [chosenSurface, setSurface] = useState(""),
    [layout, setLayout] = useState("split"),
    [viewport, setViewport] = useState("desktop"),
    [side, setSide] = useState("candidate"),
    [reset, setReset] = useState(0),
    [comparison, setComparison] = useState("loaded");
  const [history, setHistory] = useState<
    { revision: number; capturedAt: string; kind: string }[]
  >([]);
  const [snapshots, setSnapshots] = useState<Record<string, Json>>({});
  const [historyMessage, setHistoryMessage] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);
  const [refreshHistory, setRefreshHistory] = useState(0);
  const historyRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    if (saved.source !== "draft") return;
    const controller = new AbortController();
    setHistoryMessage("Loading saved revision history…");
    fetch(
      `/api/relay/meta-entity-authoring/change-sets/${encodeURIComponent(saved.id)}/history`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok)
          throw Error(
            "Saved revision history is unavailable. Session comparisons still work.",
          );
        return r.json();
      })
      .then((rows) => {
        if (!Array.isArray(rows)) throw Error("Invalid history response");
        if (!controller.signal.aborted) {
          setHistory(rows);
          setHistoryMessage(
            rows.length
              ? "Only retained snapshots are listed. Earlier unsnapshotted saves cannot be reconstructed."
              : "No saved snapshots are retained yet. Earlier saves cannot be reconstructed.",
          );
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setHistoryMessage(e.message);
      });
    return () => controller.abort();
  }, [saved.id, saved.source, saved.version, refreshHistory]);
  useEffect(() => () => historyRequest.current?.abort(), []);
  async function chooseHistory(value: string, side: "base" | "candidate") {
    historyRequest.current?.abort();
    const controller = new AbortController();
    historyRequest.current = controller;
    const commit = () =>
      side === "base" ? setComparison(value) : setMode(value);
    if (!value.startsWith("revision:") || snapshots[value]) {
      setHistoryBusy(false);
      commit();
      return;
    }
    setHistoryBusy(true);
    try {
      const revision = Number(value.slice(9));
      const r = await fetch(
        `/api/relay/meta-entity-authoring/change-sets/${encodeURIComponent(saved.id)}/history/${revision}`,
        { signal: controller.signal, cache: "no-store" },
      );
      if (!r.ok)
        throw Error(
          "That saved revision could not be loaded. The previous comparison is unchanged.",
        );
      const data = await r.json();
      if (
        data.revision !== revision ||
        !data.graph ||
        typeof data.graph !== "object"
      )
        throw Error("Invalid saved revision response");
      if (!controller.signal.aborted) {
        setSnapshots((previous) => ({ ...previous, [value]: data.graph }));
        commit();
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setHistoryMessage(
          e instanceof Error ? e.message : "History unavailable",
        );
    } finally {
      if (!controller.signal.aborted) setHistoryBusy(false);
    }
  }
  const historicalCandidate = mode.startsWith("revision:");
  const candidateVersion = historicalCandidate ? mode.slice(9) : saved.version;
  const graph = historicalCandidate
    ? snapshots[mode]!
    : mode === "saved"
      ? saved.data
      : working;
  const model = useMemo(() => composeGraph(graph), [graph]);
  let node = selection ? model.map.get(selection.node) : undefined;
  while (node && node.collection !== "surfaces")
    node = node.parent ? model.map.get(node.parent) : undefined;
  const base = comparison.startsWith("revision:")
    ? { ...saved, version: comparison.slice(9), data: snapshots[comparison]! }
    : comparison === "saved"
      ? saved
      : baseline;
  const baseModel = useMemo(() => composeGraph(base.data), [base.data]);
  const surfaces = [
    ...new Map(
      [...baseModel.nodes, ...model.nodes]
        .filter((n) => n.collection === "surfaces")
        .map((n) => [String(n.value.id), n]),
    ).values(),
  ];
  const surfaceId = surfaces.some((n) => String(n.value.id) === chosenSurface)
    ? chosenSurface
    : String(node?.value.id || surfaces[0]?.value.id || "");
  const workspaceModel = useMemo(() => composeGraph(working), [working]);
  const changes = compositionChanges(base.data, graph);
  const dirty = differences(saved.data, working).length > 0;
  const navigate = (key: string) => {
    if (!workspaceModel.map.has(key)) return;
    onSelect?.({
      source: `${saved.source}:${saved.id}`,
      node: key,
      reveal: Date.now(),
    });
  };
  return (
    <section
      className="studio-composition-review"
      aria-label="Preview and differences"
    >
      <header className="studio-composition-review__heading">
        <div>
          <h2>Preview and differences</h2>
          <p>Explore the form and review configuration changes.</p>
        </div>
        <Badge>Local preview</Badge>
      </header>
      <details className="studio-composition-review__source">
        <summary>
          Comparison base:{" "}
          {comparison.startsWith("revision:")
            ? "historical"
            : comparison === "saved"
              ? "saved"
              : "loaded"}{" "}
          {base.source} · revision {base.version}
        </summary>
        <p>
          {comparison.startsWith("revision:")
            ? "Immutable saved snapshot. Selecting it does not restore or modify the draft."
            : comparison === "loaded"
              ? "This base stays fixed at the revision loaded when the editor opened. It is not necessarily a published release or a fork parent."
              : "Compare the current saved graph with the candidate. This base advances after a successful save."}
        </p>
        <p>
          Base: {base.id}. Current change set state: {saved.status}. Candidate:{" "}
          {saved.id} · {saved.status} · saved revision {saved.version}.
        </p>
      </details>
      {saved.source === "draft" ? (
        <div>
          <p role="status">
            {historyBusy ? "Loading selected revision…" : historyMessage}
          </p>
          <Button
            variant="ghost"
            onClick={() => setRefreshHistory((n) => n + 1)}
          >
            Refresh revision history
          </Button>
        </div>
      ) : null}
      <div className="studio-composition-review__controls">
        <div>
          <Label htmlFor="review-comparison">Compare from</Label>
          <Select
            id="review-comparison"
            value={comparison}
            disabled={historyBusy}
            onChange={(e) => void chooseHistory(e.target.value, "base")}
          >
            <option value="loaded">
              When editor opened · revision {baseline.version}
            </option>
            <option value="saved">
              Latest saved · revision {saved.version}
            </option>
            {history.length ? (
              <optgroup label="Saved revision history">
                {history.map((row) => (
                  <option key={row.revision} value={`revision:${row.revision}`}>
                    Revision {row.revision} ·{" "}
                    {new Date(row.capturedAt).toLocaleString()}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </Select>
        </div>
        <div>
          <Label htmlFor="review-mode">Review configuration</Label>
          <Select
            id="review-mode"
            value={mode}
            disabled={historyBusy}
            onChange={(e) => void chooseHistory(e.target.value, "candidate")}
          >
            <option value="working">
              Working copy{dirty ? " · includes unsaved edits" : ""}
            </option>
            <option value="saved">
              Latest saved · revision {saved.version}
            </option>
            {history.length ? (
              <optgroup label="Saved revision history">
                {history.map((row) => (
                  <option key={row.revision} value={`revision:${row.revision}`}>
                    Revision {row.revision} ·{" "}
                    {new Date(row.capturedAt).toLocaleString()}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </Select>
        </div>
        <div>
          <Label htmlFor="review-surface">Preview surface</Label>
          <Select
            id="review-surface"
            value={surfaceId}
            onChange={(e) => setSurface(e.target.value)}
          >
            <option value="">Choose a surface</option>
            {surfaces.map((n) => (
              <option key={n.key} value={String(n.value.id)}>
                {n.label}
              </option>
            ))}
          </Select>
          {workspaceModel.map.has(`surfaces:${surfaceId}`) ? (
            <Button
              variant="ghost"
              onClick={() => navigate(`surfaces:${surfaceId}`)}
            >
              Inspect selected surface
            </Button>
          ) : null}
        </div>
      </div>
      <div className="studio-composition-review__toolbar">
        <div role="group" aria-label="Comparison layout">
          {["split", "unified"].map((value) => (
            <Button
              key={value}
              variant={layout === value ? "secondary" : "ghost"}
              aria-pressed={layout === value}
              onClick={() => setLayout(value)}
            >
              {value === "split" ? "Split" : "Unified"}
            </Button>
          ))}
        </div>
        <div role="group" aria-label="Preview viewport">
          {["desktop", "mobile"].map((value) => (
            <Button
              key={value}
              variant={viewport === value ? "secondary" : "ghost"}
              aria-pressed={viewport === value}
              onClick={() => setViewport(value)}
            >
              {value === "desktop" ? "Desktop · 1024px" : "Mobile · 390px"}
            </Button>
          ))}
        </div>
        <Button variant="ghost" onClick={() => setReset((value) => value + 1)}>
          Reset preview
        </Button>
      </div>
      <p className="studio-composition-review__hint">
        Local sample answers stay inside each preview. Business actions and
        external lookups are unavailable. This preview does not confirm
        deployment.
      </p>
      <div
        className="studio-composition-review__side-switch"
        role="group"
        aria-label="Visible preview"
      >
        {["base", "candidate"].map((value) => (
          <Button
            key={value}
            variant={side === value ? "secondary" : "ghost"}
            aria-pressed={side === value}
            onClick={() => setSide(value)}
          >
            {value === "base" ? "Base" : "Candidate"}
          </Button>
        ))}
      </div>
      <div
        className="studio-composition-review__canvases"
        data-layout={layout}
        data-side={side}
      >
        {["base", "candidate"].map((value) => {
          const isBase = value === "base";
          const previewGraph = isBase ? base.data : graph;
          const title = isBase
            ? `Base · ${base.source} revision ${base.version}`
            : mode === "saved" || historicalCandidate
              ? `Candidate · saved revision ${candidateVersion}`
              : `Candidate · working copy${dirty ? " · unsaved" : ""}`;
          return (
            <section
              key={value}
              className="studio-composition-review__canvas"
              data-side={value}
              aria-label={title}
            >
              <h3>{title}</h3>
              <PreviewFrame
                title={title}
                width={viewport === "mobile" ? 390 : 1024}
              >
                <div key={`${reset}-${surfaceId}`}>
                  {renderPreview ? (
                    renderPreview(
                      previewGraph,
                      `${value}-${isBase ? base.version : mode + candidateVersion}`,
                      surfaceId,
                    )
                  ) : (
                    <p role="status">
                      Preview unavailable: no renderer adapter is available.
                      Stored properties and differences remain available below.
                    </p>
                  )}
                </div>
              </PreviewFrame>
            </section>
          );
        })}
      </div>
      <p className="studio-composition-review__hint">
        Both canvases use the selected viewport width. Scroll within a frame
        when it exceeds the available space. Unified shows the candidate; on
        small screens use Base / Candidate.
      </p>
      <CompositionDifferences
        changes={changes}
        base={base.data}
        candidate={graph}
        working={working}
        surfaceId={surfaceId}
        navigate={navigate}
      />
      <CompositionEvidence inspection={{...saved, version: String(candidateVersion)}} graph={graph} localFindings={model.nodes.reduce((total, node) => total + node.issues.length, 0)} />
      <h3>Composition findings</h3>
      {model.nodes.some((n) => n.issues.length) ? (
        <ul>
          {model.nodes
            .filter((n) => n.issues.length)
            .map((n) => (
              <li key={n.key}>
                <Button
                  variant="ghost"
                  disabled={!workspaceModel.map.has(n.key)}
                  onClick={() => navigate(n.key)}
                >
                  {n.label}
                </Button>{" "}
                {n.issues.join(" ")}
              </li>
            ))}
        </ul>
      ) : (
        <p>
          No structural reference findings in this inspection. Backend
          validation is still required.
        </p>
      )}
    </section>
  );
}
