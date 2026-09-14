import { expect, it } from "vitest";
import * as shared from "@athyper/contract-platform-ai";
import { parseAtlasIntent } from "../intent.js";
import { parseAtlasResponseFeedback } from "../feedback.js";
import { parseAtlasAnswerEnvelope } from "../answer.js";
import { parseAtlasInsightResult } from "../insights.js";
import { parseAtlasBusinessContext } from "../business-context.js";

it("preserves the existing server parser entry points and their validation", () => {
  expect(parseAtlasIntent).toBe(shared.parseAtlasIntent);
  expect(parseAtlasResponseFeedback).toBe(shared.parseAtlasResponseFeedback);
  expect(parseAtlasAnswerEnvelope).toBe(shared.parseAtlasAnswerEnvelope);
  expect(parseAtlasInsightResult).toBe(shared.parseAtlasInsightResult);
  expect(parseAtlasBusinessContext).toBe(shared.parseAtlasBusinessContext);
  for (const parser of [
    parseAtlasIntent,
    parseAtlasResponseFeedback,
    parseAtlasInsightResult,
    parseAtlasBusinessContext,
  ]) {
    expect(() => parser({ schemaVersion: 999, tenantId: "forged" })).toThrow();
  }
  expect(() =>
    parseAtlasAnswerEnvelope({}, { evidenceIds: [], actionIds: [] }),
  ).toThrow();
});
