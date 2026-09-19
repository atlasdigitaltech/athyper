"use client";
import React from "react";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import {
  ExperienceSurfaceView,
  type ExperienceRuntimeRegistry,
} from "@athyper/platform-shell-dashboard";
import { templates, label } from "./experience-composer-model";
import { useExperienceComposer } from "./use-experience-composer";
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
  const {
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
  } = useExperienceComposer(client, initialDefinition);

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
