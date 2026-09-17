"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import {
  display,
  inspectionRead,
  record,
  rows,
  type Inspection,
  type Json,
} from "./workbench-model";
import {
  differences,
  editableProperties,
  editProperty,
  forkWorkingDraft,
  saveWorkingDraft,
  type EditableCollection,
} from "./workbench-edit-model";
export function WorkbenchEditor({
  inspection,
  compact = false,
  onSelect,
  onGuardChange,
  onSaved,
  renderPreview,
}: {
  inspection: Inspection;
  compact?: boolean;
  onSelect: (selection: string) => void;
  onGuardChange: (dirty: boolean, busy: boolean) => void;
  onSaved: (inspection: Inspection) => void;
  renderPreview?: (graph: Json, revision: string) => ReactNode;
}) {
  const http = useApiClient(),
    [base, setBase] = useState(inspection),
    [graph, setGraph] = useState(inspection.data),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState(inspection.preview),
    [collection, setCollection] = useState<EditableCollection>(
      "surfaceFieldBindings",
    ),
    [index, setIndex] = useState(0);
  const mounted = useRef(true);
  const changes = differences(base.data, graph),
    dirty = changes.length > 0;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      onGuardChange(false, false);
    };
  }, [onGuardChange]);
  useEffect(() => onGuardChange(dirty, busy), [dirty, busy, onGuardChange]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element)?.closest?.("a[href]");
      if (!link) return;
      if (
        busy ||
        !window.confirm(
          "Discard unsaved configuration changes and leave this page?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty, busy]);
  async function fork() {
    if (!inspection.changeSetId) return;
    setBusy(true);
    setMessage("");
    try {
      const draft = await http.request(
        forkWorkingDraft(inspection.changeSetId),
        {},
      );
      if (!mounted.current) return;
      if (typeof draft.id !== "string" || draft.status !== "draft")
        throw Error("No editable working draft was returned");
      onGuardChange(false, false);
      onSelect(`draft:${draft.id}`);
    } catch (error) {
      if (mounted.current) setMessage(errorText(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function reload() {
    if (
      dirty &&
      !window.confirm("Discard local changes and reload the stored draft?")
    )
      return;
    setBusy(true);
    try {
      const current = await http.request(inspectionRead("draft", base.id), {});
      if (!mounted.current) return;
      setBase(current);
      setGraph(current.data);
      onSaved(current);
      setPreview(current.preview);
      setBlocked(false);
      setMessage(
        "Reloaded the stored draft. Review its current version before editing.",
      );
    } catch (error) {
      if (mounted.current) setMessage(errorText(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const expectedRevision = Number(base.version);
      if (!Number.isSafeInteger(expectedRevision))
        throw Error("Invalid saved revision");
      const saved = await http.request(saveWorkingDraft(base.id), {
        body: { ...graph, expectedRevision },
      });
      if (!mounted.current) return;
      setPreview(
        saved.preview === undefined ? undefined : record(saved.preview),
      );
      // The authoritative read verifies both edited and unrelated graph members.
      const current = await http.request(inspectionRead("draft", base.id), {});
      if (!mounted.current) return;
      if (
        String(saved.revision) !== current.version ||
        differences(graph, current.data).length
      ) {
        setBlocked(true);
        setMessage(
          "The save returned, but the stored graph differs from your submitted revision. Your local changes are retained. Reload and review before saving again.",
        );
        return;
      }
      setBase(current);
      setGraph(current.data);
      onSaved(current);
      setPreview(current.preview ?? record(saved.preview));
      setMessage(
        "Saved and verified: the stored graph matches the submitted configuration, including unrelated content.",
      );
    } catch (error) {
      if (mounted.current) {
        setBlocked(true);
        setMessage(
          `${errorText(error)} Your local changes are retained. Reload the stored draft before another save; the previous save may have completed.`,
        );
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const editable = base.source === "draft" && base.status === "draft";
  if (!editable && compact)
    return (
      <div className="studio-draft-launcher">
        <details>
          <summary className="a-button a-button--secondary">
            + New draft
          </summary>
          <div className="studio-draft-launcher__panel">
            <strong>Open or create a working draft</strong>
            <p>
              This entity currently supports one working draft. If one exists,
              it will open; its baseline may differ from this release.
            </p>
            <button
              type="button"
              className="a-button a-button--primary"
              disabled={busy || !inspection.changeSetId}
              onClick={() => void fork()}
            >
              {busy ? "Opening…" : "Open or create working draft"}
            </button>
          </div>
        </details>
        {message ? <p role="alert">{message}</p> : null}
      </div>
    );
  if (!editable)
    return (
      <section className="bp-focused-editor">
        <h3>Focused editing</h3>
        {inspection.changeSetId &&
        (inspection.source === "release" ||
          inspection.status === "published") ? (
          <>
            <p>
              Published configuration stays immutable. Open or create this
              entity’s working draft to edit presentation settings. An existing
              working draft may have a different baseline; its own revision will
              be shown.
            </p>
            <button
              type="button"
              className="a-button a-button--secondary"
              disabled={busy}
              onClick={() => void fork()}
            >
              Open or create working draft
            </button>
          </>
        ) : (
          <p>
            Focused editing uses a native entity working draft. Select a native
            release or change set above.
          </p>
        )}
        {message ? <p role="alert">{message}</p> : null}
      </section>
    );
  const members = rows(graph[collection]),
    member = members[index];
  return (
    <section className="bp-focused-editor" aria-label="Focused draft editing">
      <h3>Focused draft editing · saved revision {base.version}</h3>
      <p>
        Edit surface titles, field labels, help text, placeholders, and layout
        columns. Field types, required rules, IDs, permissions, and
        relationships are preserved. Inspection tabs below show the last loaded
        source; these controls and differences show your working copy.
      </p>
      <div className="bp-workbench-facts">
        <label>
          Configuration area
          <select
            disabled={busy}
            value={collection}
            onChange={(e) => {
              setCollection(e.target.value as EditableCollection);
              setIndex(0);
            }}
          >
            <option value="surfaceFieldBindings">Field placements</option>
            <option value="surfaces">Surfaces</option>
            <option value="surfaceSections">Sections</option>
          </select>
        </label>
        <label>
          Member
          <select
            disabled={busy}
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          >
            {members.map((item, i) => (
              <option key={String(item.id ?? i)} value={i}>
                {display(
                  item.bindingKey ??
                    item.surfaceKey ??
                    item.sectionKey ??
                    item.id,
                )}{" "}
                ·{" "}
                {display(
                  item.title ?? item.labelOverride ?? item.entityFieldId,
                )}
              </option>
            ))}
          </select>
        </label>
      </div>
      {member ? (
        <div className="bp-workbench-facts">
          {editableProperties[collection].map((key) => (
            <label key={`${collection}-${index}-${key}`}>
              {key}
              <input
                type={
                  key === "columnSpan" || key === "columnCount"
                    ? "number"
                    : "text"
                }
                min={1}
                max={12}
                maxLength={2000}
                disabled={busy || blocked}
                value={member[key] === undefined ? "" : String(member[key])}
                onChange={(e) => {
                  try {
                    setGraph(
                      editProperty(
                        graph,
                        collection,
                        index,
                        key,
                        e.target.type === "number"
                          ? Number(e.target.value)
                          : e.target.value,
                      ),
                    );
                    setMessage("");
                  } catch (error) {
                    setMessage(errorText(error));
                  }
                }}
              />
            </label>
          ))}
        </div>
      ) : (
        <p>No editable members in this collection.</p>
      )}
      <h4>Review changes ({changes.length})</h4>
      {changes.length ? (
        <div className="bp-inspection-table">
          <table>
            <thead>
              <tr>
                <th>Property</th>
                <th>Stored value</th>
                <th>Working value</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr key={change.path}>
                  <td>{change.path}</td>
                  <td>{display(change.before)}</td>
                  <td>{display(change.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No unsaved changes.</p>
      )}
      <div className="bp-editor-actions">
        <button
          type="button"
          className="a-button"
          disabled={busy || blocked || !dirty}
          onClick={() => void save()}
        >
          {busy ? "Working…" : "Save draft and check preview"}
        </button>
        <button
          type="button"
          className="a-button a-button--secondary"
          disabled={busy || !dirty}
          onClick={() => {
            setGraph(base.data);
            setMessage("");
          }}
        >
          Discard local changes
        </button>
        <button
          type="button"
          className="a-button a-button--secondary"
          disabled={busy}
          onClick={() => void reload()}
        >
          Reload stored draft
        </button>
      </div>
      {message ? <p role="status">{message}</p> : null}
      {renderPreview ? (
        <div>
          <h4>Form preview of working copy</h4>
          <p>This local rendering does not activate or save the draft.</p>
          {renderPreview(
            graph,
            `${base.id}:${base.version}:${JSON.stringify(changes)}`,
          )}
        </div>
      ) : null}
      <h4>Development preview</h4>
      {preview && Object.keys(preview).length ? (
        <>
          <p>
            State: {display(preview.state)} · Saved revision:{" "}
            {display(preview.savedRevision)} · Active revision:{" "}
            {display(preview.activeRevision)}
          </p>
          {preview.error ? <p role="alert">{display(preview.error)}</p> : null}
        </>
      ) : (
        <p>
          Preview status is unavailable. Saving a draft does not prove Neon
          activation. Local preview must be enabled in the server environment.
        </p>
      )}
      <p>
        Formal publication and approval remain separate. Test a new Neon request
        only after the expected preview revision is active.
      </p>
    </section>
  );
}
function errorText(error: unknown) {
  return record(error).status === 409
    ? "The draft changed on the server (revision conflict)."
    : error instanceof Error
      ? error.message
      : "The operation could not be completed.";
}
