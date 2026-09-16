"use client";
import { useEffect, useState } from "react";
import { Button, Input, Label, Select } from "@athyper/platform-ui";
import type { CompositionNode } from "./composition-model";
import {
  qualifySurface,
  removalDependencies,
  type StructureCommand,
  type StructureCollection,
} from "./composition-structure";
import { rows, type Json } from "./workbench-model";
export function CompositionStructureControls({
  graph,
  node,
  onApply,
}: {
  graph: Json;
  node: CompositionNode;
  onApply: (command: StructureCommand) => void;
}) {
  const [key, setKey] = useState(""),
    [title, setTitle] = useState(""),
    [template, setTemplate] = useState(""),
    [target, setTarget] = useState(""),
    [removing, setRemoving] = useState(false),
    [initialPlacement, setInitialPlacement] = useState("");
  useEffect(() => setRemoving(false), [graph, node.key]);
  const id = String(node.value.id ?? "");
  const surfaceId = String(
    node.collection === "surfaces" ? id : (node.value.entitySurfaceId ?? ""),
  );
  let reason = "";
  try {
    qualifySurface(graph, surfaceId);
  } catch (e) {
    reason =
      e instanceof Error ? e.message : "Structural editing is unavailable.";
  }
  if (reason)
    return (
      <section aria-label="Structural editing">
        <h3>Structural editing</h3>
        <p>{reason}</p>
      </section>
    );
  const member = ["surfaceSections", "surfaceFieldBindings"].includes(
    node.collection,
  );
  const deps = member
    ? removalDependencies(
        graph,
        node.collection as StructureCollection,
        id,
        node.collection === "surfaceSections",
      )
    : [];
  const siblingRows = rows(graph[node.collection])
    .filter((r) =>
      node.collection === "surfaceSections"
        ? r.entitySurfaceId === surfaceId
        : r.entitySurfaceSectionId === node.value.entitySurfaceSectionId,
    )
    .sort((a, b) => Number(a.position) - Number(b.position));
  const siblingIndex = siblingRows.findIndex((r) => r.id === id);
  const sections = rows(graph.surfaceSections).filter(
    (s) => s.entitySurfaceId === surfaceId,
  );
  const placed = new Set(
    rows(graph.surfaceFieldBindings)
      .filter((b) => b.entitySurfaceId === surfaceId)
      .map((b) => b.entityFieldId),
  );
  const candidates = rows(graph.surfaceFieldBindings).filter(
    (b) =>
      !placed.has(b.entityFieldId) &&
      ["choice_cards", "entity_lookup"].includes(String(b.widgetKey)) &&
      b.status !== "deprecated",
  );
  return (
    <section
      className="studio-composition-structure"
      aria-label="Structural editing"
    >
      <h3>Structural editing</h3>
      <p>
        Changes stay in the working copy until Save draft. Undo restores the
        previous structure. Shared field definitions are retained.
      </p>
      {member ? (
        <div className="bp-editor-actions">
          <Button
            variant="secondary"
            disabled={siblingIndex <= 0}
            onClick={() =>
              onApply({
                kind: "reorder",
                collection: node.collection as StructureCollection,
                id,
                direction: -1,
              })
            }
          >
            Move earlier
          </Button>
          <Button
            variant="secondary"
            disabled={siblingIndex >= siblingRows.length - 1}
            onClick={() =>
              onApply({
                kind: "reorder",
                collection: node.collection as StructureCollection,
                id,
                direction: 1,
              })
            }
          >
            Move later
          </Button>
        </div>
      ) : null}
      {node.collection === "surfaces" ? (
        <fieldset>
          <legend>Add section</legend>
          <Label htmlFor="structure-section-key">Section key</Label>
          <Input
            id="structure-section-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="additional_details"
          />
          <Label htmlFor="structure-section-title">Section title</Label>
          <Input
            id="structure-section-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Label htmlFor="structure-initial-placement">
            Move a placement into the new section
          </Label>
          <Select
            id="structure-initial-placement"
            value={initialPlacement}
            onChange={(e) => setInitialPlacement(e.target.value)}
          >
            <option value="">Choose a placement</option>
            {rows(graph.surfaceFieldBindings)
              .filter(
                (p) =>
                  p.entitySurfaceId === surfaceId &&
                  rows(graph.surfaceFieldBindings).filter(
                    (b) =>
                      b.entitySurfaceSectionId === p.entitySurfaceSectionId,
                  ).length > 1,
              )
              .map((p) => (
                <option key={String(p.id)} value={String(p.id)}>
                  {String(p.labelOverride ?? p.entityFieldId)}
                </option>
              ))}
          </Select>
          <Button
            variant="secondary"
            disabled={!key || !title.trim() || !initialPlacement}
            onClick={() =>
              onApply({
                kind: "section",
                surfaceId,
                id: crypto.randomUUID(),
                key,
                title,
                placementId: initialPlacement,
              })
            }
          >
            Add section
          </Button>
          <small>
            Every section must retain at least one placement. Merge sections
            first if none can be split.
          </small>
        </fieldset>
      ) : null}
      {node.collection === "surfaceSections" ? (
        <fieldset>
          <legend>Place an existing configured field</legend>
          <Label htmlFor="structure-template">
            Existing placement template
          </Label>
          <Select
            id="structure-template"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            <option value="">Choose a configured field</option>
            {candidates.map((b) => (
              <option key={String(b.id)} value={String(b.id)}>
                {String(b.labelOverride ?? b.entityFieldId)} ·{" "}
                {String(
                  rows(graph.surfaces).find((s) => s.id === b.entitySurfaceId)
                    ?.surfaceKey ?? "Unknown surface",
                )}
              </option>
            ))}
          </Select>
          <Button
            variant="secondary"
            disabled={!template}
            onClick={() =>
              onApply({
                kind: "placement",
                sectionId: id,
                templateId: template,
                id: crypto.randomUUID(),
              })
            }
          >
            Add field placement
          </Button>
          <small>
            The new placement reuses the existing field and its control
            configuration. Compilation must accept its dependencies on this
            surface.
          </small>
        </fieldset>
      ) : null}
      {node.collection === "surfaceFieldBindings" ? (
        <fieldset>
          <legend>Move within this surface</legend>
          <Label htmlFor="structure-target">Destination section</Label>
          <Select
            id="structure-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">Choose a different section</option>
            {sections
              .filter((s) => s.id !== node.value.entitySurfaceSectionId)
              .map((s) => (
                <option key={String(s.id)} value={String(s.id)}>
                  {String(s.title ?? s.sectionKey)}
                </option>
              ))}
          </Select>
          <Button
            variant="secondary"
            disabled={!target}
            onClick={() => onApply({ kind: "move", id, sectionId: target })}
          >
            Move to section
          </Button>
        </fieldset>
      ) : null}
      {member ? (
        <fieldset>
          <legend>Remove {node.kind.toLowerCase()}</legend>
          <Button variant="secondary" onClick={() => setRemoving(true)}>
            Review removal
          </Button>
          {removing ? (
            <>
              <p>
                {deps.length
                  ? "Removal is blocked by these dependencies:"
                  : node.collection === "surfaceSections"
                    ? `Remove ${node.label} and retain its placements in the selected destination?`
                    : `Remove the ${node.label} placement? Its shared field definition will be retained.`}
              </p>
              {node.collection === "surfaceSections" ? (
                <>
                  <Label htmlFor="structure-removal-target">
                    Retain placements in
                  </Label>
                  <Select
                    id="structure-removal-target"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">Choose another section</option>
                    {sections
                      .filter((s) => s.id !== id)
                      .map((s) => (
                        <option key={String(s.id)} value={String(s.id)}>
                          {String(s.title ?? s.sectionKey)}
                        </option>
                      ))}
                  </Select>
                </>
              ) : null}
              {deps.length ? (
                <ul>
                  {deps.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              ) : (
                <Button
                  variant="secondary"
                  disabled={node.collection === "surfaceSections" && !target}
                  onClick={() =>
                    onApply({
                      kind: "remove",
                      collection: node.collection as StructureCollection,
                      id,
                      destinationSectionId:
                        node.collection === "surfaceSections"
                          ? target
                          : undefined,
                    })
                  }
                >
                  Confirm removal
                </Button>
              )}
              <Button variant="ghost" onClick={() => setRemoving(false)}>
                Cancel removal
              </Button>
            </>
          ) : null}
        </fieldset>
      ) : null}
    </section>
  );
}
