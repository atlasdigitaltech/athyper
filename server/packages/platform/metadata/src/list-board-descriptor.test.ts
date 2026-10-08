import { describe, expect, it } from "vitest";
import type { EntityFieldDescriptor } from "@athyper/server-contract-metadata";
import { parsePublishedCardContent, parsePublishedListBoard, validatePublishedListBoard } from "./list-board-descriptor.js";

const published = () => ({
  laneFields: [{
    field: "stage",
    choices: [
      { value: "open", label: "Open", tone: "warning", position: 1 },
      { value: "done", label: "Done", tone: "success", position: 2 },
    ],
    lanes: [
      { key: "open", label: "Open", values: ["open"], tone: "warning", collapsed: false, terminal: false },
      { key: "done", label: "Done", values: ["done"], tone: "success", collapsed: false, terminal: true },
    ],
  }],
});
const field = (key: string, type: EntityFieldDescriptor["type"]): EntityFieldDescriptor => ({ key, storagePath: key, type, required: true, writableOn: [] });
const fields = new Map([["code", field("code", "string")], ["stage", field("stage", "enum")]]);

describe("published list board", () => {
  it("parses a complete board projection", () => {
    expect(parsePublishedListBoard(published()).laneFields[0]?.lanes.map((lane) => lane.key)).toEqual(["open", "done"]);
  });

  it("rejects a published choice that is not in any lane", () => {
    const value = published();
    value.laneFields[0]!.lanes = [value.laneFields[0]!.lanes[0]!];
    expect(() => parsePublishedListBoard(value)).toThrow(/must assign published choice done/);
  });

  it("rejects a choice placed in two lanes and a value that is not a published choice", () => {
    const duplicate = published();
    duplicate.laneFields[0]!.lanes[1]!.values = ["done", "open"];
    expect(() => parsePublishedListBoard(duplicate)).toThrow(/exactly one lane/);
    const foreign = published();
    foreign.laneFields[0]!.lanes[1]!.values = ["archived"];
    expect(() => parsePublishedListBoard(foreign)).toThrow(/published choice/);
  });

  it("rejects unknown properties, bad tones and too many lanes", () => {
    expect(() => parsePublishedListBoard({ ...published(), moves: [] })).toThrow(/not a published board property/);
    const tone = published();
    (tone.laneFields[0]!.lanes[0] as { tone: string }).tone = "blue";
    expect(() => parsePublishedListBoard(tone)).toThrow(/published tone/);
    const many = published();
    many.laneFields[0]!.choices = Array.from({ length: 13 }, (_, index) => ({ value: `v${index}`, label: `V${index}`, tone: "neutral", position: index + 1 }));
    many.laneFields[0]!.lanes = many.laneFields[0]!.choices.map((choice) => ({ key: choice.value, label: choice.label, values: [choice.value], tone: "neutral", collapsed: false, terminal: false }));
    expect(() => parsePublishedListBoard(many)).toThrow(/1 to 12 lanes/);
  });

  it("checks lane fields and Board mode against the entity", () => {
    const board = parsePublishedListBoard(published());
    expect(() => validatePublishedListBoard({ board, supportedModes: ["table", "board"], identityField: "code" }, fields)).not.toThrow();
    expect(() => validatePublishedListBoard({ board, supportedModes: ["table"] }, fields)).toThrow(/exactly when Board/);
    expect(() => validatePublishedListBoard({ supportedModes: ["board"] }, fields)).toThrow(/exactly when Board/);
    expect(() => validatePublishedListBoard({ board, supportedModes: ["board"], identityField: "stage" }, fields)).toThrow(/list identity/);
    expect(() => validatePublishedListBoard({ board, supportedModes: ["board"] }, new Map([["stage", field("stage", "string")]]))).toThrow(/must be an enum/);
  });

  it("parses card content and rejects unknown fields on validation", () => {
    const cardContent = parsePublishedCardContent({ fields: [{ field: "stage", rendererKey: "number.progress" }] });
    expect(cardContent.fields).toEqual([{ field: "stage", rendererKey: "number.progress" }]);
    expect(() => validatePublishedListBoard({ cardContent: { fields: [{ field: "missing" }] } }, fields)).toThrow(/unknown field/);
  });
});
