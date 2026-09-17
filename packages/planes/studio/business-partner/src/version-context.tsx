"use client";
import { useState } from "react";
import { ContextSelectionDrawer, Input, Badge } from "@athyper/platform-ui";
import type { Choice, Inspection } from "./workbench-model";
export function versionDate(value: string | undefined) {
  if (!value || !Number.isFinite(Date.parse(value)))
    return value || "Date not supplied";
  return (
    new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}
export function VersionContext({
  showStatus = true,
  selection,
  inspection,
  catalog,
  loading,
  errors,
  onRefresh,
  onOpen,
}: {
  showStatus?: boolean;
  selection: string;
  inspection?: Inspection;
  catalog: Choice[];
  loading: boolean;
  errors: string[];
  onRefresh: () => void;
  onOpen: (key: string, signal: AbortSignal) => Promise<boolean>;
}) {
  const [bundle, setBundle] = useState("");
  const label = inspection
    ? `${inspection.source === "release" ? "Release" : inspection.status} · ${inspection.source === "release" ? "version" : "revision"} ${inspection.version}`
    : selection
      ? "Selected configuration"
      : "Choose version";
  const items = catalog.map((c) => ({
    key: `${c.source}:${c.id}`,
    label:
      c.label.split(" · ")[0] +
      (c.source === "draft" ? ` · ${c.label.split(" · ")[1] ?? ""}` : ""),
    group: c.source === "release" ? "Published releases" : "Change sets",
    description:
      c.source === "release"
        ? `${versionDate(c.label.split(" · ")[1])} · Read-only · ${c.id.slice(0, 8)}…`
        : `${c.label.startsWith("draft ·") ? "Draft configuration" : "Read-only change set"} · ${c.id.slice(0, 8)}…`,
    keywords: c.label,
    details: (
      <>
        <p>Source: {c.source}</p>
        <p>
          ID: <code>{c.id}</code>
        </p>
        <p>{c.label}</p>
      </>
    ),
  }));
  const currentItem = items.find((c) => c.key === selection);
  if (currentItem && inspection) {
    currentItem.label = label;
    currentItem.description = `${inspection.status} · ${inspection.source === "release" || inspection.status !== "draft" ? "Read-only" : "Draft configuration"}`;
  }
  if (inspection && !items.some((c) => c.key === selection))
    items.unshift({
      key: selection,
      label,
      group:
        inspection.source === "bundle"
          ? "Bundle revisions"
          : inspection.source === "release"
            ? "Published releases"
            : "Change sets",
      description: "Currently inspected configuration",
      keywords: inspection.id,
      details: (
        <p>
          ID: <code>{inspection.id}</code>
        </p>
      ),
    });
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      bundle,
    ) &&
    !items.some((c) => c.key === `bundle:${bundle}`)
  )
    items.push({
      key: `bundle:${bundle}`,
      label: "Bundle revision",
      group: "Bundle revisions",
      description: bundle,
      keywords: bundle,
      details: <p>This ID will be verified when opened.</p>,
    });
  return (
    <div className="studio-version-context">
      <ContextSelectionDrawer
        title="Version context"
        description="Business Partner · Choose a stored configuration"
        currentKey={selection}
        currentLabel={label}
        choices={items}
        loading={loading}
        errors={errors}
        onRefresh={onRefresh}
        onConfirm={onOpen}
      >
        <details>
          <summary>Current version details</summary>
          {inspection ? (
            <dl>
              <dt>State</dt>
              <dd>{inspection.status}</dd>
              <dt>Source ID</dt>
              <dd>{inspection.id}</dd>
              <dt>Contract hash</dt>
              <dd>{inspection.hash ?? "Not supplied"}</dd>
              <dt>Declared targets</dt>
              <dd>{inspection.targets.join(", ") || "Not supplied"}</dd>
            </dl>
          ) : (
            <p>No stored configuration loaded.</p>
          )}
          <p>Source publication does not confirm target activation.</p>
        </details>
        <details>
          <summary>Advanced · inspect bundle by ID</summary>
          <label htmlFor="version-bundle-id">Bundle revision UUID</label>
          <Input
            id="version-bundle-id"
            value={bundle}
            onChange={(e) => setBundle(e.target.value.trim())}
          />
          <p>
            A valid UUID adds a bundle choice above. Select it, then Open
            version.
          </p>
        </details>
      </ContextSelectionDrawer>
      {inspection && showStatus ? (
        <Badge>
          {inspection.source === "draft" && inspection.status === "draft"
            ? "Draft configuration"
            : "Read-only configuration"}
        </Badge>
      ) : null}
    </div>
  );
}
