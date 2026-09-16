"use client";
import { businessLabel } from "./360/display-values";

import { Card } from "@athyper/platform-ui";
import type { MaterializationProof } from "./client";

export function MaterializationResultProof({ proof }: { readonly proof?: MaterializationProof }) {
  if (!proof) return <Card className="bp-section"><h2>Materialization proof</h2><p>No materialization result has been recorded.</p></Card>;
  return <div className="bp-card-grid" aria-label="Read-only materialization proof">
    <Card className="bp-section"><h2>Result coordinates</h2><Definition values={[["Business Partner",proof.result.businessPartnerId],["Role",proof.result.partnerRole],["Role record",proof.result.roleId],["Organization assignment",proof.result.operatingOrganizationAssignmentId],["Bank verification",proof.result.bankVerificationId],["Result code",proof.resultCode],["Materialization",proof.materializationId],["Attempt",proof.attemptNo],["Completed",proof.completedAt],["Completed by",proof.completedBy]]}/></Card>
    <Card className="bp-section"><h2>Snapshot summary</h2><Definition values={[["Source snapshot",proof.sourceSnapshot.snapshotId],["Source entity",`${proof.sourceSnapshot.entityType} v${proof.sourceSnapshot.version}`],["Source hash",proof.sourceSnapshot.payloadHash],["Result snapshot",proof.resultSnapshot.snapshotId],["Result entity",`${proof.resultSnapshot.entityType} v${proof.resultSnapshot.version}`],["Result hash",proof.resultSnapshot.payloadHash],["Materializer",`${proof.materializer.code} v${proof.materializer.version}`],["Application fingerprint",proof.applicationFingerprint]]}/></Card>
    <Card className="bp-section"><h2>Lineage ({proof.lineage.length})</h2>{proof.lineage.length?<ol className="bp-case-sections">{proof.lineage.map(edge=><li key={edge.lineageId}><strong>{label(edge.role)}</strong><span>{edge.sourceSnapshotId} → {edge.targetSnapshotId}</span><small>{edge.transformationCode} v{edge.transformationVersion} · {edge.evidenceHash}</small></li>)}</ol>:<p>No lineage edge is visible.</p>}<p className="bp-context-note">Read-only proof shows at most the 25 newest coordinate edges. Snapshot payloads and protected evidence are omitted.</p></Card>
  </div>;
}

function Definition({values}:{readonly values:readonly (readonly [string,unknown])[]}){return <dl className="bp-definition">{values.map(([term,value])=><div key={term}><dt>{term}</dt><dd>{value===undefined||value===""?"—":String(value)}</dd></div>)}</dl>;}
function label(value: string): string { return businessLabel(value, "title"); }
