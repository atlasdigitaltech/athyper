#!/usr/bin/env node

/**
 * Document Edit Runtime HAR performance gate.
 *
 * Usage:
 *   node scripts/document-edit-runtime-har-gate.mjs ./purchase-invoice-edit.har \
 *     --max-total-requests=90 \
 *     --max-duplicate-url=1 \
 *     --max-address-candidates=4 \
 *     --max-single-field-options=0 \
 *     --max-field-option-batches=8 \
 *     --max-load-ms=12000
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const [, , harPath, ...args] = process.argv;
if (!harPath) {
  console.error("Usage: node scripts/document-edit-runtime-har-gate.mjs <capture.har> [--max-total-requests=90]");
  process.exit(2);
}

const limits = {
  maxTotalRequests: readNumberArg(args, "max-total-requests", 90),
  maxDuplicateUrl: readNumberArg(args, "max-duplicate-url", 1),
  maxAddressCandidates: readNumberArg(args, "max-address-candidates", 4),
  maxSingleFieldOptions: readNumberArg(args, "max-single-field-options", 0),
  maxFieldOptionBatches: readNumberArg(args, "max-field-option-batches", 8),
  maxLoadMs: readNumberArg(args, "max-load-ms", 12_000),
};

const har = JSON.parse(readFileSync(harPath, "utf8"));
const entries = Array.isArray(har?.log?.entries) ? har.log.entries : [];
const pages = Array.isArray(har?.log?.pages) ? har.log.pages : [];
const requestUrls = entries
  .filter(isCountableRequestEntry)
  .map((entry) => String(entry?.request?.url ?? ""))
  .filter(Boolean);

const fetchUrls = requestUrls.filter((url) => (
  url.includes("/api/")
  || url.includes("/_next/")
  || url.includes("/app/")
));
const addressCandidateUrls = requestUrls.filter((url) => url.includes("/address") || url.includes("/addresses/candidates"));
const singleFieldOptionUrls = requestUrls.filter((url) => /\/fields\/[^/]+\/options\b/.test(url));
const fieldOptionBatchUrls = requestUrls.filter((url) => url.includes("/edit/field-options/batch"));
const duplicateUrls = duplicateCounts(fetchUrls)
  .filter((item) => item.count > limits.maxDuplicateUrl)
  .sort((left, right) => right.count - left.count);
const loadMs = readLoadMs(pages);

const failures = [];
if (fetchUrls.length > limits.maxTotalRequests) {
  failures.push(`total requests ${fetchUrls.length} > ${limits.maxTotalRequests}`);
}
if (addressCandidateUrls.length > limits.maxAddressCandidates) {
  failures.push(`address candidate/default requests ${addressCandidateUrls.length} > ${limits.maxAddressCandidates}`);
}
if (singleFieldOptionUrls.length > limits.maxSingleFieldOptions) {
  failures.push(`single-field option requests ${singleFieldOptionUrls.length} > ${limits.maxSingleFieldOptions}`);
}
if (fieldOptionBatchUrls.length > limits.maxFieldOptionBatches) {
  failures.push(`field option batch requests ${fieldOptionBatchUrls.length} > ${limits.maxFieldOptionBatches}`);
}
if (loadMs !== null && loadMs > limits.maxLoadMs) {
  failures.push(`page load ${loadMs}ms > ${limits.maxLoadMs}ms`);
}
if (duplicateUrls.length > 0) {
  failures.push(`duplicate URL budget exceeded for ${duplicateUrls.length} URL(s)`);
}

const summary = {
  file: basename(harPath),
  limits,
  metrics: {
    totalRequests: fetchUrls.length,
    addressCandidateRequests: addressCandidateUrls.length,
    singleFieldOptionRequests: singleFieldOptionUrls.length,
    fieldOptionBatchRequests: fieldOptionBatchUrls.length,
    loadMs,
    duplicateUrlViolations: duplicateUrls.slice(0, 10),
  },
  ok: failures.length === 0,
  failures,
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length > 0) process.exit(1);

function readNumberArg(values, name, fallback) {
  const prefix = `--${name}=`;
  const raw = values.find((value) => value.startsWith(prefix))?.slice(prefix.length);
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isCountableRequestEntry(entry) {
  const method = String(entry?.request?.method ?? "").toUpperCase();
  if (method === "OPTIONS") return false;
  if (entry?.response?.fromDiskCache === true) return false;
  if (entry?.response?.fromServiceWorker === true) return false;

  const url = String(entry?.request?.url ?? "");
  if (!url || url.startsWith("data:")) return false;
  if (url.includes("/_next/webpack-hmr")) return false;
  if (url.includes("/__nextjs")) return false;

  return true;
}

function duplicateCounts(urls) {
  const counts = new Map();
  for (const url of urls) {
    const normalized = normalizeUrl(url);
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...counts.entries()].map(([url, count]) => ({ url, count }));
}

function normalizeUrl(raw) {
  try {
    const url = new URL(raw);
    url.searchParams.sort();
    return `${url.pathname}?${url.searchParams.toString()}`;
  } catch {
    return raw;
  }
}

function readLoadMs(pages) {
  const page = pages[0];
  const timing = page?.pageTimings;
  const load = Number(timing?.onLoad);
  if (Number.isFinite(load) && load >= 0) return Math.round(load);
  const dcl = Number(timing?.onContentLoad);
  return Number.isFinite(dcl) && dcl >= 0 ? Math.round(dcl) : null;
}
