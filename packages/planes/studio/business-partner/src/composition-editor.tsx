"use client";
import {
  configurationEdit,
  configurationProperties,
} from "./composition-configuration";
import { ConfigurationControls } from "./composition-configuration-controls";
import { useEffect, useRef, useState } from "react";
import { Button, Input, Label } from "@athyper/platform-ui";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import {
  CompositionWorkspace,
  type CompositionSelection,
} from "./composition-workspace";
import {
  CompositionReview,
  compositionChanges,
  type CompositionPreview,
} from "./composition-review";
import { useCompositionEvidence } from "./composition-evidence";
import { CompositionStructureControls } from "./composition-structure-controls";
import { structuralEdit } from "./composition-structure";
import { compositionEdit } from "./composition-edit";
import {
  differences,
  editableProperties,
  saveWorkingDraft,
  type EditableCollection,
} from "./workbench-edit-model";
import {
  display,
  inspectionRead,
  record,
  rows,
  type Inspection,
  type Json,
} from "./workbench-model";
export function CompositionEditor({
  inspection,
  selection,
  onSelect,
  onSaved,
  onGuardChange,
  renderPreview,
  locked = false,
}: {
  renderPreview?: CompositionPreview;
  inspection: Inspection;
  selection?: CompositionSelection;
  onSelect?: (s: CompositionSelection) => void;
  onSaved: (s: Inspection) => void;
  onGuardChange: (dirty: boolean, busy: boolean) => void;
  locked?: boolean;
}) {
  const { recordCheck } = useCompositionEvidence();
  const [reviewBase] = useState(inspection);
  const http = useApiClient();
  const [base, setBase] = useState(inspection),
    [graph, setGraph] = useState(inspection.data),
    [history, setHistory] = useState<Json[]>([]),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false),
    [message, setMessage] = useState(""),
    [remote, setRemote] = useState<Inspection>();
  const live = useRef(true),
    lock = useRef(false),
    callbacks = useRef({ onSaved, onGuardChange });
  callbacks.current = { onSaved, onGuardChange };
  const dirty = differences(base.data, graph).length > 0;
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      callbacks.current.onGuardChange(false, false);
    };
  }, []);
  useEffect(() => {
    callbacks.current.onGuardChange(dirty, busy);
  }, [dirty, busy]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const navigate = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest?.("a[href]")) return;
      if (
        busy ||
        !window.confirm(
          "Discard unsaved composition changes and leave this page?",
        )
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty, busy]);
  async function readRemote(discard: boolean) {
    if (lock.current || locked) return;
    if (
      discard &&
      dirty &&
      !window.confirm("Discard your local edits and load the stored draft?")
    )
      return;
    lock.current = true;
    setBusy(true);
    try {
      const current = await http.request(inspectionRead("draft", base.id), {});
      if (!live.current) return;
      if (discard) {
        setBase(current);
        setGraph(current.data);
        setHistory([]);
        setRemote(undefined);
        setBlocked(false);
        callbacks.current.onSaved(current);
        setMessage(
          "Stored draft reloaded. Review the current revision before editing.",
        );
      } else {
        setRemote(current);
        setMessage(
          "Latest stored draft loaded for comparison. Your local edits are retained.",
        );
      }
    } catch (e) {
      if (live.current)
        setMessage(
          e instanceof Error ? e.message : "Could not read the stored draft.",
        );
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function save() {
    if (lock.current || locked || blocked || !dirty || base.status !== "draft")
      return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    const submitted = graph;
    try {
      const revision = Number(base.version);
      if (!Number.isSafeInteger(revision))
        throw Error("Saved revision is invalid.");
      const result = await http.request(saveWorkingDraft(base.id), {
        body: { ...submitted, expectedRevision: revision },
      });
      const current = await http.request(inspectionRead("draft", base.id), {});
      if (!live.current) return;
      if (
        current.version !== String(result.revision) ||
        differences(submitted, current.data).length
      ) {
        setRemote(current);
        throw Error("The stored graph does not match the submitted revision.");
      }
      recordCheck({
        kind: "save",
        source: `draft:${current.id}`,
        revision: current.version,
        graph: current.data,
        observedAt: new Date().toISOString(),
        report: {
          matched: true,
          comparison: "Complete submitted graph equals stored reread",
        },
      });
      setBase(current);
      setGraph(current.data);
      setHistory([]);
      setBlocked(false);
      setRemote(undefined);
      callbacks.current.onSaved(current);
      setMessage(
        "Saved and reread: the complete stored graph matches your submission. Preview activation and publication are separate.",
      );
    } catch (e) {
      if (live.current) {
        setBlocked(true);
        setMessage(
          `${e instanceof Error ? e.message : "Save failed."} Your local edits are retained. Compare the stored draft, then reload before another save; the previous request may have completed.`,
        );
      }
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  const editable = base.source === "draft" && base.status === "draft";
  return (
    <div className="studio-composition-edit">
      <div className="studio-composition-edit__toolbar">
        <div>
          <strong>
            {dirty ? "Unsaved changes" : "Saved draft"} · revision{" "}
            {base.version}
          </strong>
          <p>Changes stay local until you save the draft.</p>
        </div>
        <div className="studio-composition-edit__actions">
          <Button
            variant="secondary"
            disabled={!history.length || busy || locked || blocked}
            onClick={() => {
              setGraph(history[history.length - 1]!);
              setHistory(history.slice(0, -1));
              setMessage("Previous local edit restored.");
            }}
          >
            Undo
          </Button>
          <Button
            variant="secondary"
            disabled={busy || locked}
            onClick={() => void readRemote(true)}
          >
            Reload stored draft
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              document.getElementById("studio-preview-changes")?.focus()
            }
          >
            Preview & changes
          </Button>
          <Button
            disabled={!editable || !dirty || busy || locked || blocked}
            loading={busy}
            onClick={() => void save()}
          >
            Save draft
          </Button>
        </div>
      </div>
      {message ? <p role={blocked ? "alert" : "status"}>{message}</p> : null}
      {blocked ? (
        <Button
          variant="secondary"
          disabled={busy || locked}
          onClick={() => void readRemote(false)}
        >
          Compare latest stored draft
        </Button>
      ) : null}
      {remote ? (
        <details open>
          <summary>
            Stored revision {remote.version} compared with your working copy
          </summary>
          <p>
            Reloading discards local edits. No automatic merge or retry is
            performed.
          </p>
          <pre>{JSON.stringify(differences(remote.data, graph), null, 2)}</pre>
        </details>
      ) : null}
      <CompositionWorkspace
        inspection={{ ...base, data: graph }}
        selection={selection}
        onSelect={onSelect}
        editable={editable}
        changedKeys={
          new Set(
            compositionChanges(base.data, graph).map(
              (c) => `${c.collection}:${c.id}`,
            ),
          )
        }
        canEdit={(node) =>
          !busy &&
          !locked &&
          !blocked &&
          (Object.hasOwn(editableProperties, node.collection) ||
            Object.hasOwn(configurationProperties, node.collection)) &&
          !node.issues.length
        }
        renderProperties={(node, panel) => {
          const properties = Object.prototype.hasOwnProperty.call(
            editableProperties,
            node.collection,
          )
            ? editableProperties[node.collection as EditableCollection]
            : [];
          if (
            !editable ||
            (!properties.length && !configurationProperties[node.collection])
          )
            return null;
          const id = String(node.value.id ?? "");
          const unique =
            rows(graph[node.collection]).filter((r) => r.id === id).length ===
            1;
          return (
            <fieldset
              className="studio-composition-edit__fields"
              hidden={panel === "References"}
              disabled={busy || locked || blocked || !unique}
            >
              <legend>Configuration settings</legend>
              <div
                hidden={
                  panel !==
                  (node.collection === "surfaceFieldBindings"
                    ? "Rules"
                    : "Properties")
                }
              >
                <ConfigurationControls
                  graph={graph}
                  node={node}
                  onApply={(property, value) => {
                    if (busy || locked || blocked || lock.current) return;
                    try {
                      const next = configurationEdit(
                        graph,
                        node.collection,
                        id,
                        property,
                        value,
                      );
                      setHistory([...history, graph]);
                      setGraph(next);
                      setMessage(
                        "Configuration updated locally. Review differences and validate before publication.",
                      );
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "Unsupported configuration.",
                      );
                    }
                  }}
                />
              </div>
              <div hidden={panel !== "Properties"}>
                {[
                  "surfaces",
                  "surfaceSections",
                  "surfaceFieldBindings",
                ].includes(node.collection) ? (
                  <CompositionStructureControls
                    key={node.key}
                    graph={graph}
                    node={node}
                    onApply={(command) => {
                      if (busy || locked || blocked || lock.current) return;
                      try {
                        const next = structuralEdit(graph, command);
                        setHistory([...history, graph]);
                        setGraph(next);
                        setMessage(
                          "Structure updated locally. Review the preview and differences before saving.",
                        );
                        if (
                          command.kind === "section" ||
                          command.kind === "placement"
                        )
                          onSelect?.({
                            source: `${base.source}:${base.id}`,
                            node: `${command.kind === "section" ? "surfaceSections" : "surfaceFieldBindings"}:${command.id}`,
                          });
                        if (command.kind === "remove" && node.parent)
                          onSelect?.({
                            source: `${base.source}:${base.id}`,
                            node: node.parent,
                          });
                      } catch (error) {
                        setMessage(
                          error instanceof Error
                            ? error.message
                            : "Structural change could not be applied.",
                        );
                      }
                    }}
                  />
                ) : null}
              </div>
              {properties.map((key) => {
                const numeric = ["columnCount", "columnSpan"].includes(key);
                const surface = rows(graph.surfaces).find(
                  (s) => s.id === node.value.entitySurfaceId,
                );
                const fullWidth =
                  key === "columnSpan" &&
                  record(surface?.layoutConfig).renderer === "intake" &&
                  ["choice_cards", "entity_lookup"].includes(
                    String(node.value.widgetKey),
                  );
                const inputId = `composition-${key}`;
                return (
                  <div
                    key={`${node.key}:${key}`}
                    hidden={panel !== "Properties"}
                  >
                    <Label htmlFor={inputId}>
                      {
                        (
                          {
                            labelOverride: "Display label",
                            helpText: "Help text",
                            placeholder: "Placeholder",
                            columnSpan: "Column span",
                            columnCount: "Columns",
                            title: "Title",
                            description: "Description",
                          } as Record<string, string>
                        )[key]
                      }
                    </Label>
                    <Input
                      id={inputId}
                      type={numeric ? "number" : "text"}
                      min={numeric ? 1 : undefined}
                      max={numeric ? 12 : undefined}
                      step={numeric ? 1 : undefined}
                      disabled={fullWidth}
                      value={String(node.value[key] ?? "")}
                      onChange={(e) => {
                        try {
                          const value = numeric
                            ? Number(e.target.value)
                            : e.target.value;
                          const next = compositionEdit(
                            graph,
                            node.collection,
                            id,
                            key,
                            value,
                          );
                          setHistory([...history, graph]);
                          setGraph(next);
                          setMessage("");
                        } catch (error) {
                          setMessage(
                            error instanceof Error
                              ? error.message
                              : "Unsupported edit.",
                          );
                        }
                      }}
                    />
                    {fullWidth ? (
                      <small>
                        This intake control requires a full-width span of 12.
                      </small>
                    ) : null}
                  </div>
                );
              })}
            </fieldset>
          );
        }}
      />
      <div id="studio-preview-changes" tabIndex={-1}>
        <CompositionReview
          baseline={reviewBase}
          saved={base}
          working={graph}
          selection={selection}
          onSelect={onSelect}
          renderPreview={renderPreview}
        />
      </div>
      {dirty ? (
        <details>
          <summary>Unsaved differences from revision {base.version}</summary>
          <pre>{JSON.stringify(differences(base.data, graph), null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}
