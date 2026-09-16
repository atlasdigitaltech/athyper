import { record, rows, type Json } from "./workbench-model";
export interface CompositionNode {
  key: string;
  collection: string;
  label: string;
  kind: string;
  value: Json;
  parent?: string;
  children: CompositionNode[];
  issues: string[];
}
const definitions = {
  surfaces: ["Forms and surfaces", "Surface", "surfaceKey"],
  surfaceSections: ["Sections", "Section", "sectionKey"],
  surfaceFieldBindings: ["Field placements", "Field placement", "bindingKey"],
  surfaceOperations: ["Surface actions", "Action", "placementKey"],
  fields: ["Field catalogue", "Field", "fieldKey"],
  operations: ["Operation catalogue", "Operation", "operationKey"],
  flows: ["Intake flows", "Flow", "flowKey"],
  flowSteps: ["Flow steps", "Step", "stepKey"],
  operationPermissions: [
    "Operation permissions",
    "Permission binding",
    "permissionCode",
  ],
  operationRules: ["Operation rules", "Rule", "ruleKey"],
  keys: ["Keys", "Key", "keyKey"],
  keyFields: ["Key members", "Key member", "id"],
  relations: ["Relationships", "Relationship", "relationKey"],
  relationTargets: ["Relationship targets", "Target", "relationTargetKey"],
  relationFields: ["Field mappings", "Field mapping", "id"],
} as const;
export const friendly = (v: unknown) =>
  typeof v === "string"
    ? v.replace(/[_ .]+/g, " ").replace(/^./, (c) => c.toUpperCase())
    : "";
export function composeGraph(graph: Json) {
  const nodes: CompositionNode[] = [];
  const byId = new Map<string, CompositionNode[]>();
  for (const [collection, [, kind, name]] of Object.entries(definitions)) {
    rows(graph[collection]).forEach((value, index) => {
      const id =
        typeof value.id === "string" && value.id ? value.id : undefined;
      const lookup = `${collection}:${id ?? `missing-${index}`}`;
      const node: CompositionNode = {
        key: `${lookup}:${index}`,
        collection,
        kind,
        label: String(
          value.title ||
            value.labelOverride ||
            friendly(value[name]) ||
            `${kind} ${index + 1}`,
        ),
        value,
        children: [],
        issues: id ? [] : ["Stored identity is missing."],
      };
      nodes.push(node);
      if (id) byId.set(lookup, [...(byId.get(lookup) ?? []), node]);
    });
  }
  for (const group of byId.values()) {
    if (group.length === 1)
      group[0]!.key = `${group[0]!.collection}:${String(group[0]!.value.id)}`;
    else group.forEach((n) => n.issues.push("Duplicate stored identity."));
  }
  function ref(
    node: CompositionNode,
    collection: string,
    property: string,
    required = true,
  ) {
    const id = node.value[property];
    if (!id && !required) return undefined;
    const matches = byId.get(`${collection}:${String(id)}`);
    if (!matches || matches.length !== 1) {
      node.issues.push(`Missing or ambiguous ${friendly(property)} reference.`);
      return undefined;
    }
    return matches[0];
  }
  for (const node of nodes) {
    let parent: CompositionNode | undefined;
    const v = node.value;
    if (node.collection === "surfaceSections") {
      const surface = ref(node, "surfaces", "entitySurfaceId");
      parent = v.parentSectionId
        ? ref(node, "surfaceSections", "parentSectionId")
        : surface;
      if (
        parent?.collection === "surfaceSections" &&
        parent.value.entitySurfaceId !== v.entitySurfaceId
      ) {
        node.issues.push("Parent section belongs to a different surface.");
        parent = undefined;
      }
    } else if (
      ["surfaceFieldBindings", "surfaceOperations"].includes(node.collection)
    ) {
      const surface = ref(node, "surfaces", "entitySurfaceId");
      parent = v.entitySurfaceSectionId
        ? ref(node, "surfaceSections", "entitySurfaceSectionId")
        : surface;
      if (
        parent?.collection === "surfaceSections" &&
        parent.value.entitySurfaceId !== v.entitySurfaceId
      ) {
        node.issues.push("Placement section belongs to a different surface.");
        parent = undefined;
      }
      const target = ref(
        node,
        node.collection === "surfaceFieldBindings" ? "fields" : "operations",
        node.collection === "surfaceFieldBindings"
          ? "entityFieldId"
          : "entityOperationId",
      );
      if (!v.labelOverride && target) node.label = target.label;
    } else if (node.collection === "flowSteps") {
      parent = ref(node, "flows", "entityFlowId");
      ref(node, "surfaces", "entitySurfaceId");
    } else if (node.collection === "operationPermissions") {
      ref(node, "operations", "entityOperationId");
    } else if (node.collection === "operationRules") {
      parent = ref(node, "operations", "entityOperationId");
    } else if (node.collection === "keyFields") {
      parent = ref(node, "keys", "entityKeyId");
      const field = ref(node, "fields", "entityFieldId");
      if (field) node.label = field.label;
    } else if (node.collection === "relationTargets")
      parent = ref(node, "relations", "entityRelationId");
    else if (node.collection === "relationFields") {
      parent = ref(node, "relationTargets", "entityRelationTargetId");
      ref(node, "fields", "sourceFieldId");
    }
    if (parent) node.parent = parent.key;
  }
  const map = new Map(nodes.map((n) => [n.key, n]));
  for (const node of nodes) {
    const seen = new Set<string>();
    let current: CompositionNode | undefined = node;
    while (current) {
      if (seen.has(current.key)) {
        node.issues.push("Cyclic parent references.");
        node.parent = undefined;
        break;
      }
      seen.add(current.key);
      current = current.parent ? map.get(current.parent) : undefined;
    }
  }
  for (const node of nodes)
    if (node.parent) map.get(node.parent)?.children.push(node);
  const sort = (a: CompositionNode, b: CompositionNode) =>
    Number(a.value.position ?? 0) - Number(b.value.position ?? 0) ||
    a.label.localeCompare(b.label);
  for (const node of nodes) node.children.sort(sort);
  const groups = Object.entries(definitions)
    .map(([collection, [label]]) => ({
      label,
      collection,
      nodes: nodes
        .filter((n) => n.collection === collection && !n.parent)
        .sort(sort),
    }))
    .filter(
      (g) =>
        g.nodes.length ||
        [
          "surfaces",
          "fields",
          "operations",
          "operationPermissions",
          "relations",
          "flows",
        ].includes(g.collection),
    );
  return { nodes, groups, map, entity: record(graph.entity) };
}
