"use client";
import { useEffect, useMemo, useState } from "react";
import {
  compileEntityIntakeSurfaces,
  dataSurfaceDefaults,
  type DataAnswers,
  type EntityIntakeSurfaceV1,
} from "@athyper/contract-platform-entity-runtime";
import {
  EntityDataSurface,
  EntityIntakeSurface,
} from "@athyper/platform-entity-form-detail";
/** Uses the production classification renderer without request/lookup adapters. */
export function CompositionPreview({
  graph,
  revision,
  surfaceId,
}: {
  graph: Record<string, unknown>;
  revision: string;
  surfaceId: string;
}) {
  const compiled = useMemo(() => {
    try {
      const all = Array.isArray(graph.surfaces)
        ? (graph.surfaces as Record<string, unknown>[])
        : [];
      const selected = all.find((s) => s.id === surfaceId);
      if (!selected)
        return { error: "Choose a surface present in this version." };
      if (
        (selected.layoutConfig as Record<string, unknown> | undefined)
          ?.renderer !== "intake"
      )
        return {
          error:
            "Preview unavailable: this surface does not use the supported intake renderer.",
        };
      const surfaces = compileEntityIntakeSurfaces(graph);
      const surface = surfaces.find((s) => s.key === selected.surfaceKey);
      if (!surface)
        return { error: "The compiler did not produce the selected surface." };
      const controls = surface.sections
        .flatMap((s) => s.fields)
        .map((f) => f.control);
      const data = controls.every(
        (c) => c === "input" || c === "repeatableGroup",
      );
      const classification = controls.every(
        (c) => c === "choiceCards" || c === "entityLookup",
      );
      if (!data && !classification)
        return {
          error:
            "Preview unavailable: mixed classification and data controls require a supported combined renderer.",
        };
      // Check only reachable nested surfaces; unrelated registered controls do not block Address.
      const visited = new Set<string>();
      const check = (current: EntityIntakeSurfaceV1): string | undefined => {
        if (visited.has(current.key)) return undefined;
        visited.add(current.key);
        for (const field of current.sections.flatMap((s) => s.fields)) {
          if (field.control === "input" && field.widget === "registered")
            return `Preview unavailable: ${field.label} requires the ${field.handlerKey} adapter.`;
          if (field.control === "repeatableGroup") {
            const nested = surfaces.find((s) => s.key === field.itemSurfaceKey);
            if (nested) {
              const error = check(nested);
              if (error) return error;
            }
          }
        }
      };
      const error = data ? check(surface) : undefined;
      return error ? { error } : { surface, surfaces, data };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "Surface compilation failed.",
      };
    }
  }, [graph, surfaceId]);
  if (compiled.error)
    return (
      <p role="status">
        {compiled.error} Stored properties and differences remain available.
      </p>
    );
  return compiled.surface ? (
    compiled.data ? (
      <LocalDataSurface
        key={JSON.stringify(compiled.surfaces) + revision}
        surface={compiled.surface}
        surfaces={compiled.surfaces!}
      />
    ) : (
      <LocalSurface
        key={JSON.stringify(compiled.surface) + revision}
        surface={compiled.surface}
      />
    )
  ) : null;
}
function LocalSurface({ surface }: { surface: EntityIntakeSurfaceV1 }) {
  const [answers, setAnswers] = useState<Readonly<Record<string, string>>>({}),
    [errors, setErrors] = useState(false);
  return (
    <div>
      <EntityIntakeSurface
        surface={surface}
        answers={answers}
        onChange={(next) => setAnswers(next)}
        showErrors={errors}
      />
      <button
        type="button"
        className="a-button a-button--secondary"
        onClick={() => setErrors(true)}
      >
        Check required fields
      </button>
      <button
        type="button"
        className="a-button a-button--ghost"
        onClick={() => {
          setAnswers({});
          setErrors(false);
        }}
      >
        Reset sample answers
      </button>
    </div>
  );
}

type Choices = Record<
  string,
  readonly { value: string; label: string; data?: Record<string, string> }[]
>;
function LocalDataSurface({
  surface,
  surfaces,
}: {
  surface: EntityIntakeSurfaceV1;
  surfaces: readonly EntityIntakeSurfaceV1[];
}) {
  const [choices, setChoices] = useState<Choices>({});
  const [lookupError, setLookupError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const needsAddress = surfaces.some((s) =>
    s.sections.some((section) =>
      section.fields.some(
        (f) =>
          f.control === "input" &&
          ["iso.country", "shared.state_region"].includes(
            f.lookup?.sourceKey ?? "",
          ),
      ),
    ),
  );
  useEffect(() => {
    if (!needsAddress) return;
    const controller = new AbortController();
    setLookupError("");
    fetch(
      "/api/relay/meta-entity-authoring/inspection/address-preview-choices",
      {
        credentials: "same-origin",
        signal: controller.signal,
        cache: "no-store",
      },
    )
      .then(async (r) => {
        if (!r.ok) throw Error(`Reference choices unavailable (${r.status}).`);
        return r.json();
      })
      .then((value) => {
        for (const key of ["iso.country", "shared.state_region"]) {
          if (
            !Array.isArray(value[key]) ||
            value[key].some(
              (o: any) =>
                typeof o.value !== "string" || typeof o.label !== "string",
            )
          )
            throw Error("Invalid reference choices response.");
        }
        if (!controller.signal.aborted) setChoices(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setLookupError(e.message);
      });
    return () => controller.abort();
  }, [needsAddress, attempt]);
  const resolved = useMemo(
    () =>
      surfaces.map((s) => ({
        ...s,
        sections: s.sections.map((section) => ({
          ...section,
          fields: section.fields.map((f) =>
            f.control === "input" &&
            f.lookup?.sourceKey &&
            choices[f.lookup.sourceKey]
              ? {
                  ...f,
                  lookup: { ...f.lookup, options: choices[f.lookup.sourceKey] },
                }
              : f,
          ),
        })),
      })),
    [surfaces, choices],
  );
  const selected = resolved.find((s) => s.key === surface.key)!;
  const [answers, setAnswers] = useState<DataAnswers>(() =>
    dataSurfaceDefaults(surface, surfaces),
  );
  return (
    <div>
      {needsAddress && !choices["iso.country"] ? (
        <p role="status">
          {lookupError || "Loading country and region choices…"}
          {lookupError ? (
            <button
              type="button"
              className="a-button a-button--ghost"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Retry reference choices
            </button>
          ) : null}
        </p>
      ) : null}
      <EntityDataSurface
        surface={selected}
        surfaces={resolved}
        answers={answers}
        onChange={setAnswers}
      />
      <button
        type="button"
        className="a-button a-button--ghost"
        onClick={() => setAnswers(dataSurfaceDefaults(surface, surfaces))}
      >
        Reset sample answers
      </button>
    </div>
  );
}
