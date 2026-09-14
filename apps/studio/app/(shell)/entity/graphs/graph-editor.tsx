"use client";
import { IntakeSurfacePreview } from "./intake-surface-preview";
import React, { useEffect, useRef, useState } from "react";
import { ApiTransportError } from "@athyper/platform-api-client";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import {
  object,
  list,
  read,
  fork,
  save,
  type ChangeSet,
  type Loaded,
} from "./graph-model";
export function GraphEditor() {
  return <GraphEditorForm client={useApiClient()} />;
}
export function GraphEditorForm({
  client,
}: {
  readonly client: ReturnType<typeof useApiClient>;
}) {
  const [items, setItems] = useState<ChangeSet[]>([]);
  const [current, setCurrent] = useState<Loaded>();
  const [text, setText] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dirty = Boolean(
    current && text !== JSON.stringify(current.graph, null, 2),
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void client
      .request(list)
      .then((rows) => {
        if (mounted.current) setItems(rows);
      })
      .catch((error) => {
        if (mounted.current)
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to load change sets",
          );
      });
    return () => {
      mounted.current = false;
    };
  }, [client]);
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (error) {
      if (error instanceof ApiTransportError && error.kind === "conflict") {
        setConflict(true);
        setMessage(
          "This draft changed on the server. Your edits are preserved. Copy them before reloading the latest draft.",
        );
      } else
        setMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function load(id: string) {
    const result = await client.request(read, { params: { id } });
    setConflict(false);
    setCurrent(result);
    setText(JSON.stringify(result.graph, null, 2));
  }
  async function saveDraft() {
    if (!current || conflict || busy) return;
    const graph = object(JSON.parse(text));
    const result = await client.request(save, {
      params: { id: current.changeSet.id },
      body: { ...graph, expectedRevision: current.changeSet.revision },
    });
    // Adopt the server revision immediately: a subsequent read failure must not
    // invite a duplicate write using the previous revision.
    setCurrent({
      ...current,
      changeSet: result,
      graph,
      preview: result.preview,
    });
    setMessage("Draft saved. Loading the stored graph…");
    await load(result.id);
    setMessage(
      result.preview
        ? "Draft saved; preview status shown below."
        : "Draft saved. Local preview is not enabled in this environment.",
    );
    setItems(await client.request(list));
  }
  return (
    <section className="space-y-4 p-4" aria-label="Meta Entity graph authoring">
      <label className="block">
        Change set{" "}
        <select
          className="ml-2 rounded border bg-background p-2"
          disabled={busy || dirty}
          value={current?.changeSet.id ?? ""}
          onChange={(event) => {
            const id = event.target.value;
            if (id) void perform(() => load(id));
          }}
        >
          <option value="">Select a change set</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.entityCode} · {item.status} · revision {item.revision} ·{" "}
              {item.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      {current && (
        <>
          <p>
            {current.changeSet.title} · Saved revision{" "}
            {current.changeSet.revision} · <code>{current.changeSet.id}</code>
          </p>
          {current.changeSet.status === "published" && (
            <button
              className="rounded border px-3 py-2"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  const draft = await client.request(fork, {
                    params: { id: current.changeSet.id },
                  });
                  setItems(await client.request(list));
                  await load(draft.id);
                })
              }
            >
              Create working draft
            </button>
          )}
          <IntakeSurfacePreview key={current.changeSet.id} text={text} revision={`${current.changeSet.id}:${current.changeSet.revision}`}/>
          <label className="block" htmlFor="native-entity-graph">
            Native entity graph
          </label>
          <textarea
            id="native-entity-graph"
            wrap="off"
            style={{
              display: "block",
              width: "100%",
              height: "28rem",
              overflow: "auto",
              fontFamily: "monospace",
            }}
            spellCheck={false}
            className="min-h-[28rem] w-full rounded border bg-background p-3 font-mono text-sm"
            value={text}
            readOnly={busy || current.changeSet.status !== "draft"}
            onInput={(event) => setText(event.currentTarget.value)}
          />
          {dirty && (
            <button
              className="mr-2 rounded border px-3 py-2"
              disabled={busy}
              onClick={() => setText(JSON.stringify(current.graph, null, 2))}
            >
              Discard unsaved edits
            </button>
          )}
          {current.changeSet.status === "draft" && (
            <button
              className="rounded border px-3 py-2"
              disabled={busy || conflict}
              onClick={() => void perform(saveDraft)}
            >
              {busy ? "Saving and compiling…" : "Save draft"}
            </button>
          )}
          {current.preview && (
            <div role="status" className="rounded border p-3">
              <p>Preview: {current.preview.state}</p>
              <p>
                Preview save: {current.preview.changeSetId} · revision{" "}
                {current.preview.savedRevision}
              </p>
              <p>
                Active: {current.preview.activeChangeSetId ?? "None"} · revision{" "}
                {current.preview.activeRevision ?? "None"}
              </p>
              {current.preview.error && (
                <p className="text-destructive">{current.preview.error}</p>
              )}
              <p>Local development evidence</p>
            </div>
          )}
        </>
      )}
      {conflict && current && (
        <button
          disabled={busy}
          onClick={() => void perform(() => load(current.changeSet.id))}
        >
          Discard edits and reload latest
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
