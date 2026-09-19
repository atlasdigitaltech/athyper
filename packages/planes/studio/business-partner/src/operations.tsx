"use client";

import { createOperation, type HttpClient } from "@athyper/platform-api-client";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { useMemo, useState, type FormEvent } from "react";

export interface QualificationEvidenceItem {
  readonly id: string;
  readonly status: string;
  readonly evidence: readonly string[];
}

export interface BusinessPartnerQualificationManifest {
  readonly implementationStatus: string;
  readonly productionQualification: string;
  readonly productionQualified: boolean;
  readonly scenarioEvidence: readonly QualificationEvidenceItem[];
  readonly environmentBlockers: readonly string[];
}

export interface BusinessPartnerReleaseQualification {
  readonly productionQualification: string;
  readonly productionQualified: boolean;
  readonly gates: readonly {
    readonly id: string;
    readonly scenario: string;
    readonly status: string;
    readonly receipt: string | null;
    readonly requiredCommand: string;
  }[];
}

export interface DefinitionSimulation {
  readonly schema: "athyper.business-partner-definition-simulation/1";
  readonly readOnly: true;
  readonly publicationAuthorized: false;
  readonly bundleCode: string;
  readonly semanticVersion: string;
  readonly compatible: true;
  readonly againstRevisionId?: string;
  readonly againstSemanticVersion?: string;
  readonly planes: readonly {
    readonly plane: "studio" | "neon" | "mesh";
    readonly sourceBundleHash: string;
    readonly compiledBundleHash: string;
    readonly report: Readonly<Record<string, unknown>>;
  }[];
}

const simulate = createOperation<
  DefinitionSimulation,
  DefinitionSimulationRequest
>({
  method: "POST",
  path: "/api/studio/business-partner-definitions/simulations",
  idempotency: "forbidden",
});

interface DefinitionSimulationRequest {
  readonly bundle: unknown;
  readonly targetPlanes: readonly ("studio" | "neon" | "mesh")[];
  readonly againstRevisionId?: string;
}

export function createBusinessPartnerDefinitionSimulationClient(
  http: HttpClient,
) {
  return Object.freeze({
    simulate: (body: DefinitionSimulationRequest) =>
      http.request(simulate, { body }),
  });
}

export function BusinessPartnerOperationsWorkspace({
  qualification,
  releaseQualification,
}: {
  readonly qualification: BusinessPartnerQualificationManifest;
  readonly releaseQualification?: BusinessPartnerReleaseQualification;
}) {
  const http = useApiClient();
  const client = useMemo(
    () => createBusinessPartnerDefinitionSimulationClient(http),
    [http],
  );
  const [result, setResult] = useState<DefinitionSimulation>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    const data = new FormData(event.currentTarget);
    try {
      const raw = String(data.get("bundle") ?? "").trim();
      if (!raw) throw new Error("Definition bundle JSON is required.");
      const againstRevisionId = String(
        data.get("againstRevisionId") ?? "",
      ).trim();
      const targetPlanes = data.getAll("targetPlanes").map(String) as (
        "studio" | "neon" | "mesh"
      )[];
      if (!targetPlanes.length)
        throw new Error("Select at least one target plane.");
      setResult(
        await client.simulate({
          bundle: JSON.parse(raw),
          targetPlanes,
          ...(againstRevisionId ? { againstRevisionId } : {}),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Simulation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <section aria-labelledby="release-simulation-heading">
        <h2 id="release-simulation-heading">Definition release simulation</h2>
        <p>
          Compile against each selected consumer and optionally compare with an
          immutable prior revision. Simulation never authors or publishes a
          release.
        </p>
        <form onSubmit={run} className="athyper-governance-list">
          <label>
            Comparison revision ID (optional)
            <input
              name="againstRevisionId"
              pattern="[0-9a-fA-F-]{36}"
              autoComplete="off"
            />
          </label>
          <fieldset>
            <legend>Target consumers</legend>
            {(["studio", "neon", "mesh"] as const).map((plane) => (
              <label key={plane}>
                <input
                  type="checkbox"
                  name="targetPlanes"
                  value={plane}
                  defaultChecked
                />{" "}
                {plane.toUpperCase()}
              </label>
            ))}
          </fieldset>
          <label>
            Definition bundle JSON
            <textarea name="bundle" rows={14} spellCheck={false} required />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Simulating…" : "Run read-only simulation"}
          </button>
        </form>
        <div aria-live="polite">
          {error ? <p role="alert">{error}</p> : null}
          {result ? (
            <div>
              <p>
                <strong>Compatible</strong> · {result.bundleCode}{" "}
                {result.semanticVersion}
              </p>
              <ul className="athyper-governance-list">
                {result.planes.map((item) => (
                  <li key={item.plane}>
                    <strong>{item.plane.toUpperCase()}</strong>
                    <span>Compiled hash: {item.compiledBundleHash}</span>
                    <span>Source hash: {item.sourceBundleHash}</span>
                  </li>
                ))}
              </ul>
              <p>Read only: yes · Publication authorized: no</p>
            </div>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="qualification-proof-heading">
        <h2 id="qualification-proof-heading">Qualification proof</h2>
        <p>
          Local implementation: {qualification.implementationStatus}. Production
          qualification: {qualification.productionQualification}.
        </p>
        <ul className="athyper-governance-list">
          {qualification.scenarioEvidence.map((scenario) => (
            <li key={scenario.id}>
              <strong>{scenario.id}</strong>
              <span>{scenario.status.replaceAll("_", " ")}</span>
              <span>
                {scenario.evidence.length} retained evidence coordinate(s)
              </span>
              <details>
                <summary>View coordinates</summary>
                <ul>
                  {scenario.evidence.map((path) => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
        {!qualification.productionQualified ? (
          <div role="status">
            <strong>Production qualification remains blocked</strong>
            <ul>
              {qualification.environmentBlockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {releaseQualification ? (
        <section aria-labelledby="release-qualification-heading">
          <h2 id="release-qualification-heading">R8 production gates</h2>
          <p>
            These gates accept retained, sanitized evidence receipts only. A
            local check cannot promote a production gate.
          </p>
          <table>
            <caption>R8 production qualification evidence gates</caption>
            <thead>
              <tr>
                <th scope="col">Gate</th>
                <th scope="col">Scenario</th>
                <th scope="col">Status</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {releaseQualification.gates.map((gate) => (
                <tr key={gate.id}>
                  <th scope="row">{gate.id.replaceAll("_", " ")}</th>
                  <td>{gate.scenario}</td>
                  <td>{gate.status}</td>
                  <td>{gate.receipt ?? "Required before certification"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p role="status">
            R8 production qualification: {releaseQualification.productionQualification}.
          </p>
        </section>
      ) : null}
    </div>
  );
}
