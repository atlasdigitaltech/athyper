"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  parseExperienceSurface,
  type ExperienceBlock,
} from "@athyper/contract-platform-dashboard";
import type { useApiClient } from "@athyper/platform-shell-app-foundation";
import {
  policy,
  saveDraft,
  generateAtlasDraft,
  publish,
  historyOperation,
  rollbackOperation,
  template,
  message,
  type SurfaceRelease,
} from "./experience-composer-model";
export function useExperienceComposer(
  client: ReturnType<typeof useApiClient>,
  initialDefinition: unknown,
) {
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
  return {
    source,
    setSource,
    saved,
    dirty,
    historyLoading,
    historyFailed,
    setHistoryAttempt,
    releases,
    atlasInstruction,
    setAtlasInstruction,
    status,
    busy,
    validation,
    markEdited,
    settleAttempt,
    add,
    save,
    publishSaved,
    generate,
    rollback,
  };
}
