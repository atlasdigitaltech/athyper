"use client";

import {
  createAtlasExperienceAdminClient,
  type AtlasExperienceDefinition,
  type AtlasExperienceRelease,
} from "@athyper/platform-shell";
import React, { useEffect, useMemo, useState, type ReactNode } from "react";

const DEFAULT_DEFINITION = Object.freeze<AtlasExperienceDefinition>({
  schema: "atlas-experience-definition/1",
  scope: "home",
  widgets: [
    {
      code: "home.recommendations",
      kind: "recommendations",
      title: "Recommended for you",
      enabled: true,
      planes: ["neon", "mesh", "studio"],
      order: 10,
    },
    {
      code: "home.quick-actions",
      kind: "quick-actions",
      title: "Quick actions",
      enabled: true,
      planes: ["neon", "mesh", "studio"],
      order: 20,
    },
    {
      code: "home.workspaces",
      kind: "workspaces",
      title: "Workspaces",
      enabled: true,
      planes: ["neon", "mesh", "studio"],
      order: 30,
    },
    {
      code: "home.recent",
      kind: "recent",
      title: "Recently opened",
      enabled: true,
      planes: ["neon", "mesh", "studio"],
      order: 40,
    },
  ],
  searchSources: [
    {
      code: "mdg.navigation",
      kind: "navigation",
      label: "MDG navigation",
      enabled: true,
      planes: ["neon", "mesh", "studio"],
      routePrefix: "/mdg",
    },
    {
      code: "business-partner.records",
      kind: "record",
      label: "Business Partner records",
      enabled: true,
      planes: ["neon"],
      permissionCode: "master.business_partner.read",
      entityCode: "business_partner",
      routePrefix: "/mdg/business-partner",
    },
    {
      code: "business-partner.knowledge",
      kind: "knowledge",
      label: "Business Partner governed knowledge",
      enabled: true,
      planes: ["neon", "mesh", "studio"],
      permissionCode: "ai.agent.tools.read",
      entityCode: "business_partner",
    },
  ],
  prompts: [
    {
      code: "bp.find-supplier",
      label: "Find a supplier",
      prompt: "Find a supplier and show the governed source records",
      enabled: true,
      planes: ["neon", "mesh"],
      agentCode: "business-partner-guide",
    },
    {
      code: "bp.review-duplicates",
      label: "Review duplicate candidates",
      prompt:
        "Show business partner duplicate candidates that need my attention",
      enabled: true,
      planes: ["neon"],
      agentCode: "business-partner-steward",
    },
    {
      code: "bp.explain-publication",
      label: "Explain publication",
      prompt: "Explain how an approved business partner change is published",
      enabled: true,
      planes: ["studio", "mesh"],
      agentCode: "business-partner-guide",
    },
  ],
  agents: [
    {
      code: "business-partner-guide",
      name: "Business Partner Guide",
      description:
        "Permission-aware answers grounded in governed Business Partner sources.",
      enabled: true,
      planes: ["neon", "mesh", "studio"],
      publicModelId: "atlas-fast",
      dataClass: "internal",
      promptRevision: "prompt-r1",
      toolCodes: ["records_query"],
    },
    {
      code: "business-partner-steward",
      name: "Business Partner Steward",
      description:
        "Steward assistance with governed previews for approved Business Partner tools.",
      enabled: true,
      planes: ["neon"],
      publicModelId: "atlas-fast",
      dataClass: "confidential",
      promptRevision: "prompt-r1",
      toolCodes: ["records_query", "business_partner_update"],
    },
  ],
});

export function AtlasExperienceEditor() {
  const client = useMemo(() => createAtlasExperienceAdminClient(), []);
  return <AtlasExperienceEditorForm client={client} />;
}

export function AtlasExperienceEditorForm({
  client,
}: {
  readonly client: ReturnType<typeof createAtlasExperienceAdminClient>;
}) {
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

function ConfigSection({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="atlas-config__section">
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      <div>{children}</div>
    </section>
  );
}
function ConfigRow({
  enabled,
  onEnabled,
  code,
  children,
}: {
  readonly enabled: boolean;
  readonly onEnabled: (enabled: boolean) => void;
  readonly code: string;
  readonly children: ReactNode;
}) {
  return (
    <label className="atlas-config__row">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => onEnabled(event.currentTarget.checked)}
      />
      <strong>{code}</strong>
      {children}
    </label>
  );
}
