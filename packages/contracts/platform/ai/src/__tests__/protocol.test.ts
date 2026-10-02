import { expect, it } from "vitest";
import {
  parseAtlasIntent,
  parseAtlasResponseFeedback,
  parseAtlasAnswerEnvelope,
  parseAtlasInsightResult,
} from "../index.js";

it("accepts bounded routing evidence and rejects inconsistent intent", () => {
  const intent = {
    schemaVersion: 1,
    kind: "read",
    strategy: "exact_terms",
    reason: "matched",
    capabilityIds: ["summary"],
  };
  expect(parseAtlasIntent(intent)).toEqual(intent);
  expect(Object.isFrozen(parseAtlasIntent(intent).capabilityIds)).toBe(true);
  expect(() => parseAtlasIntent({ ...intent, capabilityIds: [] })).toThrow();
  expect(() =>
    parseAtlasIntent({ ...intent, permissions: ["admin"] }),
  ).toThrow();
});

it("normalizes feedback identifiers and rejects invalid feedback", () => {
  const id = "ABCDEF00-0000-4000-8000-000000000001";
  const feedback = {
    schemaVersion: 1,
    feedbackId: id,
    runId: id,
    messageId: id,
    category: "intent",
    verdict: "correct",
  };
  expect(parseAtlasResponseFeedback(feedback).feedbackId).toBe(
    id.toLowerCase(),
  );
  expect(() =>
    parseAtlasResponseFeedback({ ...feedback, runId: "invalid" }),
  ).toThrow();
});

it("accepts an answer only with references supplied by the caller's authority", () => {
  const answer = {
    schemaVersion: 1,
    kind: "brief",
    summary: "Verified summary",
    findingIds: [],
    evidenceIds: ["e1"],
  };
  expect(
    parseAtlasAnswerEnvelope(answer, { evidenceIds: ["e1"], actionIds: [] }),
  ).toEqual(answer);
  expect(() =>
    parseAtlasAnswerEnvelope(answer, { evidenceIds: [], actionIds: [] }),
  ).toThrow();
});

it("accepts statements only when each cites the answer's own evidence", () => {
  const answer = {
    schemaVersion: 1,
    kind: "brief",
    summary: "The calling code is 93, matching ITU.",
    findingIds: [],
    evidenceIds: ["record:0", "external:0"],
    statements: [
      { text: "The saved calling code is 93.", evidenceIds: ["record:0"] },
      { text: "That matches ITU.", evidenceIds: ["external:0"] },
    ],
  };
  const authority = { evidenceIds: ["record:0", "external:0"], actionIds: [] };
  expect(parseAtlasAnswerEnvelope(answer, authority).statements).toEqual(answer.statements);
  // A statement may not cite evidence outside the answer's references.
  expect(() =>
    parseAtlasAnswerEnvelope(
      { ...answer, evidenceIds: ["record:0"], statements: [{ text: "That matches ITU.", evidenceIds: ["external:0"] }] },
      authority,
    ),
  ).toThrow();
  expect(() => parseAtlasAnswerEnvelope({ ...answer, statements: [] }, authority)).toThrow();
  expect(() =>
    parseAtlasAnswerEnvelope({ ...answer, statements: [{ text: "x", evidenceIds: ["record:0"], url: "https://x" }] }, authority),
  ).toThrow();
});

it("validates insight transport and rejects injected authority fields", () => {
  const insight = {
    schemaVersion: 1,
    scope: { entityCode: "business_partner", fingerprint: "scope1" },
    coverage: { target: "record", state: "unavailable" },
    evaluatedAt: "2026-09-11T00:00:00Z",
    freshness: "current",
    findings: [],
    evidence: [],
    actions: [],
  };
  expect(parseAtlasInsightResult(insight)).toEqual(insight);
  expect(() =>
    parseAtlasInsightResult({ ...insight, permissions: ["admin"] }),
  ).toThrow();
});
