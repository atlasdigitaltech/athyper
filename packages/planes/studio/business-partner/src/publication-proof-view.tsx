"use client";
import { useState } from "react";
import { Button, Input, Label } from "@athyper/platform-ui";
import { record, type Inspection, type Json } from "./workbench-model";
import { proofMismatch } from "./publication-proof";
export function PublicationProof({
  inspection,
  tracking,
}: {
  inspection: Inspection;
  tracking?: Json;
}) {
  const [evidence, setEvidence] = useState<Json>(),
    [error, setError] = useState("");
  const mismatch = evidence
    ? tracking
      ? proofMismatch(inspection, tracking, evidence)
      : "Refresh target activation before reviewing this observation."
    : undefined;
  return (
    <section aria-label="Neon browser proof">
      <h4>Neon browser proof</h4>
      <p>
        Run the read-only verification tool after publication. It checks the
        release, tenant, runtime descriptor, surface field and visible label,
        then captures a screenshot.
      </p>
      <code>
        node tooling/scripts/verification/verify-studio-workbench-neon.mjs
        --release {inspection.id} --studio-session &lt;session-file&gt;
        --neon-session &lt;session-file&gt; --surface &lt;surface-key&gt;
        --field &lt;field-key&gt; --expected-text &quot;&lt;label&gt;&quot;
        --output &lt;evidence-folder&gt;
      </code>
      <Label htmlFor="neon-proof-file">
        Load browser observation (evidence.json)
      </Label>
      <Input
        id="neon-proof-file"
        type="file"
        accept="application/json,.json"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          setEvidence(undefined);
          setError("");
          if (!file) return;
          try {
            if (file.size > 100000)
              throw Error("Observation file is too large.");
            const value = record(JSON.parse(await file.text()));
            setEvidence(value);
          } catch {
            setError("Could not read the observation JSON.");
          }
        }}
      />
      {error || mismatch ? (
        <p role="alert">{error || mismatch}</p>
      ) : evidence ? (
        <>
          <p role="status">
            Imported browser observation matches the current release and
            activation.
          </p>
          <dl>
            <dt>Observed</dt>
            <dd>{String(evidence.observedAt)}</dd>
            <dt>Surface / field</dt>
            <dd>
              {String(evidence.surfaceKey)} / {String(evidence.fieldKey)}
            </dd>
            <dt>Visible text</dt>
            <dd>{String(evidence.expectedText)}</dd>
          </dl>
        </>
      ) : (
        <p>Browser verification: not recorded by this panel.</p>
      )}
      {evidence ? (
        <Button variant="ghost" onClick={() => setEvidence(undefined)}>
          Clear observation
        </Button>
      ) : null}
      <p>
        Imported observations are local, unsigned evidence. They are not stored
        as an approval or deployment receipt. Keep the generated screenshot with
        the evidence file.
      </p>
    </section>
  );
}
