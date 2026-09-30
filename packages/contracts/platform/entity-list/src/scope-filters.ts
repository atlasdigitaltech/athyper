/** Published scope filters; values remain subject to the plane's authorization resolver. */
export interface EntityScopeFilterV1 {
  readonly key: "partnerRole" | "eligibleOperation";
  readonly label: string;
  readonly emptyLabel: string;
  readonly options: readonly Readonly<{ value: string; label: string }>[];
  readonly requires?: readonly ("partnerRole" | "organization" | "company")[];
}
export function parseEntityScopeFilters(value: unknown): readonly EntityScopeFilterV1[] {
  if (!Array.isArray(value) || value.length > 2) throw new TypeError("Invalid scope quick filters");
  const seen = new Set<string>();
  const result = value.map(item => {
    if (!item || typeof item !== "object" || !["partnerRole", "eligibleOperation"].includes(item.key) || seen.has(item.key)) throw new TypeError("Invalid scope filter key");
    seen.add(item.key);
    const validText = (text: unknown): text is string => typeof text === "string" && text.trim().length > 0 && text.length <= 160;
    if (!validText(item.label) || !validText(item.emptyLabel) || !Array.isArray(item.options) || !item.options.length || item.options.length > 3) throw new TypeError("Invalid scope filter presentation");
    const allowed = item.key === "partnerRole" ? ["supplier", "customer"] : ["order", "invoice", "payment"];
    const values = new Set<string>();
    for (const option of item.options) {
      if (!option || !allowed.includes(option.value) || !validText(option.label) || values.has(option.value)) throw new TypeError("Invalid scope filter option");
      values.add(option.value);
    }
    const requires = item.requires ?? [];
    if (!Array.isArray(requires) || requires.some(key => !["partnerRole", "organization", "company"].includes(key)) || new Set(requires).size !== requires.length) throw new TypeError("Invalid scope filter dependencies");
    if (item.key === "partnerRole" && requires.length) throw new TypeError("Role cannot depend on transaction scope");
    if (item.key === "eligibleOperation" && ["partnerRole", "organization", "company"].some(key => !requires.includes(key))) throw new TypeError("Eligibility requires role, organization and company");
    return Object.freeze({ key: item.key, label: item.label, emptyLabel: item.emptyLabel, options: Object.freeze(item.options.map((option: {value:string;label:string}) => Object.freeze({value:option.value,label:option.label}))), requires: Object.freeze([...requires]) }) as EntityScopeFilterV1;
  });
  if (seen.has("eligibleOperation") && !seen.has("partnerRole")) throw new TypeError("Eligibility requires a role filter");
  return Object.freeze(result);
}
