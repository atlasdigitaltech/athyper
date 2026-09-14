"use client";
import { useEffect, useMemo, useState } from "react";
import { compileEntityIntakeSurfaces } from "@athyper/contract-platform-entity-runtime";
import {
  EntityIntakeClassification,
  type IntakeClassificationHandoff,
} from "@athyper/platform-entity-form-detail";
/** Preview uses the exact compiler contract and renderer; never invokes domain mutations. */
export function IntakeSurfacePreview({
  text,
  revision,
}: {
  readonly text: string;
  readonly revision: string;
}) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState(""),
    [result, setResult] = useState<IntakeClassificationHandoff>();
  const compiled = useMemo(() => {
    try {
      return { surfaces: compileEntityIntakeSurfaces(JSON.parse(text)) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Invalid surface" };
    }
  }, [text]);
  useEffect(() => setResult(undefined), [text]);
  const surface =
    compiled.surfaces?.find((s) => s.key === selected) ??
    compiled.surfaces?.[0];
  if (!surface && !compiled.error) return null;
  return (
    <section aria-label="Intake surface preview">
      <button
        className="a-button a-button--secondary"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide" : "Preview"} intake surfaces
      </button>
      {open ? (
        <>
          <p>
            Draft presentation preview. Selections stay in this preview; no
            business request is created.
          </p>
          {compiled.error ? (
            <p role="alert">{compiled.error}</p>
          ) : surface ? (
            <>
              {(compiled.surfaces?.length ?? 0) > 1 ? (
                <label>
                  Surface{" "}
                  <select
                    value={surface.key}
                    onChange={(e) => {
                      setSelected(e.currentTarget.value);
                      setResult(undefined);
                    }}
                  >
                    {compiled.surfaces!.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <h2>{surface.title}</h2>
              <EntityIntakeClassification
                key={text + surface.key}
                surface={surface}
                descriptorHash={revision}
                continueLabel="Check classification"
                onAnswersChange={() => setResult(undefined)}
                onContinue={async (handoff) => setResult(handoff)}
              />
              {result?.surfaceKey === surface.key &&
              result.descriptorHash === revision ? (
                <div role="status">
                  <p>
                    Classification is complete. The entity adapter would receive
                    these answers:
                  </p>
                  <pre>{JSON.stringify(result.answers, null, 2)}</pre>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
