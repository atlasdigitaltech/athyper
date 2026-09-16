import { compileEntityIntakeSurfaces } from "@athyper/contract-platform-entity-runtime";
import { record, rows, type Json } from "./workbench-model";
export type StructureCollection = "surfaceSections" | "surfaceFieldBindings";
export type StructureCommand =
  | {
      kind: "reorder";
      collection: StructureCollection;
      id: string;
      direction: -1 | 1;
    }
  | {
      kind: "section";
      surfaceId: string;
      id: string;
      key: string;
      title: string;
      placementId: string;
    }
  | { kind: "placement"; sectionId: string; templateId: string; id: string }
  | { kind: "move"; id: string; sectionId: string }
  | {
      kind: "remove";
      collection: StructureCollection;
      id: string;
      destinationSectionId?: string;
    };
function one(graph: Json, collection: string, id: string): Json {
  const found = rows(graph[collection]).filter((r) => r.id === id);
  if (!id || found.length !== 1)
    throw Error("The object identity is missing or ambiguous.");
  return found[0]!;
}
function uniqueIds(list: Json[]) {
  if (
    list.some((r) => typeof r.id !== "string" || !r.id) ||
    new Set(list.map((r) => r.id)).size !== list.length
  )
    throw Error("Resolve missing or duplicate identities first.");
}
function ordered(list: Json[]) {
  uniqueIds(list);
  if (
    list.some((r) => !Number.isInteger(r.position) || Number(r.position) < 0) ||
    new Set(list.map((r) => r.position)).size !== list.length
  )
    throw Error("Resolve missing or duplicate positions first.");
  return [...list].sort((a, b) => Number(a.position) - Number(b.position));
}
export function qualifySurface(graph: Json, surfaceId: string): Json {
  for (const collection of [
    "surfaces",
    "surfaceSections",
    "surfaceFieldBindings",
  ])
    uniqueIds(rows(graph[collection]));
  const surface = one(graph, "surfaces", surfaceId);
  if (
    surface.surfaceKind !== "form" ||
    record(surface.layoutConfig).renderer !== "intake" ||
    surface.status === "deprecated"
  )
    throw Error(
      "Structural editing is qualified only for active intake forms.",
    );
  const sections = rows(graph.surfaceSections).filter(
    (r) => r.entitySurfaceId === surfaceId,
  );
  ordered(sections);
  if (
    sections.some(
      (r) =>
        r.parentSectionId ||
        (r.sectionKind && r.sectionKind !== "section") ||
        r.status === "deprecated",
    )
  )
    throw Error(
      "Nested, special or deprecated sections require a separate editor.",
    );
  const placements = rows(graph.surfaceFieldBindings).filter(
    (r) => r.entitySurfaceId === surfaceId,
  );
  uniqueIds(placements);
  for (const placement of placements)
    one(graph, "fields", String(placement.entityFieldId));
  if (
    placements.some(
      (r) =>
        !sections.some((s) => s.id === r.entitySurfaceSectionId) ||
        !["choice_cards", "entity_lookup"].includes(String(r.widgetKey)) ||
        r.status === "deprecated",
    )
  )
    throw Error(
      "This surface has controls or section references outside the qualified renderer.",
    );
  for (const section of sections)
    ordered(placements.filter((r) => r.entitySurfaceSectionId === section.id));
  compileEntityIntakeSurfaces(graph);
  return surface;
}
function positionalTests(graph: Json, collection: string) {
  return rows(graph.tests)
    .filter((t) => String(t.path ?? "").includes(collection))
    .map((t) => `Contract test ${String(t.key)} addresses ${collection}.`);
}
export function removalDependencies(
  graph: Json,
  collection: StructureCollection,
  id: string,
  rehome = false,
): string[] {
  const row = one(graph, collection, id);
  const dependencies = positionalTests(graph, collection);
  const field =
    collection === "surfaceFieldBindings"
      ? one(graph, "fields", String(row.entityFieldId))
      : undefined;
  const tokens = [
    id,
    collection === "surfaceSections" ? row.sectionKey : field?.fieldKey,
  ].filter((v): v is string => typeof v === "string" && Boolean(v));
  if (
    collection === "surfaceFieldBindings" &&
    record(row.displayConfig).required === true
  )
    dependencies.push("Required placements cannot be removed in this editor.");
  const matches = (value: string) =>
    tokens.some(
      (token) =>
        value === token ||
        new RegExp(
          `(^|[^a-zA-Z0-9_])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-zA-Z0-9_]|$)`,
        ).test(value),
    );
  const scan = (value: unknown, path: string) => {
    if (typeof value === "string") {
      if (matches(value)) dependencies.push(path);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => scan(v, `${path}[${i}]`));
      return;
    }
    if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value)) {
        if (matches(k)) dependencies.push(`${path}.${k}`);
        scan(v, `${path}.${k}`);
      }
  };
  for (const [name, value] of Object.entries(graph)) {
    if (Array.isArray(value))
      value.forEach((v, i) => {
        const r = record(v);
        if (name === collection && r.id === id) return;
        if (name === "fields" && field && r.id === field.id) return;
        if (
          rehome &&
          collection === "surfaceSections" &&
          name === "surfaceFieldBindings" &&
          r.entitySurfaceSectionId === id
        ) {
          const { entitySurfaceSectionId: _ownership, ...rest } = r;
          scan(rest, `${name}[${String(r.id ?? i)}]`);
        } else scan(v, `${name}[${String(r.id ?? i)}]`);
      });
    else scan(value, name);
  }
  return [...new Set(dependencies)];
}
function setPositions(
  graph: Json,
  collection: StructureCollection,
  siblings: Json[],
): Json {
  const positions = new Map(siblings.map((r, i) => [r.id, i]));
  return {
    ...graph,
    [collection]: rows(graph[collection]).map((r) =>
      positions.has(r.id) ? { ...r, position: positions.get(r.id) } : r,
    ),
  };
}
export function structuralEdit(graph: Json, command: StructureCommand): Json {
  let next: Json = graph;
  const collection =
    "collection" in command
      ? command.collection
      : command.kind === "section"
        ? "surfaceSections"
        : "surfaceFieldBindings";
  const selected =
    command.kind === "section"
      ? one(graph, "surfaces", command.surfaceId)
      : command.kind === "placement"
        ? one(graph, "surfaceSections", command.sectionId)
        : one(graph, collection, command.id);
  const surfaceId = String(
    command.kind === "section" ? selected.id : selected.entitySurfaceId,
  );
  qualifySurface(graph, surfaceId);
  const positional = [
    ...positionalTests(graph, collection),
    ...(command.kind === "section" ||
    (command.kind === "remove" && collection === "surfaceSections")
      ? positionalTests(graph, "surfaceFieldBindings")
      : []),
  ];
  if (positional.length) throw Error(positional.join(" "));
  const siblings = (r: Json) =>
    collection === "surfaceSections"
      ? r.entitySurfaceId === surfaceId
      : r.entitySurfaceSectionId === selected.entitySurfaceSectionId;
  if (command.kind === "reorder") {
    const list = ordered(rows(graph[collection]).filter(siblings));
    const index = list.findIndex((r) => r.id === command.id),
      target = index + command.direction;
    if (target < 0 || target >= list.length)
      throw Error("Already at the edge of this section.");
    [list[index], list[target]] = [list[target]!, list[index]!];
    next = setPositions(graph, collection, list);
  } else if (command.kind === "remove") {
    const deps = removalDependencies(
      graph,
      command.collection,
      command.id,
      command.collection === "surfaceSections",
    );
    if (deps.length) throw Error(`Removal blocked: ${deps.join("; ")}`);
    if (
      collection === "surfaceFieldBindings" &&
      rows(graph.surfaceFieldBindings).filter(
        (r) => r.entitySurfaceSectionId === selected.entitySurfaceSectionId,
      ).length < 2
    )
      throw Error("The section must retain at least one placement.");
    next = {
      ...graph,
      [collection]: rows(graph[collection]).filter((r) => r.id !== command.id),
    };
    if (collection === "surfaceSections") {
      const destination = one(
        graph,
        "surfaceSections",
        command.destinationSectionId ?? "",
      );
      if (
        destination.id === command.id ||
        destination.entitySurfaceId !== surfaceId
      )
        throw Error(
          "Choose another section on this surface to retain its placements.",
        );
      const kept = ordered(
        rows(graph.surfaceFieldBindings).filter(
          (r) => r.entitySurfaceSectionId === destination.id,
        ),
      );
      const moved = ordered(
        rows(graph.surfaceFieldBindings).filter(
          (r) => r.entitySurfaceSectionId === command.id,
        ),
      );
      const ids = new Set(moved.map((r) => r.id));
      next = {
        ...next,
        surfaceFieldBindings: rows(graph.surfaceFieldBindings).map((r) =>
          ids.has(r.id) ? { ...r, entitySurfaceSectionId: destination.id } : r,
        ),
      };
      next = setPositions(next, "surfaceFieldBindings", [...kept, ...moved]);
    }
    next = setPositions(
      next,
      collection,
      ordered(rows(next[collection]).filter(siblings)),
    );
  } else if (command.kind === "move") {
    const target = one(graph, "surfaceSections", command.sectionId);
    if (target.entitySurfaceId !== surfaceId)
      throw Error("Placements can only move within the same surface.");
    if (target.id === selected.entitySurfaceSectionId)
      throw Error("Choose a different section.");
    if (
      rows(graph.surfaceFieldBindings).filter(
        (r) => r.entitySurfaceSectionId === selected.entitySurfaceSectionId,
      ).length < 2
    )
      throw Error(
        "Use Remove section to move its last placement and remove the section together.",
      );
    const targetRows = ordered(
      rows(graph.surfaceFieldBindings).filter(
        (r) => r.entitySurfaceSectionId === target.id,
      ),
    );
    next = {
      ...graph,
      surfaceFieldBindings: rows(graph.surfaceFieldBindings).map((r) =>
        r.id === command.id
          ? {
              ...r,
              entitySurfaceSectionId: target.id,
              position: targetRows.length
                ? Number(targetRows[targetRows.length - 1]!.position) + 1
                : 0,
            }
          : r,
      ),
    };
    next = setPositions(
      next,
      "surfaceFieldBindings",
      ordered(rows(next.surfaceFieldBindings).filter(siblings)),
    );
  } else {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        command.id,
      ) ||
      Object.values(graph).some(
        (v) => Array.isArray(v) && v.some((r) => record(r).id === command.id),
      )
    )
      throw Error("A new unique UUID is required.");
    if (command.kind === "section") {
      if (
        !/^[a-z][a-z0-9_]{0,62}$/.test(command.key) ||
        !command.title.trim() ||
        command.title.length > 200
      )
        throw Error(
          "Enter a section key and a title (maximum 200 characters).",
        );
      const list = ordered(
        rows(graph.surfaceSections).filter(
          (r) => r.entitySurfaceId === surfaceId,
        ),
      );
      if (list.some((r) => r.sectionKey === command.key))
        throw Error("Section key already exists on this surface.");
      const placement = one(graph, "surfaceFieldBindings", command.placementId);
      if (placement.entitySurfaceId !== surfaceId)
        throw Error("Choose a placement on this surface.");
      const previous = ordered(
        rows(graph.surfaceFieldBindings).filter(
          (r) => r.entitySurfaceSectionId === placement.entitySurfaceSectionId,
        ),
      );
      if (previous.length < 2)
        throw Error("The original section must retain at least one field.");
      next = {
        ...graph,
        surfaceFieldBindings: rows(graph.surfaceFieldBindings).map((r) =>
          r.id === placement.id
            ? { ...r, entitySurfaceSectionId: command.id, position: 0 }
            : r,
        ),
        surfaceSections: [
          ...rows(graph.surfaceSections),
          {
            id: command.id,
            entitySurfaceId: surfaceId,
            sectionKey: command.key,
            title: command.title.trim(),
            sectionKind: "section",
            columnCount: 1,
            position: list.length
              ? Number(list[list.length - 1]!.position) + 1
              : 0,
            status: "active",
          },
        ],
      };
      next = setPositions(
        next,
        "surfaceFieldBindings",
        previous.filter((r) => r.id !== placement.id),
      );
    } else {
      const template = one(graph, "surfaceFieldBindings", command.templateId);
      qualifySurface(graph, String(template.entitySurfaceId));
      if (
        rows(graph.surfaceFieldBindings).some(
          (r) =>
            r.entitySurfaceId === surfaceId &&
            r.entityFieldId === template.entityFieldId,
        )
      )
        throw Error("This field is already placed on the surface.");
      const list = ordered(
        rows(graph.surfaceFieldBindings).filter(
          (r) => r.entitySurfaceSectionId === command.sectionId,
        ),
      );
      next = {
        ...graph,
        surfaceFieldBindings: [
          ...rows(graph.surfaceFieldBindings),
          {
            ...template,
            id: command.id,
            entitySurfaceId: surfaceId,
            entitySurfaceSectionId: command.sectionId,
            position: list.length
              ? Number(list[list.length - 1]!.position) + 1
              : 0,
          },
        ],
      };
    }
  }
  compileEntityIntakeSurfaces(next);
  return next;
}
