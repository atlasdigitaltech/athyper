#!/usr/bin/env node

/**
 * Document-open rollout CI gate check.
 *
 * Usage:
 *   node tooling/scripts/document-open-rollout-ci-gate.mjs --snapshot=./trace-snapshot.json
 *   node tooling/scripts/document-open-rollout-ci-gate.mjs --snapshot-json='{"minimumSamples":123,"metrics":{...}}'
 *   DOCUMENT_OPEN_ROLLOUT_PROGRESS_SNAPSHOT='{"minimumSamples":123,"metrics":{...}}' node ...
 */

import { existsSync, readFileSync } from "node:fs";
import { DOCUMENT_OPEN_CI_GATE_DEFINITIONS } from "./../apps/neon/lib/server/document-open-rollout-ci-definitions.ts";

const [, , ...args] = process.argv;

const snapshotFromArg = readArg(args, "snapshot");
const snapshotFromInlineArg = readArg(args, "snapshot-json");
const snapshotPath = snapshotFromArg ?? process.env.DOCUMENT_OPEN_CI_GATE_SNAPSHOT_PATH;
const snapshotJson = snapshotFromInlineArg ?? process.env.DOCUMENT_OPEN_ROLLOUT_PROGRESS_SNAPSHOT;

const raw = resolveSnapshotRaw(snapshotPath, snapshotJson);
if (raw === null) {
  console.error("No snapshot found. Pass --snapshot <path> or --snapshot-json <json>.");
  process.exit(2);
}

const snapshot = normalizeSnapshot(raw);
if (!snapshot) {
  console.error("Invalid snapshot payload.");
  process.exit(2);
}

const failures = [];
const observedMetrics = [];

for (const gate of DOCUMENT_OPEN_CI_GATE_DEFINITIONS) {
  const value = snapshot.metrics[gate.metricName];
  if (!Number.isFinite(value)) {
    failures.push(`missing or non-numeric metric: ${gate.name} (${gate.metricName})`);
    continue;
  }

  observedMetrics.push({ name: gate.name, metricName: gate.metricName, value });

  if (gate.higherIsBetter ? value < gate.target : value > gate.target) {
    const direction = gate.higherIsBetter ? ">" : "<=";
    failures.push(`${gate.metricName}=${value} is not meeting gate ${gate.name} target ${direction} ${gate.target}`);
  }
}

const summary = {
  passed: failures.length === 0,
  minimumSamples: snapshot.minimumSamples ?? 0,
  observedMetrics,
  definitions: DOCUMENT_OPEN_CI_GATE_DEFINITIONS.length,
  failures,
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length > 0) {
  process.exit(1);
}

function readArg(items, name) {
  const prefix = `--${name}=`;
  for (const item of items) {
    if (item.startsWith(prefix)) return item.slice(prefix.length);
  }
  return null;
}

function resolveSnapshotRaw(pathValue, jsonValue) {
  if (jsonValue) return jsonValue;
  if (!pathValue) return null;
  if (!existsSync(pathValue)) return null;
  return readFileSync(pathValue, "utf8");
}

function normalizeSnapshot(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const metricInput = extractMetrics(parsed);
    if (!metricInput) return null;
    return {
      minimumSamples: normalizeNumber(parsed.minimumSamples) ?? undefined,
      metrics: Object.fromEntries(
        Object.entries(metricInput)
          .map(([metricName, value]) => [metricName, normalizeNumber(value)])
          .filter(([, value]) => Number.isFinite(value)),
      ),
    };
  } catch {
    return null;
  }
}

function extractMetrics(payload) {
  if (payload === null || typeof payload !== "object") return null;
  if (payload.metrics && typeof payload.metrics === "object") return payload.metrics;
  if (typeof payload.metricsJson === "object") return payload.metricsJson;
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => key !== "minimumSamples" && Number.isFinite(normalizeNumber(value))),
  );
}

function normalizeNumber(raw) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
