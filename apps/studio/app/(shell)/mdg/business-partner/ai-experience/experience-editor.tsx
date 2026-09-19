"use client";
import React, { useMemo } from "react";
import { createAtlasExperienceAdminClient } from "@athyper/platform-shell";
import { useAtlasExperienceEditor } from "./use-atlas-experience-editor";
import { ConfigSection, ConfigRow } from "./experience-config-fields";
export function AtlasExperienceEditor() {
  const client = useMemo(() => createAtlasExperienceAdminClient(), []);
  return <AtlasExperienceEditorForm client={client} />;
}

export function AtlasExperienceEditorForm({
  client,
}: {
  readonly client: ReturnType<typeof createAtlasExperienceAdminClient>;
}) {
  const {
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
  } = useAtlasExperienceEditor(client);

  return (
    <div className="atlas-config">
      <div className="athyper-landing__status">
        <span aria-hidden="true" />
        <div>
          <strong>
            {release
              ? `${release.status} revision ${release.revision}`
              : "New governed draft"}
          </strong>
          <p>
            Scope {definition.scope} · {definition.widgets.length} widgets ·{" "}
            {definition.searchSources.length} sources ·{" "}
            {definition.prompts.length} prompts · {definition.agents.length}{" "}
            agents
          </p>
        </div>
      </div>
      <fieldset
        disabled={busy}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <ConfigSection
          title="Dashboard widgets"
          description="Studio controls availability and baseline order; each person may still hide permitted widgets."
        >
          {definition.widgets.map((item, index) => (
            <ConfigRow
              key={item.code}
              enabled={item.enabled}
              onEnabled={(enabled) => update("widgets", index, { enabled })}
              code={item.code}
            >
              <input
                aria-label={`${item.code} title`}
                value={item.title}
                onChange={(event) =>
                  update("widgets", index, { title: event.currentTarget.value })
                }
              />
              <input
                aria-label={`${item.code} order`}
                type="number"
                min="0"
                max="100"
                value={item.order}
                onChange={(event) =>
                  update("widgets", index, {
                    order: Number(event.currentTarget.value),
                  })
                }
              />
            </ConfigRow>
          ))}
        </ConfigSection>
        <ConfigSection
          title="Search sources"
          description="Every source remains subject to its declared plane, permission, and record security."
        >
          {definition.searchSources.map((item, index) => (
            <ConfigRow
              key={item.code}
              enabled={item.enabled}
              onEnabled={(enabled) =>
                update("searchSources", index, { enabled })
              }
              code={item.code}
            >
              <input
                aria-label={`${item.code} label`}
                value={item.label}
                onChange={(event) =>
                  update("searchSources", index, {
                    label: event.currentTarget.value,
                  })
                }
              />
              <div className="atlas-config__inline">
                <input
                  aria-label={`${item.code} permission`}
                  placeholder="Permission code"
                  value={item.permissionCode ?? ""}
                  onChange={(event) =>
                    update("searchSources", index, {
                      permissionCode: event.currentTarget.value || undefined,
                    })
                  }
                />
                <input
                  aria-label={`${item.code} route`}
                  placeholder="Route prefix"
                  value={item.routePrefix ?? ""}
                  onChange={(event) =>
                    update("searchSources", index, {
                      routePrefix: event.currentTarget.value || undefined,
                    })
                  }
                />
              </div>
            </ConfigRow>
          ))}
        </ConfigSection>
        <ConfigSection
          title="Suggested prompts"
          description="Starter prompts select a published agent; they never override runtime policy."
        >
          {definition.prompts.map((item, index) => (
            <ConfigRow
              key={item.code}
              enabled={item.enabled}
              onEnabled={(enabled) => update("prompts", index, { enabled })}
              code={item.code}
            >
              <input
                aria-label={`${item.code} label`}
                value={item.label}
                onChange={(event) =>
                  update("prompts", index, { label: event.currentTarget.value })
                }
              />
              <div className="atlas-config__inline">
                <input
                  aria-label={`${item.code} prompt`}
                  value={item.prompt}
                  onChange={(event) =>
                    update("prompts", index, {
                      prompt: event.currentTarget.value,
                    })
                  }
                />
                <select
                  aria-label={`${item.code} agent`}
                  value={item.agentCode}
                  onChange={(event) =>
                    update("prompts", index, {
                      agentCode: event.currentTarget.value,
                    })
                  }
                >
                  {definition.agents.map((agent) => (
                    <option key={agent.code} value={agent.code}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>
            </ConfigRow>
          ))}
        </ConfigSection>
        <ConfigSection
          title="AI agents"
          description="The server pins each agent to a model, data class, prompt revision, and tool allowlist."
        >
          {definition.agents.map((item, index) => (
            <ConfigRow
              key={item.code}
              enabled={item.enabled}
              onEnabled={(enabled) => update("agents", index, { enabled })}
              code={item.code}
            >
              <input
                aria-label={`${item.code} name`}
                value={item.name}
                onChange={(event) =>
                  update("agents", index, { name: event.currentTarget.value })
                }
              />
              <div className="atlas-config__inline">
                <input
                  aria-label={`${item.code} model`}
                  value={item.publicModelId}
                  onChange={(event) =>
                    update("agents", index, {
                      publicModelId: event.currentTarget.value,
                    })
                  }
                />
                <select
                  aria-label={`${item.code} data class`}
                  value={item.dataClass}
                  onChange={(event) =>
                    update("agents", index, {
                      dataClass: event.currentTarget.value,
                    })
                  }
                >
                  <option value="public">Public</option>
                  <option value="internal">Internal</option>
                  <option value="confidential">Confidential</option>
                  <option value="restricted">Restricted</option>
                </select>
                <input
                  aria-label={`${item.code} prompt revision`}
                  value={item.promptRevision}
                  onChange={(event) =>
                    update("agents", index, {
                      promptRevision: event.currentTarget.value,
                    })
                  }
                />
                <input
                  aria-label={`${item.code} tools`}
                  value={item.toolCodes.join(", ")}
                  onChange={(event) =>
                    update("agents", index, {
                      toolCodes: event.currentTarget.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </ConfigRow>
          ))}
        </ConfigSection>
      </fieldset>
      {loadFailed ? (
        <button
          type="button"
          onClick={() => setLoadAttempt((value) => value + 1)}
        >
          Retry loading draft
        </button>
      ) : null}
      {message ? (
        <p className="atlas-config__message" role="status">
          {message}
        </p>
      ) : null}
      <div className="atlas-config__actions">
        <button type="button" disabled={busy} onClick={() => void save()}>
          {status === "saving" ? "Saving…" : "Save draft"}
        </button>
        <button type="button" disabled={busy} onClick={() => void publish()}>
          {status === "publishing" ? "Publishing…" : "Publish configuration"}
        </button>
      </div>
    </div>
  );
}
