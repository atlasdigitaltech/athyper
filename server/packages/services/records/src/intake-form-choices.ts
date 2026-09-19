import { intakeReferenceSources } from "@athyper/contract-platform-entity-runtime";
import type { EntityIntakeSurfaceV1 } from "@athyper/contract-platform-entity-runtime";
/** Called only after application access resolution. Resolve each registered source once per request. */
export async function resolveIntakeFormChoices(
  surfaces: readonly EntityIntakeSurfaceV1[],
  resolve?: (
    sourceKey: string,
  ) => Promise<readonly { value: string; label: string }[]>,
): Promise<readonly EntityIntakeSurfaceV1[]> {
  const sources = new Map<
    string,
    Promise<readonly { value: string; label: string }[]>
  >();
  return Promise.all(
    surfaces.map(async (surface) => ({
      ...surface,
      sections: await Promise.all(
        surface.sections.map(async (section) => ({
          ...section,
          fields: await Promise.all(
            section.fields.map(async (field) => {
              if (field.control !== "input" || !field.lookup?.sourceKey)
                return field;
              const source = field.lookup.sourceKey;
              if (!(intakeReferenceSources as readonly string[]).includes(source) || !resolve)
                throw Error("INTAKE_LOOKUP_RESOLVER_UNAVAILABLE");
              if (!sources.has(source))
                sources.set(
                  source,
                  resolve(source).then((options) => {
                    if (
                      options.length > 2000 ||
                      new Set(options.map((o) => o.value)).size !==
                        options.length ||
                      options.some((o) => !o.value.trim() || !o.label.trim())
                    )
                      throw Error("INTAKE_LOOKUP_OPTIONS_INVALID");
                    return options;
                  }),
                );
              return {
                ...field,
                lookup: {
                  ...field.lookup,
                  sourceKey: source,
                  options: await sources.get(source)!,
                },
              };
            }),
          ),
        })),
      ),
    })),
  );
}
