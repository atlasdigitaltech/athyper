import fs from "node:fs";
import { createHash } from "node:crypto";
const sha = (x) => createHash("sha256").update(x).digest("hex"),
  prefix =
    "governance/policy/reviews/business-partner-protected-reference-amendment-20260912";
const old = JSON.parse(
    fs.readFileSync(
      "governance/policy/reviews/business-partner-protected-values-amendment-20260912.proposal.dev.json",
    ),
  ),
  manifestPath =
    "governance/policy/reports/business-partner-protected-reference-candidate-20260912.dev.json",
  m = JSON.parse(fs.readFileSync(manifestPath));
const { proposalRevision: oldRevision, ...body } = old;
const p = {
  ...body,
  kind: "isolated_neon_protected_reference_amendment",
  supersedesUnappliedRevision: oldRevision,
  runtimeImage: m.runtimeImage,
  releaseSetHash: m.releaseSetHash,
  candidateManifest: manifestPath,
  candidateManifestSha256: sha(fs.readFileSync(manifestPath)),
  secret: { ...old.secret, physicalSecretName: m.secretName },
  additionalChange:
    "Map Infisical-incompatible opaque references to a deterministic SHA-256 key; preserve existing compatible flat names. Read and write use identical mapping. No new grants or fixture scope.",
  validation: {
    adapterTests: 4,
    adapterBuild: "passed",
    canaryHealth: 200,
    tlsVerified: true,
    structuredSecretNotFound: true,
    secretCreated: false,
  },
  limitations: [
    "Positive authenticated reveals still require execution after approval.",
    "Admin session refresh reduced assurance to baseline; normal MFA is required for positive reveals.",
    "No full UI, full Atlas conversation, Mesh, enforcement activation or compatibility retirement qualification.",
  ],
};
p.proposalRevision = sha(JSON.stringify(p));
fs.writeFileSync(
  prefix + ".proposal.dev.json",
  JSON.stringify(p, null, 2) + "\n",
  { flag: "wx" },
);
const text = `# Protected-reference correction — NEON qualification\n\nProposal revision: **${p.proposalRevision}**\n\nThe approved 5c431665 amendment stopped before creating a secret, applying either migration, or changing the active runtime. Its Infisical URL used a reference containing slashes as a secret name. The deployed Infisical schema rejects slashes and colons; the long route also returned a generic route 404. That result was incorrectly treated as an absent secret during preparation.\n\nThe corrected adapter maps incompatible references to a bounded SHA-256 name and keeps existing compatible flat names unchanged. Both reads and writes use the same mapping. This adds one compiled adapter file to the earlier candidate; all earlier fixture, audit and host-registration changes remain included.\n\n- Current image: ${p.previousRuntimeImage}\n- Corrected image: **${p.runtimeImage}**\n- Release-set binding: **${p.releaseSetHash}**\n- All five signed artifacts remain pinned to the preceding proposal.\n- Logical secret reference: ${p.secret.reference}\n- Infisical physical key: ${p.secret.physicalSecretName}\n- Project/environment/path: ${p.secret.workspaceId} / dev / /\n\nFour adapter tests and TypeScript build passed. The canary returns health 200 and a TLS-verified structured Secret NotFound response for the mapped key. No secret has been created. Tests cover tenant separation, bounded names, flat-key compatibility and matching write/read coordinates.\n\nApproval permits deployment of this corrected image, the previously reviewed two-event audit contract and synthetic bank fixture, and creation of the same one synthetic secret under its mapped physical key. Existing records and secrets are not overwritten. No grants are added, restored, renewed or extended; the current execution window still ends at **16:00 MYT on 12 September 2026**. The retained fixture and synthetic secret will be inventoried together.\n\nThis supersedes only the unapplied runtime amendment ${oldRevision}. It does not accept the 66 policy dispositions, activate enforcement, retire compatibility, or expand scope beyond NEON. Positive reveals, final-image comparisons, revocation and recovery remain to be executed.\n`;
fs.writeFileSync(
  "docs/reviews/business-partner-protected-reference-amendment-20260912.md",
  text,
  { flag: "wx" },
);
console.log({ proposalRevision: p.proposalRevision, image: p.runtimeImage });
