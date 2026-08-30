#!/usr/bin/env tsx

import { access, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const BUSINESS_PARTNER_360_P1_EVIDENCE_CODES = Object.freeze([
  "protected_value_deployment",
  "attachment_expiry",
  "mesh_live_transport",
  "studio_durable_failover",
  "provider_authority",
  "authenticated_browser",
  "http_performance",
  "manual_accessibility",
  "notification_oncall",
] as const);
export const BUSINESS_PARTNER_360_P1_PROVIDER_CODES = Object.freeze([
  "procurement", "finance", "sales", "projects", "contracts",
] as const);
export const BUSINESS_PARTNER_360_P1_APPROVAL_GATES = Object.freeze([
  "functional", "data", "security_privacy", "contract", "performance", "resilience", "ux", "operations",
] as const);

type EvidenceCode = typeof BUSINESS_PARTNER_360_P1_EVIDENCE_CODES[number];
type ProviderCode = typeof BUSINESS_PARTNER_360_P1_PROVIDER_CODES[number];
type ApprovalGate = typeof BUSINESS_PARTNER_360_P1_APPROVAL_GATES[number];
type Evidence = Readonly<{ code: EvidenceCode; status: "pending" | "passed"; evidenceRef: string }>;
type Provider = Readonly<{ code: ProviderCode; status: "not_configured" | "connected"; reasonCode?: string; ownerApprovalRef?: string }>;
type Approval = Readonly<{ gate: ApprovalGate; status: "pending" | "approved"; approverId: string | null; approvedAt: string | null; evidenceRef: string | null }>;
type Metrics = Readonly<{
  summaryP95Ms: number | null;
  sectionP95Ms: number | null;
  firstUsefulIdentityP75Ms: number | null;
  cachedSwitchMaxMs: number | null;
  summaryPayloadP95Bytes: number | null;
  sectionPayloadP95Bytes: number | null;
}>;
export type BusinessPartner360P1QualificationPacket = Readonly<{
  schemaVersion: 1;
  kind: "athyper.business-partner-360.p1-qualification";
  release: "phase-1";
  environment: Readonly<{ name: string; classification: "release_non_production" | "production"; environmentRef: string | null }>;
  evidence: readonly Evidence[];
  providers: readonly Provider[];
  browser: Readonly<{ executedCases: number; skippedCases: number; fixtureFamilies: readonly string[] }>;
  performance: Metrics;
  accessibility: Readonly<{ supportedBrowsers: readonly string[]; screenReader: boolean; keyboardFocus: boolean; reflow200Percent: boolean; responsive: boolean; localization: boolean; rtl: boolean }>;
  operations: Readonly<{ sinkRef: string | null; deliveredAt: string | null; acknowledgedAt: string | null; participantIds: readonly string[] }>;
}>;

export type BusinessPartner360P1QualificationDecision = Readonly<{
  qualificationComplete: boolean;
  approvalsComplete: boolean;
  releaseReady: boolean;
  pendingEvidence: readonly EvidenceCode[];
  pendingApprovals: readonly ApprovalGate[];
  invalid: readonly string[];
}>;

const FIXTURE_FAMILIES = ["organization", "supplier", "customer", "dual_role", "person_workforce", "external_worker", "mesh_linked"] as const;

export function evaluateBusinessPartner360P1Qualification(packet: BusinessPartner360P1QualificationPacket, approvals: readonly Approval[]): BusinessPartner360P1QualificationDecision {
  const invalid: string[] = [];
  if (packet.schemaVersion !== 1 || packet.kind !== "athyper.business-partner-360.p1-qualification" || packet.release !== "phase-1") invalid.push("PACKET_HEADER_INVALID");
  if (!packet.environment.name.trim() || !isDurableReference(packet.environment.environmentRef)) invalid.push("RELEASE_ENVIRONMENT_INVALID");

  const evidenceByCode = groupBy(packet.evidence, value => value.code), pendingEvidence: EvidenceCode[] = [];
  for (const code of BUSINESS_PARTNER_360_P1_EVIDENCE_CODES) {
    const records = evidenceByCode.get(code) ?? [];
    if (records.length !== 1) { invalid.push(`${code.toUpperCase()}_EVIDENCE_${records.length ? "DUPLICATE" : "MISSING"}`); continue; }
    if (!isEvidenceReference(records[0]!.evidenceRef)) invalid.push(`${code.toUpperCase()}_EVIDENCE_REF_INVALID`);
    if (records[0]!.status !== "passed") pendingEvidence.push(code);
  }
  for (const code of evidenceByCode.keys()) if (!BUSINESS_PARTNER_360_P1_EVIDENCE_CODES.includes(code as EvidenceCode)) invalid.push("UNKNOWN_EVIDENCE_CODE");

  validateProviders(packet.providers, invalid);
  if (status(packet, "provider_authority") === "passed" && invalid.some(value => value.startsWith("PROVIDER_"))) invalid.push("PROVIDER_AUTHORITY_EVIDENCE_CONTRADICTED");
  if (status(packet, "authenticated_browser") === "passed") {
    if (packet.browser.executedCases < 10 || packet.browser.skippedCases !== 0) invalid.push("AUTHENTICATED_BROWSER_EXECUTION_INVALID");
    if (!sameSet(packet.browser.fixtureFamilies, FIXTURE_FAMILIES)) invalid.push("AUTHENTICATED_BROWSER_FIXTURES_INCOMPLETE");
  }
  if (status(packet, "http_performance") === "passed") validatePerformance(packet.performance, invalid);
  if (status(packet, "manual_accessibility") === "passed") {
    if (!packet.accessibility.supportedBrowsers.length || Object.entries(packet.accessibility).some(([key, value]) => key !== "supportedBrowsers" && value !== true)) invalid.push("MANUAL_ACCESSIBILITY_CERTIFICATION_INVALID");
  }
  if (status(packet, "notification_oncall") === "passed") {
    if (!isDurableReference(packet.operations.sinkRef) || !isTimestamp(packet.operations.deliveredAt) || !isTimestamp(packet.operations.acknowledgedAt) || new Set(packet.operations.participantIds.filter(isActor)).size < 2) invalid.push("NOTIFICATION_ONCALL_EVIDENCE_INVALID");
  }

  const approvalByGate = groupBy(approvals, value => value.gate), pendingApprovals: ApprovalGate[] = [];
  for (const gate of BUSINESS_PARTNER_360_P1_APPROVAL_GATES) {
    const records = approvalByGate.get(gate) ?? [];
    if (records.length !== 1) { invalid.push(`${gate.toUpperCase()}_APPROVAL_${records.length ? "DUPLICATE" : "MISSING"}`); continue; }
    const record = records[0]!;
    if (record.status !== "approved") { pendingApprovals.push(gate); continue; }
    if (!isActor(record.approverId) || !isTimestamp(record.approvedAt) || !isDurableReference(record.evidenceRef)) invalid.push(`${gate.toUpperCase()}_APPROVAL_INVALID`);
  }
  for (const gate of approvalByGate.keys()) if (!BUSINESS_PARTNER_360_P1_APPROVAL_GATES.includes(gate as ApprovalGate)) invalid.push("UNKNOWN_APPROVAL_GATE");

  const qualificationComplete = pendingEvidence.length === 0 && invalid.length === 0;
  const approvalsComplete = pendingApprovals.length === 0 && !invalid.some(value => value.includes("APPROVAL"));
  return Object.freeze({ qualificationComplete, approvalsComplete, releaseReady: qualificationComplete && approvalsComplete, pendingEvidence: Object.freeze(pendingEvidence), pendingApprovals: Object.freeze(pendingApprovals), invalid: Object.freeze([...new Set(invalid)]) });
}

export async function evaluateBusinessPartner360P1QualificationFiles(packetPath: string, approvalPath: string, repositoryRoot: string) {
  const packet = JSON.parse(await readFile(packetPath, "utf8")) as BusinessPartner360P1QualificationPacket;
  const ledger = JSON.parse(await readFile(approvalPath, "utf8")) as { approvals: Approval[] };
  const decision = evaluateBusinessPartner360P1Qualification(packet, ledger.approvals);
  const missingEvidenceRefs: string[] = [];
  for (const reference of new Set(packet.evidence.map(value => value.evidenceRef))) {
    const target = isAbsolute(reference) ? reference : resolve(repositoryRoot, reference);
    try { await access(target); } catch { missingEvidenceRefs.push(reference); }
  }
  return Object.freeze({ ...decision, releaseReady: decision.releaseReady && missingEvidenceRefs.length === 0, missingEvidenceRefs: Object.freeze(missingEvidenceRefs.sort()) });
}

function validateProviders(providers: readonly Provider[], invalid: string[]) {
  const byCode = groupBy(providers, value => value.code);
  for (const code of BUSINESS_PARTNER_360_P1_PROVIDER_CODES) {
    const records = byCode.get(code) ?? [];
    if (records.length !== 1) { invalid.push(`PROVIDER_${code.toUpperCase()}_${records.length ? "DUPLICATE" : "MISSING"}`); continue; }
    const provider = records[0]!;
    if (provider.status === "connected" && !isDurableReference(provider.ownerApprovalRef)) invalid.push(`PROVIDER_${code.toUpperCase()}_OWNER_APPROVAL_REQUIRED`);
    if (provider.status === "not_configured" && provider.reasonCode !== "PROVIDER_NOT_CONFIGURED") invalid.push(`PROVIDER_${code.toUpperCase()}_FAILURE_CONTRACT_INVALID`);
  }
}
function validatePerformance(value: Metrics, invalid: string[]) {
  const checks: ReadonlyArray<readonly [keyof Metrics, number]> = [["summaryP95Ms",500],["sectionP95Ms",750],["firstUsefulIdentityP75Ms",1500],["cachedSwitchMaxMs",100],["summaryPayloadP95Bytes",75*1024],["sectionPayloadP95Bytes",100*1024]];
  for (const [key, limit] of checks) if (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key]! < 0 || value[key]! > limit) invalid.push(`${camelToReason(key)}_INVALID`);
}
function status(packet: BusinessPartner360P1QualificationPacket, code: EvidenceCode) { return packet.evidence.find(value => value.code === code)?.status; }
function groupBy<T>(values: readonly T[], key: (value: T) => string) { const result = new Map<string,T[]>(); for (const value of values) result.set(key(value), [...(result.get(key(value)) ?? []), value]); return result; }
function sameSet(left: readonly string[], right: readonly string[]) { return left.length === right.length && new Set(left).size === left.length && left.every(value => right.includes(value as never)); }
function isActor(value: string | null): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._@-]{2,127}$/.test(value); }
function isTimestamp(value: string | null): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)); }
function isEvidenceReference(value: string) { return /^docs\/architecture\/[A-Za-z0-9][A-Za-z0-9._/-]{5,255}$/.test(value); }
function isDurableReference(value: string | null | undefined): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/#-]{5,255}$/.test(value); }
function camelToReason(value: string) { return value.replace(/([a-z0-9])([A-Z])/g,"$1_$2").toUpperCase(); }
function option(args: readonly string[], name: string) { return args.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1); }

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const repositoryRoot = resolve(import.meta.dirname, "../../..");
  const packetPath = resolve(repositoryRoot, option(process.argv.slice(2), "--packet") ?? "docs/architecture/evidence/business-partner-360-p1-qualification.json");
  const approvalPath = resolve(repositoryRoot, option(process.argv.slice(2), "--approvals") ?? "docs/architecture/evidence/business-partner-360-release-approvals.json");
  const result = await evaluateBusinessPartner360P1QualificationFiles(packetPath, approvalPath, repositoryRoot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (process.argv.includes("--strict") && !result.releaseReady) process.exitCode = 2;
}
