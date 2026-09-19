/** Shared, pure policy. Result counts must not change a control while searching. */
export function choicePresentation(input: {
  readonly optionCount: number;
  readonly sourceKey?: string;
  readonly semanticRole?: string;
  readonly valueKind?: string;
  readonly multiple?: boolean;
}): "select" | "searchable" {
  return input.multiple ||
    input.sourceKey ||
    input.valueKind === "reference" ||
    ["country_code", "language_code", "currency_code"].includes(
      input.semanticRole ?? "",
    ) ||
    input.optionCount > 15
    ? "searchable"
    : "select";
}
