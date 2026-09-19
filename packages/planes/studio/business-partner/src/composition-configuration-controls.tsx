"use client";
import { useState } from "react";
import { Button, Input, Label, Select } from "@athyper/platform-ui";
import type { CompositionNode } from "./composition-model";
import {
  denialGuidance,
  configurationProperties,
  qualifyConfiguration,
  permissionDiagnosis,
} from "./composition-configuration";
import { record, rows, type Json } from "./workbench-model";
const labels: Record<string, string> = {
  required: "Require a value",
  title: "Flow title",
  description: "Description",
  navigationMode: "Navigation",
  allowDraftResume: "Allow draft resume",
  titleOverride: "Step title",
  isOptional: "Optional step",
};
export function ConfigurationControls({
  graph,
  node,
  onApply,
}: {
  graph: Json;
  node: CompositionNode;
  onApply: (property: string, value: string | boolean) => void;
}) {
  if (!configurationProperties[node.collection]) return null;
  let reason = "";
  try {
    qualifyConfiguration(graph, node.collection, String(node.value.id));
  } catch (e) {
    reason = e instanceof Error ? e.message : "Unsupported configuration.";
  }
  return (
    <section
      className="studio-composition-structure"
      aria-label="Qualified configuration"
    >
      <h3>
        {node.collection === "surfaceFieldBindings"
          ? "Validation rule"
          : "Intake workflow settings"}
      </h3>
      {reason ? (
        <p>{reason}</p>
      ) : (
        <>
          <p>
            {node.collection === "surfaceFieldBindings"
              ? "Required values are checked by the intake renderer. Server business validation still applies."
              : "These settings control the intake journey. Approval policies, lifecycle transitions, and operation permissions are governed separately."}
          </p>
          {configurationProperties[node.collection]!.map((property) => (
            <Setting
              key={`${node.key}:${property}:${JSON.stringify(node.value)}`}
              property={property}
              value={
                property === "required"
                  ? (record(node.value.displayConfig).required ?? false)
                  : (node.value[property] ??
                    (property === "allowDraftResume"
                      ? true
                      : property === "isOptional"
                        ? false
                        : property === "navigationMode"
                          ? "linear"
                          : ""))
              }
              onApply={onApply}
            />
          ))}
        </>
      )}
    </section>
  );
}
function Setting({
  property,
  value,
  onApply,
}: {
  property: string;
  value: unknown;
  onApply: (property: string, value: string | boolean) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const boolean = ["required", "allowDraftResume", "isOptional"].includes(
      property,
    ),
    id = `configuration-${property}`;
  return (
    <div>
      <Label htmlFor={id}>{labels[property]}</Label>
      {boolean || property === "navigationMode" ? (
        <Select
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        >
          {(boolean ? ["true", "false"] : ["linear", "free"]).map((v) => (
            <option key={v} value={v}>
              {boolean ? (v === "true" ? "Yes" : "No") : v}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
        />
      )}
      <Button
        variant="secondary"
        disabled={draft === String(value)}
        onClick={() => onApply(property, boolean ? draft === "true" : draft)}
      >
        Apply {labels[property]?.toLowerCase()}
      </Button>
    </div>
  );
}
export function PermissionExplorer({ graph }: { graph: Json }) {
  const operations = rows(graph.operations),
    [operation, setOperation] = useState(""),
    [plane, setPlane] = useState("neon"),
    [observedReason, setObservedReason] = useState("");
  const selected = operations.some((o) => o.id === operation)
    ? operation
    : String(operations[0]?.id ?? "");
  const result = permissionDiagnosis(graph, selected, plane);
  const surfaces = rows(graph.surfaceOperations)
    .filter((p) => p.entityOperationId === selected)
    .map(
      (p) =>
        rows(graph.surfaces).find((s) => s.id === p.entitySurfaceId)
          ?.surfaceKey ?? "Unresolved surface",
    );
  return (
    <section
      className="studio-composition-structure"
      aria-label="Permission diagnosis"
    >
      <h2>Permission diagnosis</h2>
      <p>
        Requirements from the selected stored version. Effective user access is
        unknown until checked in the target plane with the user, tenant, record
        scope, session, and active release.
      </p>
      <Label htmlFor="diagnosis-operation">Operation</Label>
      <Select
        id="diagnosis-operation"
        value={selected}
        onChange={(e) => {
          setOperation(e.target.value);
          setObservedReason("");
        }}
      >
        {operations.map((o, i) => (
          <option key={i} value={String(o.id)}>
            {String(o.operationKey)}
          </option>
        ))}
      </Select>
      <Label htmlFor="diagnosis-plane">Target plane</Label>
      <Select
        id="diagnosis-plane"
        value={plane}
        onChange={(e) => {
          setPlane(e.target.value);
          setObservedReason("");
        }}
      >
        <option value="neon">Neon</option>
        <option value="mesh">Mesh</option>
      </Select>
      <p>
        Surfaces:{" "}
        {surfaces.length
          ? surfaces.join(", ")
          : "No surface action placement declared"}
      </p>
      <p>Permission: {result.permissions.join(", ") || "Not declared"}</p>
      <p>
        MFA requirement:{" "}
        {result.mfa
          ? "Required by this operation"
          : "Not declared here; other policies may require it"}
      </p>
      <ul>
        {result.findings.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
      <details>
        <summary>Scope coordinates and missing-value behavior</summary>
        <pre>{JSON.stringify(result.scopes, null, 2)}</pre>
      </details>
      <details>
        <summary>Conditional rules and reason codes</summary>
        <pre>{JSON.stringify(result.rules, null, 2)}</pre>
      </details>
      <Label htmlFor="diagnosis-reason">
        Observed API denial reason (optional)
      </Label>
      <Select
        id="diagnosis-reason"
        value={observedReason}
        onChange={(e) => setObservedReason(e.target.value)}
      >
        <option value="">No response reason supplied</option>
        {Object.keys(denialGuidance).map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </Select>
      {observedReason ? (
        <p role="status">
          Response guidance: {denialGuidance[observedReason]} This is guidance
          for the supplied reason, not a new access check.
        </p>
      ) : null}
      <p>
        For a live denial, retain the response reason code and correlation ID.
        Check target membership, grant validity, deny rules, MFA, and
        activation. This view does not grant access or simulate another user.
      </p>
    </section>
  );
}
