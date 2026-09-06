#!/usr/bin/env tsx
import { parseInstant } from "@athyper/platform-temporal";

import { access, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { requiredOption } from "../lib/cli.js";

export const BUSINESS_PARTNER_360_P0_APPROVAL_GATES = Object.freeze([
  "business_data",
  "architecture_contract",
  "release_owner",
  "integration_baseline",
  "materialization_legacy_policy",
  "security",
  "privacy_data_protection",
] as const);
export const BUSINESS_PARTNER_360_P0_EVIDENCE_CODES = Object.freeze([
  "contract_lock",
  "integration_baseline",
  "production_repository_materialization",
  "legacy_read_policy",
  "database_security_privacy",
  "authenticated_browser_leakage",
] as const);

type ApprovalGate = typeof BUSINESS_PARTNER_360_P0_APPROVAL_GATES[number];
type EvidenceCode = typeof BUSINESS_PARTNER_360_P0_EVIDENCE_CODES[number];
type Approval = Readonly<{
  gate: ApprovalGate;
  ownerRole: string;
  status: "pending" | "approved";
  approverId: string | null;
  approvedAt: string | null;
  evidenceRef: string;
  approvalRef: string | null;
}>;
type Evidence = Readonly<{
  code: EvidenceCode;
  status: "passed" | "pending";
  evidenceRef: string;
}>;
export type BusinessPartner360P0ApprovalPacket = Readonly<{
  schemaVersion: 1;
  kind: "athyper.business-partner-360.p0-approval-packet";
  release: "phase-1";
  evidence: readonly Evidence[];
  approvals: readonly Approval[];
}>;
export type BusinessPartner360P0ApprovalDecision = Readonly<{
  p0Closed: boolean;
  technicalEvidenceComplete: boolean;
  approvalsComplete: boolean;
  pendingEvidence: readonly EvidenceCode[];
  pendingApprovals: readonly ApprovalGate[];
  invalid: readonly string[];
}>;

export function evaluateBusinessPartner360P0Approvals(packet: BusinessPartner360P0ApprovalPacket): BusinessPartner360P0ApprovalDecision {
  const invalid: string[] = [];
  if (packet.schemaVersion !== 1 || packet.kind !== "athyper.business-partner-360.p0-approval-packet" || packet.release !== "phase-1")
    invalid.push("PACKET_HEADER_INVALID");

  const evidenceByCode = groupBy(packet.evidence, (item) => item.code);
  const pendingEvidence: EvidenceCode[] = [];
  for (const code of BUSINESS_PARTNER_360_P0_EVIDENCE_CODES) {
    const records = evidenceByCode.get(code) ?? [];
    if (records.length !== 1) {
      invalid.push(`${code.toUpperCase()}_EVIDENCE_${records.length ? "DUPLICATE" : "MISSING"}`);
      continue;
    }
    const record = records[0]!;
    if (!isEvidenceReference(record.evidenceRef)) invalid.push(`${code.toUpperCase()}_EVIDENCE_REF_INVALID`);
    if (record.status !== "passed") pendingEvidence.push(code);
  }
  for (const code of evidenceByCode.keys())
    if (!BUSINESS_PARTNER_360_P0_EVIDENCE_CODES.includes(code as EvidenceCode)) invalid.push("UNKNOWN_EVIDENCE_CODE");

  const approvalByGate = groupBy(packet.approvals, (item) => item.gate);
  const pendingApprovals: ApprovalGate[] = [];
  for (const gate of BUSINESS_PARTNER_360_P0_APPROVAL_GATES) {
    const records = approvalByGate.get(gate) ?? [];
    if (records.length !== 1) {
      invalid.push(`${gate.toUpperCase()}_APPROVAL_${records.length ? "DUPLICATE" : "MISSING"}`);
      continue;
    }
    const record = records[0]!;
    if (!record.ownerRole.trim() || !isEvidenceReference(record.evidenceRef)) invalid.push(`${gate.toUpperCase()}_APPROVAL_METADATA_INVALID`);
    if (record.status === "pending") {
      pendingApprovals.push(gate);
      if (record.approverId !== null || record.approvedAt !== null || record.approvalRef !== null)
        invalid.push(`${gate.toUpperCase()}_PENDING_APPROVAL_HAS_DECISION`);
      continue;
    }
    if (!isActor(record.approverId) || !isTimestamp(record.approvedAt) || !isApprovalReference(record.approvalRef))
      invalid.push(`${gate.toUpperCase()}_APPROVAL_INVALID`);
  }
  for (const gate of approvalByGate.keys())
    if (!BUSINESS_PARTNER_360_P0_APPROVAL_GATES.includes(gate as ApprovalGate)) invalid.push("UNKNOWN_APPROVAL_GATE");

  const security = approvalByGate.get("security")?.[0];
  const privacy = approvalByGate.get("privacy_data_protection")?.[0];
  if (security?.status === "approved" && privacy?.status === "approved" && security.approverId === privacy.approverId)
    invalid.push("SECURITY_PRIVACY_APPROVERS_NOT_INDEPENDENT");
  if (pendingEvidence.includes("authenticated_browser_leakage") && (security?.status === "approved" || privacy?.status === "approved"))
    invalid.push("SECURITY_PRIVACY_APPROVED_BEFORE_BROWSER_EVIDENCE");

  const technicalEvidenceComplete = pendingEvidence.length === 0 && !invalid.some((reason) => reason.includes("EVIDENCE"));
  const approvalsComplete = pendingApprovals.length === 0 && !invalid.some((reason) => reason.includes("APPROVAL") || reason.includes("APPROVERS"));
  return Object.freeze({
    p0Closed: technicalEvidenceComplete && approvalsComplete && invalid.length === 0,
    technicalEvidenceComplete,
    approvalsComplete,
    pendingEvidence: Object.freeze(pendingEvidence),
    pendingApprovals: Object.freeze(pendingApprovals),
    invalid: Object.freeze(invalid),
  });
}

export async function evaluateBusinessPartner360P0ApprovalFile(packetPath: string, repositoryRoot: string) {
  const packet = JSON.parse(await readFile(packetPath, "utf8")) as BusinessPartner360P0ApprovalPacket;
  const decision = evaluateBusinessPartner360P0Approvals(packet);
  const missingEvidenceRefs: string[] = [];
  for (const reference of new Set([...packet.evidence.map((item) => item.evidenceRef), ...packet.approvals.map((item) => item.evidenceRef)])) {
    const target = isAbsolute(reference) ? reference : resolve(repositoryRoot, reference);
    try { await access(target); } catch { missingEvidenceRefs.push(reference); }
  }
  return Object.freeze({
    ...decision,
    p0Closed: decision.p0Closed && missingEvidenceRefs.length === 0,
    missingEvidenceRefs: Object.freeze(missingEvidenceRefs.sort()),
  });
}

function groupBy<T>(values: readonly T[], key: (value: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const value of values) grouped.set(key(value), [...(grouped.get(key(value)) ?? []), value]);
  return grouped;
}
function isActor(value: string | null): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._@-]{2,127}$/.test(value); }
function isTimestamp(value: string | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(parseInstant(value));
}
function isEvidenceReference(value: string) { return /^docs\/architecture\/[A-Za-z0-9][A-Za-z0-9._/-]{5,255}$/.test(value); }
function isApprovalReference(value: string | null): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/#-]{5,255}$/.test(value); }
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const repositoryRoot = resolve(import.meta.dirname, "../../../..");
  const packetPath = resolve(repositoryRoot, requiredOption(args, "--packet"));
  const result = await evaluateBusinessPartner360P0ApprovalFile(packetPath, repositoryRoot);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (process.argv.includes("--strict") && !result.p0Closed) process.exitCode = 2;
}
