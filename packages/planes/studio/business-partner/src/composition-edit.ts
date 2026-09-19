import {
  editableProperties,
  editProperty,
  type EditableCollection,
} from "./workbench-edit-model";
import { record, rows, type Json } from "./workbench-model";
export function compositionEdit(
  graph: Json,
  collection: string,
  id: string,
  property: string,
  value: string | number,
): Json {
  if (!Object.prototype.hasOwnProperty.call(editableProperties, collection))
    throw Error("This object is read-only.");
  const list = rows(graph[collection]);
  const matches = list.map((r, i) => ({ r, i })).filter(({ r }) => r.id === id);
  if (matches.length !== 1)
    throw Error("The stored object identity is missing or ambiguous.");
  const row = matches[0]!.r;
  if (["columnCount", "columnSpan"].includes(property)) {
    if (typeof value !== "number") throw Error("Enter a whole number.");
    if (property === "columnSpan") {
      const surface = rows(graph.surfaces).find(
        (s) => s.id === row.entitySurfaceId,
      );
      if (
        record(surface?.layoutConfig).renderer === "intake" &&
        ["choice_cards", "entity_lookup"].includes(String(row.widgetKey)) &&
        value !== 12
      )
        throw Error("This intake control requires a full-width span of 12.");
    }
  } else if (typeof value !== "string")
    throw Error("Enter text for this property.");
  return editProperty(
    graph,
    collection as EditableCollection,
    matches[0]!.i,
    property,
    value,
  );
}
