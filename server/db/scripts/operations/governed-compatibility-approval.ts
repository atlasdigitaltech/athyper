import { createHash, createPublicKey, verify } from "node:crypto";

export const approvalRoles = [
  "surface-owner",
  "database-owner",
  "release-owner",
] as const;
export type ApprovalRole = (typeof approvalRoles)[number];
export type EvidenceRef = {
  code: string;
  kind: string;
  source: string;
  sha256: string;
  subjectEvidenceHash?: string;
};
export type Attestation = {
  schemaVersion: number;
  kind: string;
  surfaceCode: string;
  role: ApprovalRole;
  decision: string;
  approver: { subject: string; authorityRef: string };
  issuedAt: string;
  evidenceBundleHash: string;
  evidenceHashes: string[];
  assertions: Record<string, string>;
  signature: {
    algorithm: string;
    keyId: string;
    publicKeyPem: string;
    valueBase64: string;
  };
  attestationHash?: string;
};
export type ApprovalPacket = {
  schemaVersion: number;
  kind: string;
  surfaceCode: string;
  owner: string;
  createdAt: string;
  evidenceBundleHash: string;
  evidence: EvidenceRef[];
  attestations: Attestation[];
  status: string;
  packetHash?: string;
};

export const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([key]) => key !== "packetHash" && key !== "attestationHash")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
};
export const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const requiredAssertions: Record<ApprovalRole, string[]> = {
  "surface-owner": ["consumerCutover", "semanticCompatibility"],
  "database-owner": [
    "migration",
    "backup",
    "reconstruction",
    "locks",
    "privileges",
    "rollback",
  ],
  "release-owner": [
    "deploymentWindow",
    "monitoring",
    "abortCriteria",
    "forwardFixPlan",
  ],
};
const hashPattern = /^[a-f0-9]{64}$/u;

export function unsignedAttestation(value: Attestation) {
  const { signature: _, attestationHash: __, ...unsigned } = value;
  return unsigned;
}
export function validateApprovalPacket(
  packet: ApprovalPacket,
  expectedSurface?: string,
): string[] {
  const errors: string[] = [];
  if (
    packet.schemaVersion !== 1 ||
    packet.kind !== "athyper.g6-compatibility-retirement-approval-packet"
  )
    errors.push("invalid approval packet contract");
  if (expectedSurface && packet.surfaceCode !== expectedSurface)
    errors.push("approval packet surface mismatch");
  if (packet.status !== "approved")
    errors.push("approval packet is not approved");
  if (
    !hashPattern.test(packet.evidenceBundleHash) ||
    packet.evidenceBundleHash !== sha256(stable(packet.evidence))
  )
    errors.push("evidence bundle hash mismatch");
  if (!packet.packetHash || packet.packetHash !== sha256(stable(packet)))
    errors.push("approval packet hash mismatch");
  const evidenceHashes = packet.evidence.map((value) => value.sha256).sort();
  if (
    packet.evidence.length < 7 ||
    new Set(evidenceHashes).size !== evidenceHashes.length ||
    packet.evidence.some((value) => !hashPattern.test(value.sha256))
  )
    errors.push("approval packet evidence is incomplete or invalid");
  const subjects = new Set<string>(),
    keys = new Set<string>();
  for (const role of approvalRoles) {
    const matches = packet.attestations.filter((value) => value.role === role);
    if (matches.length !== 1) {
      errors.push(`approval packet requires exactly one ${role} attestation`);
      continue;
    }
    const value = matches[0];
    if (
      value.schemaVersion !== 1 ||
      value.kind !== "athyper.g6-compatibility-retirement-attestation" ||
      value.surfaceCode !== packet.surfaceCode ||
      value.decision !== "approve"
    )
      errors.push(`${role} attestation contract is invalid`);
    if (
      value.evidenceBundleHash !== packet.evidenceBundleHash ||
      JSON.stringify([...value.evidenceHashes].sort()) !==
        JSON.stringify(evidenceHashes)
    )
      errors.push(`${role} attestation is not bound to every evidence hash`);
    if (
      !value.approver?.subject ||
      value.approver.subject.length < 3 ||
      /REPLACE_/u.test(value.approver.subject) ||
      !value.approver.authorityRef ||
      value.approver.authorityRef.length < 8 ||
      /REPLACE_/u.test(value.approver.authorityRef) ||
      !/^[a-z][a-z0-9+.-]*:/iu.test(value.approver.authorityRef)
    )
      errors.push(
        `${role} lacks accountable subject or immutable authority reference`,
      );
    if (
      Number.isNaN(Date.parse(value.issuedAt)) ||
      Date.parse(value.issuedAt) > Date.now() + 300000
    )
      errors.push(`${role} issuedAt is invalid`);
    for (const key of requiredAssertions[role])
      if (
        typeof value.assertions?.[key] !== "string" ||
        value.assertions[key].trim() !== value.assertions[key] ||
        value.assertions[key].length < 20 ||
        /^(?:yes|true|approved|ok|n\/a)$/iu.test(value.assertions[key])
      )
        errors.push(`${role} lacks substantive ${key} attestation`);
    if (
      Object.keys(value.assertions ?? {})
        .sort()
        .join(",") !== [...requiredAssertions[role]].sort().join(",")
    )
      errors.push(`${role} has an unexpected assertion contract`);
    try {
      const publicKey = createPublicKey(value.signature.publicKeyPem),
        keyId = sha256(
          publicKey.export({ type: "spki", format: "der" }) as Buffer,
        ),
        payload = stable(unsignedAttestation(value)),
        attestationHash = sha256(payload);
      if (
        value.signature.algorithm !== "ed25519" ||
        value.signature.keyId !== keyId ||
        value.attestationHash !== attestationHash ||
        !verify(
          null,
          Buffer.from(payload),
          publicKey,
          Buffer.from(value.signature.valueBase64, "base64"),
        )
      )
        errors.push(`${role} detached signature is invalid`);
    } catch {
      errors.push(`${role} detached signature is invalid`);
    }
    if (subjects.has(value.approver.subject) || keys.has(value.signature.keyId))
      errors.push(`${role} is not independent`);
    subjects.add(value.approver.subject);
    keys.add(value.signature.keyId);
  }
  if (packet.attestations.length !== approvalRoles.length)
    errors.push("approval packet contains unexpected attestations");
  return [...new Set(errors)];
}

export function attestationTemplate(
  surfaceCode: string,
  role: ApprovalRole,
  evidenceBundleHash: string,
  evidenceHashes: string[],
) {
  return {
    schemaVersion: 1,
    kind: "athyper.g6-compatibility-retirement-attestation",
    surfaceCode,
    role,
    decision: "approve",
    approver: {
      subject: "REPLACE_WITH_IMMUTABLE_SUBJECT",
      authorityRef: "REPLACE_WITH_IMMUTABLE_AUTHORITY_RECORD",
    },
    issuedAt: "REPLACE_WITH_ISO_TIMESTAMP",
    evidenceBundleHash,
    evidenceHashes,
    assertions: Object.fromEntries(
      requiredAssertions[role].map((key) => [
        key,
        `REPLACE_WITH_SUBSTANTIVE_${key.toUpperCase()}_ATTESTATION`,
      ]),
    ),
    signature: {
      algorithm: "ed25519",
      keyId: "REPLACE_WITH_SHA256_OF_SPKI",
      publicKeyPem: "REPLACE_WITH_PUBLIC_KEY_PEM",
      valueBase64: "REPLACE_WITH_DETACHED_SIGNATURE",
    },
    attestationHash: "REPLACE_WITH_CANONICAL_PAYLOAD_SHA256",
  };
}
