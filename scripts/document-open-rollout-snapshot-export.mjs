#!/usr/bin/env node

/**
 * Export a rollout snapshot in the exact CI shape:
 *
 * {
 *   minimumSamples: number,
 *   metrics: { [metricName: string]: number }
 * }
 *
 * Usage:
 *   node scripts/document-open-rollout-snapshot-export.mjs \
 *     --input ./raw-trace.json \
 *     --output ./document-open-rollout.snapshot.json \
 *     --minimum-samples=5000
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DOCUMENT_OPEN_PROGRESS_METRIC_NAMES } from "./../apps/neon/lib/server/document-open-rollout-gates.ts";

const [, , ...args] = process.argv;

const inputPath = readArg(args, "input");
const outputPath = readArg(args, "output");
const minimumSamples = parseNullableNumber(readArg(args, "minimum-samples"), 0);

if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/document-open-rollout-snapshot-export.mjs --input <raw-trace> --output <snapshot-json>");
  process.exit(2);
}

const raw = readFile(inputPath);
const exported = exportSnapshot(raw, minimumSamples);
if (!exported) {
  console.error("Invalid trace payload; no known metrics could be extracted.");
  process.exit(2);
}

ensureDir(outputPath);
writeFileSync(outputPath, JSON.stringify(exported, null, 2));
console.log(`wrote ${outputPath}`);

function exportSnapshot(payload, fallbackMinimumSamples) {
  const parsed = parsePayload(payload);
  if (!parsed) return null;

  const metrics = {};
  const observed = parsed.metrics;
  const sampleCount = normalizeNumber(parsed.minimumSamples) ?? fallbackMinimumSamples ?? 0;

  for (const metricName of Object.values(DOCUMENT_OPEN_PROGRESS_METRIC_NAMES)) {
    const value = normalizeNumber(observed[metricName]);
    if (Number.isFinite(value)) {
      metrics[metricName] = value;
    }
  }

  if (Object.keys(metrics).length === 0) return null;

  return {
    minimumSamples: Number.isFinite(sampleCount) ? sampleCount : 0,
    metrics,
  };
}

function parsePayload(raw) {
  try {
    const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!payload || typeof payload !== "object") return null;

    if (typeof payload.minimumSamples === "number" && Number.isFinite(payload.minimumSamples)) {
      return {
        minimumSamples: payload.minimumSamples,
        metrics: extractMetrics(payload.metrics ?? payload.data ?? payload.measurements ?? payload),
      };
    }

    return {
      minimumSamples: extractMinimumSamples(payload),
      metrics: extractMetrics(payload),
    };
  } catch {
    return null;
  }
}

function extractMetrics(candidate) {
  if (!candidate || typeof candidate !== "object") return {};

  if (candidate.metrics && typeof candidate.metrics === "object") {
    return normalizeMetricBag(candidate.metrics);
  }
  if (Array.isArray(candidate)) {
    return normalizeMetricBag(
      Object.fromEntries(
        candidate
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const value = item.value ?? item.metricValue ?? item.metric_value ?? item.count ?? item.durationMs ?? item.valueMs;
            const key = item.metric ?? item.name ?? item.metricName ?? item.metric_name;
            if (typeof key !== "string") return null;
            const normalized = normalizeNumber(value);
            if (!Number.isFinite(normalized)) return null;
            return [key, normalized];
          })
          .filter((entry) => Array.isArray(entry) && Number.isFinite(entry[1])),
      ),
    );
  }
  if (typeof candidate === "string" || !isPlainObject(candidate)) {
    return {};
  }

  return normalizeMetricBag(
    Object.fromEntries(
      Object.entries(candidate)
        .map(([key, value]) => [key, normalizeNumber(value)])
        .filter(([, value]) => Number.isFinite(value)),
    ),
  );
}

function extractMinimumSamples(payload) {
  const candidate = payload.minimumSamples ?? payload.sampleCount ?? payload.sample_count;
  const parsed = normalizeNumber(candidate);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMetricBag(metrics) {
  const output = {};
  for (const [metricName, value] of Object.entries(metrics)) {
    const normalized = normalizeNumber(value);
    if (Number.isFinite(normalized)) {
      output[metricName] = normalized;
    }
  }
  return output;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function readArg(items, name) {
  const prefix = `--${name}=`;
  for (const item of items) {
    if (item.startsWith(prefix)) return item.slice(prefix.length);
  }
  return null;
}

function parseNullableNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function readFile(path) {
  return readFileSync(path, "utf8");
}

function ensureDir(path) {
  const target = dirname(resolve(path));
  mkdirSync(target, { recursive: true });
}
