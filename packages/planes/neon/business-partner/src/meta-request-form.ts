import type {
  EntityIntakeSurfaceV1,
  IntakeInputField,
} from "@athyper/contract-platform-entity-runtime";
import type {
  RequestFormDescriptor,
  RequestFormField,
} from "./request-form-descriptor";
/** Transitional command serializer contract derived solely from the active Meta Entity surface. */
export function requestFormFromSurface(
  surface: EntityIntakeSurfaceV1,
): RequestFormDescriptor {
  const fields = surface.sections
    .flatMap((s) => s.fields)
    .filter((f): f is IntakeInputField => f.control === "input");
  return {
    schema: "athyper.business-partner-request-form/1",
    version: "meta-entity",
    title: surface.title,
    description: "",
    submitLabel: surface.formLabels?.submit ?? "Submit",
    sections: surface.sections.map((s) => ({
      key: s.key,
      title: s.title ?? "",
      description: s.description,
      fields: s.fields
        .filter((f): f is IntakeInputField => f.control === "input")
        .map((f) => {
          if (!f.payload)
            throw Error(`Missing request payload binding: ${f.key}`);
          const widget =
            f.widget === "select"
              ? "lookup"
              : f.widget === "registered"
                ? "operating_organization"
                : f.widget;
          if (
            f.widget === "registered" &&
            f.handlerKey !== "business_partner.organization"
          )
            throw Error("Unsupported Business Partner input handler");
          return {
            key: f.valueKey,
            path: f.payload.path,
            target: f.payload.target,
            label: f.label,
            widget,
            required: f.required,
            placeholder: f.placeholder,
            helpText: f.helpText,
            defaultValue: f.defaultValue,
            maxLength: f.maxLength,
            columnSpan: f.columnSpan,
            normalize: f.normalize,
            ...(f.lookup
              ? {
                  lookup: {
                    code: f.lookup.sourceKey ?? f.key,
                    options: f.lookup.options ?? [],
                  },
                }
              : {}),
            ...(f.visibleWhen
              ? {
                  visibility: {
                    field: fields.find(
                      (candidate) => candidate.key === f.visibleWhen!.field,
                    )!.valueKey,
                    operator:
                      f.visibleWhen.operator === "present"
                        ? "not_equals"
                        : "equals",
                    value:
                      f.visibleWhen.operator === "present"
                        ? ""
                        : f.visibleWhen.value,
                  },
                }
              : {}),
          } as RequestFormField;
        }),
    })),
  };
}
