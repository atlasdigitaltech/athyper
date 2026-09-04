#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const argumentsMap = parseArguments(process.argv.slice(2));
const apiUrl = required(argumentsMap.get("api-url") ?? process.env.VERIFICATION_API_URL, "--api-url or VERIFICATION_API_URL");
const token = required(process.env.VERIFICATION_ACCESS_TOKEN, "VERIFICATION_ACCESS_TOKEN");
const plane = choice(argumentsMap.get("plane") ?? process.env.VERIFICATION_PLANE ?? "studio", ["studio", "neon", "mesh"], "plane");
const mode = choice(argumentsMap.get("mode") ?? "quick", ["quick", "functional"], "mode");
const target = new URL(mode === "quick" ? "/api/platform/verification" : "/api/platform/verification/runs", normalizedBase(apiUrl));
const headers = new Headers({ accept: "application/json", authorization: `Bearer ${token}`, "x-plane": plane, "x-realm": process.env.VERIFICATION_REALM ?? "athyper", "x-request-id": `qualification-${randomUUID()}` });
if (process.env.VERIFICATION_TENANT_ID) headers.set("x-tenant-id", process.env.VERIFICATION_TENANT_ID);
if (process.env.VERIFICATION_PRINCIPAL_ID) headers.set("x-principal-id", process.env.VERIFICATION_PRINCIPAL_ID);
let body;
if (mode === "functional") { headers.set("content-type", "application/json"); headers.set("idempotency-key", `qualification:${plane}:${randomUUID()}`); body = JSON.stringify({ mode: "functional" }); }
const response = await fetch(target, { method: mode === "quick" ? "GET" : "POST", headers, body, redirect: "error", signal: AbortSignal.timeout(120_000) });
const text = await response.text();
let document;
try { document = JSON.parse(text); } catch { throw new Error(`Verification returned non-JSON HTTP ${response.status}`); }
if (!response.ok) throw new Error(`Verification failed with HTTP ${response.status}: ${String(document.code ?? document.title ?? "unknown")}`);
if (document.kind !== "PlatformVerificationRun" || document.mode !== mode || document.planeKey !== plane) throw new Error("Verification response authority does not match the requested qualification");
const serialized = `${JSON.stringify(document, null, 2)}\n`;
const output = argumentsMap.get("output");
if (output) { const path = resolve(output); await mkdir(dirname(path), { recursive: true, mode: 0o700 }); await writeFile(path, serialized, { mode: 0o600 }); process.stderr.write(`verification receipt: ${path}\n`); }
else process.stdout.write(serialized);
if (document.status !== "passed") process.exitCode = 1;

function parseArguments(values) { const result = new Map(); for (let index = 0; index < values.length; index += 1) { const key = values[index]; if (!key?.startsWith("--")) throw new Error(`Unexpected argument: ${key}`); const value = values[++index]; if (!value || value.startsWith("--")) throw new Error(`${key} requires a value`); result.set(key.slice(2), value); } return result; }
function required(value, name) { if (!value?.trim()) throw new Error(`${name} is required`); return value.trim(); }
function choice(value, values, name) { if (!values.includes(value)) throw new Error(`${name} must be one of ${values.join(", ")}`); return value; }
function normalizedBase(value) { const url = new URL(value); if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Verification API URL must be a credential-free HTTP(S) base URL"); url.pathname = "/"; return url; }
