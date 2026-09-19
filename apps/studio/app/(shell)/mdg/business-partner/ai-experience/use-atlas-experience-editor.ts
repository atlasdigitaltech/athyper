"use client";
import { useEffect, useState } from "react";
import type {
  createAtlasExperienceAdminClient,
  AtlasExperienceRelease,
} from "@athyper/platform-shell";
import { DEFAULT_DEFINITION } from "./experience-defaults";
export function useAtlasExperienceEditor(
  client: ReturnType<typeof createAtlasExperienceAdminClient>,
) {
  const [definition, setDefinition] = useState(DEFAULT_DEFINITION),
    [release, setRelease] = useState<AtlasExperienceRelease | null>(null),
    [status, setStatus] = useState<
      "loading" | "ready" | "saving" | "publishing" | "error"
    >("loading"),
    [message, setMessage] = useState<string>(),
    [loadFailed, setLoadFailed] = useState(false),
    [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    setStatus("loading");
    setLoadFailed(false);
    setMessage(undefined);
    let active = true;
    const controller = new AbortController();
    void client
      .draft(controller.signal)
      .then((value) => {
        if (!active) return;
        if (value) {
          setRelease(value);
          setDefinition(value.definition);
        }
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setStatus("error");
        setLoadFailed(true);
        setMessage(
          "The saved draft could not be loaded. Retry before editing or publishing.",
        );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [client, loadAttempt]);
  const update = <K extends "widgets" | "searchSources" | "prompts" | "agents">(
    key: K,
    index: number,
    change: Record<string, unknown>,
  ) =>
    setDefinition((current) => ({
      ...current,
      [key]: current[key].map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...change } : item,
      ),
    }));
  async function save() {
    setStatus("saving");
    setMessage(undefined);
    try {
      const saved = await client.saveDraft(
        definition,
        release?.status === "draft" ? release.revision : undefined,
      );
      setRelease(saved);
      setDefinition(saved.definition);
      setStatus("ready");
      setMessage(`Draft revision ${saved.revision} saved.`);
    } catch {
      setStatus("error");
      setMessage(
        "The draft was not saved. Refresh if another administrator published a newer revision.",
      );
    }
  }
  async function publish() {
    setStatus("publishing");
    setMessage(undefined);
    try {
      const saved = await client.saveDraft(
        definition,
        release?.status === "draft" ? release.revision : undefined,
      );
      setRelease(saved);
      setDefinition(saved.definition);
      const published = await client.publish(definition.scope, saved.revision);
      setRelease(published);
      setStatus("ready");
      setMessage(
        `Revision ${published.revision} published in Studio. Neon and Mesh activate it after signed publication reconciliation.`,
      );
    } catch {
      setStatus("error");
      setMessage(
        "Publication was not completed. The previous published revision remains active.",
      );
    }
  }
  const busy =
    status === "loading" ||
    status === "saving" ||
    status === "publishing" ||
    loadFailed;
  return {
    definition,
    release,
    status,
    message,
    loadFailed,
    setLoadAttempt,
    update,
    save,
    publish,
    busy,
  };
}
