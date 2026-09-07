"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  parseExperienceSurface,
  type ExperienceBlock,
} from "@athyper/contract-platform-dashboard";
import { createOperation } from "@athyper/platform-api-client";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import {
  ExperienceSurfaceView,
  type ExperienceRuntimeRegistry,
} from "@athyper/platform-shell-dashboard";

const policy = {
  dataSources: new Set(["catalog.summary"]),
  actions: new Set(["catalog.navigate"]),
  extensions: new Set([
    "studio.preview",
    "neon.atlas-welcome",
    "mesh.network-overview",
  ]),
};
const templates: readonly ExperienceBlock["type"][] = [
  "heading",
  "text",
  "card",
  "chart",
  "shortcut",
  "onboarding",
  "quick-list",
  "number-card",
  "extension",
];
const saveDraft = createOperation<
  SurfaceRelease,
  {
    readonly targetPlane: "studio" | "neon" | "mesh";
    readonly layer: "tenant";
    readonly definition: unknown;
    readonly expectedContentHash?: string;
  }
>({
  method: "POST",
  path: "/studio/experience-surfaces/drafts",
  parse: release,
  idempotency: "required",
});
const generateAtlasDraft = createOperation<
  { readonly release: SurfaceRelease },
  {
    readonly targetPlane: "studio" | "neon" | "mesh";
    readonly layer: "tenant";
    readonly surfaceKey: string;
    readonly instruction: string;
    readonly baseDefinition: unknown;
    readonly expectedContentHash?: string;
  }
>({
  method: "POST",
  path: "/studio/experience-surfaces/atlas-drafts",
  parse: atlasDraft,
  idempotency: "required",
});
const publish = createOperation<SurfaceRelease>({
  method: "POST",
  path: ({ releaseId }) =>
    `/studio/experience-surfaces/${encodeURIComponent(releaseId)}/publish`,
  parse: release,
  idempotency: "required",
});
const historyOperation = createOperation<{
  readonly releases: readonly SurfaceRelease[];
}>({ method: "GET", path: "/studio/experience-surfaces", parse: history });
const rollbackOperation = createOperation<SurfaceRelease>({
  method: "POST",
  path: ({ releaseId }) =>
    `/studio/experience-surfaces/${encodeURIComponent(releaseId)}/rollback`,
  parse: release,
  idempotency: "required",
});
interface SurfaceRelease {
  readonly id: string;
  readonly revision: number;
  readonly status: "draft" | "published" | "retired";
  readonly targetPlane: "studio" | "neon" | "mesh";
  readonly contentHash: string;
  readonly definition: unknown;
}
const previewRegistry: ExperienceRuntimeRegistry = {
  dataSources: {
    "catalog.summary": () => ({ value: 0, items: [], chart: [] }),
  },
  actions: {
    "catalog.navigate": (input) =>
      typeof input.path === "string" && input.path.startsWith("/")
        ? input.path
        : "/home",
  },
  extensions: {
    "studio.preview": () => <p>Studio registered extension preview</p>,
    "neon.atlas-welcome": () => <p>Neon Atlas welcome extension</p>,
    "mesh.network-overview": () => <p>Mesh network overview extension</p>,
  },
};

export function ExperienceComposer({
  initialDefinition,
}: {
  readonly initialDefinition: unknown;
}) {
  return (
    <ExperienceComposerEditor
      client={useApiClient()}
      initialDefinition={initialDefinition}
    />
  );
}

export function ExperienceComposerEditor({
  client,
  initialDefinition,
}: {
  readonly client: ReturnType<typeof useApiClient>;
  readonly initialDefinition: unknown;
}) {
  const [source, setSource] = useState(() =>
    JSON.stringify(initialDefinition, null, 2),
  );
  const [saved, setSaved] = useState<SurfaceRelease>();
  const [dirty, setDirty] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [releases, setReleases] = useState<readonly SurfaceRelease[]>([]);
  const [atlasInstruction, setAtlasInstruction] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"save" | "publish" | "atlas" | "rollback">();
  const validation = useMemo(() => {
    try {
      return { surface: parseExperienceSurface(JSON.parse(source), policy) };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Invalid experience definition",
      };
    }
  }, [source]);
  const target =
    "surface" in validation && validation.surface
      ? {
          plane: validation.surface.scope.plane,
          surfaceKey: validation.surface.id,
        }
      : undefined;
  const targetPlane = target?.plane,
    targetSurfaceKey = target?.surfaceKey;
  // A single logical attempt keeps its idempotency key across retries; a manual edit rotates it.
  const attemptKeys = useRef<Record<string, string>>({});
  const dirtyRef = useRef(false);
  const historyTargetRef = useRef<string | undefined>(undefined);
  const attemptKey = (scope: string) =>
    (attemptKeys.current[scope] ??= `surface-${scope}-${crypto.randomUUID()}`);
  const settleAttempt = (scope: string) => {
    delete attemptKeys.current[scope];
  };
  const adoptServerSource = (definition: unknown) => {
    attemptKeys.current = {};
    dirtyRef.current = false;
    setDirty(false);
    setSource(JSON.stringify(definition, null, 2));
  };
  const markEdited = () => {
    dirtyRef.current = true;
    setDirty(true);
    settleAttempt("save");
    settleAttempt("atlas");
  };
  useEffect(() => {
    if (!targetPlane || !targetSurfaceKey) {
      setHistoryLoading(false);
      return;
    }
    const historyTarget = `${targetPlane}:${targetSurfaceKey}`;
    if (historyTargetRef.current !== historyTarget) {
      historyTargetRef.current = historyTarget;
      setSaved(undefined);
    }
    setHistoryLoading(true);
    setHistoryFailed(false);
    let active = true;
    const controller = new AbortController();
    setReleases([]);
    client
      .request(historyOperation, {
        query: { targetPlane, surfaceKey: targetSurfaceKey },
        signal: controller.signal,
      })
      .then(({ releases }) => {
        if (!active) return;
        setReleases(releases);
        const draft = releases.find((item) => item.status === "draft");
        if (draft) {
          // Temporary JSON syntax errors must not replace the revision the
          // administrator originally edited with a newer concurrency hash.
          setSaved((current) =>
            dirtyRef.current && current ? current : draft,
          );
          if (!dirtyRef.current) adoptServerSource(draft.definition);
        }
      })
      .catch((error) => {
        if (active && !controller.signal.aborted) {
          setHistoryFailed(true);
          setStatus(message(error));
        }
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [client, targetPlane, targetSurfaceKey, historyAttempt]);
  const add = (type: ExperienceBlock["type"]) => {
    if (!("surface" in validation) || !validation.surface) return;
    const block = template(type, validation.surface.blocks.length + 1);
    markEdited();
    setSource(
      JSON.stringify(
        {
          ...validation.surface,
          blocks: [...validation.surface.blocks, block],
        },
        null,
        2,
      ),
    );
  };
  const save = async () => {
    if (!("surface" in validation) || !validation.surface) return;
    setBusy("save");
    setStatus("");
    try {
      const result = await client.request(saveDraft, {
        body: {
          targetPlane: validation.surface.scope.plane,
          layer: "tenant",
          definition: validation.surface,
          ...(saved?.status === "draft"
            ? { expectedContentHash: saved.contentHash }
            : {}),
        },
        idempotencyKey: attemptKey("save"),
      });
      settleAttempt("save");
      setSaved(result);
      adoptServerSource(result.definition);
      setReleases((items) => [
        result,
        ...items.filter((item) => item.id !== result.id),
      ]);
      setStatus(`Draft revision ${result.revision} saved.`);
    } catch (error) {
      setStatus(message(error));
    } finally {
      setBusy(undefined);
    }
  };
  const publishSaved = async () => {
    if (!saved || dirty || saved.status !== "draft" || busy) return;
    setBusy("publish");
    setStatus("");
    try {
      const result = await client.request(publish, {
        params: { releaseId: saved.id },
        idempotencyKey: `surface-publish-${saved.id}`,
      });
      setSaved(result);
      setReleases((items) =>
        items.map((item) =>
          item.id === result.id
            ? result
            : item.status === "published"
              ? { ...item, status: "retired" }
              : item,
        ),
      );
      setStatus(
        `Revision ${result.revision} published to ${result.targetPlane}.`,
      );
    } catch (error) {
      setStatus(message(error));
    } finally {
      setBusy(undefined);
    }
  };
  const generate = async () => {
    if (
      !("surface" in validation) ||
      !validation.surface ||
      !atlasInstruction.trim()
    )
      return;
    setBusy("atlas");
    setStatus("");
    try {
      const { release: result } = await client.request(generateAtlasDraft, {
        body: {
          targetPlane: validation.surface.scope.plane,
          layer: "tenant",
          surfaceKey: validation.surface.id,
          instruction: atlasInstruction.trim(),
          baseDefinition: validation.surface,
          ...(saved?.status === "draft"
            ? { expectedContentHash: saved.contentHash }
            : {}),
        },
        idempotencyKey: attemptKey("atlas"),
      });
      settleAttempt("atlas");
      setSaved(result);
      adoptServerSource(result.definition);
      setReleases((items) => [
        result,
        ...items.filter((item) => item.id !== result.id),
      ]);
      setStatus(
        `Atlas generated draft revision ${result.revision}. Review and publish it manually when ready.`,
      );
    } catch (error) {
      setStatus(message(error));
    } finally {
      setBusy(undefined);
    }
  };
  const rollback = async (item: SurfaceRelease) => {
    if (busy) return;
    setBusy("rollback");
    setStatus("");
    try {
      const draft = await client.request(rollbackOperation, {
        params: { releaseId: item.id },
        idempotencyKey: attemptKey(`rollback-${item.id}`),
      });
      settleAttempt(`rollback-${item.id}`);
      setSaved(draft);
      adoptServerSource(draft.definition);
      setReleases((items) => [
        draft,
        ...items.filter((candidate) => candidate.status !== "draft"),
      ]);
      setStatus(
        `Revision ${item.revision} restored as review draft ${draft.revision}.`,
      );
    } catch (error) {
      setStatus(message(error));
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <fieldset
      disabled={Boolean(busy)}
      className="athyper-landing__grid"
      style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
    >
      <aside>
        <p>Templates</p>
        {templates.map((type) => (
          <button
            className="a-button"
            type="button"
            key={type}
            onClick={() => add(type)}
          >
            {label(type)}
          </button>
        ))}
      </aside>
      <section>
        <label htmlFor="experience-definition">
          <strong>Draft definition</strong>
        </label>
        <textarea
          id="experience-definition"
          rows={28}
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            markEdited();
          }}
          spellCheck={false}
        />
        <p role="status">
          {"surface" in validation
            ? `Valid · ${validation.surface?.blocks.length ?? 0} blocks`
            : validation.error}
        </p>
        <label htmlFor="atlas-surface-instruction">
          <strong>Atlas-assisted draft</strong>
        </label>
        <textarea
          id="atlas-surface-instruction"
          rows={3}
          maxLength={4000}
          placeholder="Describe the governed layout you want Atlas to propose…"
          value={atlasInstruction}
          onChange={(event) => {
            setAtlasInstruction(event.target.value);
            settleAttempt("atlas");
          }}
        />
        <div>
          <button
            className="a-button a-button--secondary"
            type="button"
            disabled={
              !("surface" in validation) ||
              historyLoading ||
              historyFailed ||
              Boolean(busy)
            }
            onClick={() => void save()}
          >
            {busy === "save" ? "Saving…" : "Save draft"}
          </button>
          <button
            className="a-button a-button--secondary"
            type="button"
            disabled={
              !("surface" in validation) ||
              !atlasInstruction.trim() ||
              historyLoading ||
              historyFailed ||
              Boolean(busy)
            }
            onClick={() => void generate()}
          >
            {busy === "atlas" ? "Generating…" : "Generate Atlas draft"}
          </button>
          <button
            className="a-button a-button--primary"
            type="button"
            disabled={
              !saved || dirty || saved.status !== "draft" || Boolean(busy)
            }
            onClick={() => void publishSaved()}
          >
            {busy === "publish" ? "Publishing…" : "Publish"}
          </button>
        </div>
        <p>
          Atlas creates a validated draft only. Publication always remains a
          separate human action.
        </p>
        <p role="status">{status}</p>
        {historyFailed ? (
          <button
            type="button"
            onClick={() => setHistoryAttempt((value) => value + 1)}
          >
            Retry loading history
          </button>
        ) : null}
      </section>
      <section>
        <h2>Validated preview</h2>
        {"surface" in validation && validation.surface ? (
          <ExperienceSurfaceView
            surface={validation.surface}
            registry={previewRegistry}
          />
        ) : (
          <p>Correct validation errors to preview this draft.</p>
        )}
        <h2>Release history</h2>
        {releases.length ? (
          <ol>
            {releases.map((item) => (
              <li key={item.id}>
                Revision {item.revision} · {item.status}{" "}
                <button
                  className="a-button a-button--secondary"
                  type="button"
                  disabled={Boolean(busy) || item.id === saved?.id}
                  onClick={() => void rollback(item)}
                >
                  Restore to draft
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p>No persisted releases yet.</p>
        )}
      </section>
    </fieldset>
  );
}

function template(
  type: ExperienceBlock["type"],
  index: number,
): ExperienceBlock {
  const id = `${type}.${index}`;
  switch (type) {
    case "heading":
      return { id, type, text: "New section" };
    case "text":
      return { id, type, text: "Add governed content." };
    case "card":
      return { id, type, title: "Card", body: "Add a concise description." };
    case "chart":
      return {
        id,
        type,
        title: "Chart",
        dataSource: "catalog.summary",
        visualization: "bar",
      };
    case "shortcut":
      return {
        id,
        type,
        title: "Shortcut",
        actions: [
          {
            action: "catalog.navigate",
            label: "Open",
            input: { path: "/home" },
          },
        ],
      };
    case "onboarding":
      return {
        id,
        type,
        title: "Onboarding",
        steps: [{ label: "First step" }],
      };
    case "quick-list":
      return { id, type, title: "Quick list", dataSource: "catalog.summary" };
    case "number-card":
      return { id, type, title: "Number card", dataSource: "catalog.summary" };
    case "extension":
      return {
        id,
        type,
        title: "Registered extension",
        extension: "studio.preview",
        config: {},
      };
  }
}
function label(value: string): string {
  return value
    .replace(/-/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}
function release(value: unknown): SurfaceRelease {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Surface release is invalid");
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" ||
    typeof item.revision !== "number" ||
    !Number.isInteger(item.revision) ||
    (item.status !== "draft" &&
      item.status !== "published" &&
      item.status !== "retired") ||
    (item.targetPlane !== "studio" &&
      item.targetPlane !== "neon" &&
      item.targetPlane !== "mesh") ||
    typeof item.contentHash !== "string" ||
    !item.definition ||
    typeof item.definition !== "object"
  )
    throw new TypeError("Surface release is invalid");
  return Object.freeze({
    id: item.id,
    revision: item.revision,
    status: item.status,
    targetPlane: item.targetPlane,
    contentHash: item.contentHash,
    definition: item.definition,
  });
}
function history(value: unknown): {
  readonly releases: readonly SurfaceRelease[];
} {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Array.isArray((value as Record<string, unknown>).releases)
  )
    throw new TypeError("Surface history is invalid");
  return Object.freeze({
    releases: Object.freeze(
      ((value as Record<string, unknown>).releases as unknown[]).map(release),
    ),
  });
}
function atlasDraft(value: unknown): { readonly release: SurfaceRelease } {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Atlas surface draft response is invalid");
  return Object.freeze({
    release: release((value as Record<string, unknown>).release),
  });
}
function message(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "The experience operation could not be completed.";
}
