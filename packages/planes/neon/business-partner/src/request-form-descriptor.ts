export type RequestFormFieldWidget =
  | "text"
  | "textarea"
  | "url"
    | "date"
    | "password"
  | "integer"
  | "decimal"
  | "checkbox"
  | "lookup"
  | "operating_organization";

export interface RequestFormDefinition {
  readonly code: string;
  readonly version: number;
  readonly hash: string;
  readonly releaseId: string;
}

export interface RequestFormVisibility {
  readonly field: string;
  readonly operator: "equals" | "not_equals" | "in";
  readonly value?: string | boolean | number;
  readonly values?: readonly (string | boolean | number)[];
}

export interface RequestFormField {
  readonly key: string;
  readonly path: string;
  readonly target: "context" | "canonical" | "request_only";
  readonly label: string;
  readonly widget: RequestFormFieldWidget;
  readonly required: boolean;
  readonly helpText?: string;
  readonly placeholder?: string;
  readonly defaultValue?: string | boolean | number;
  readonly maxLength?: number;
  readonly columnSpan?: number;
  readonly autoComplete?: string;
  readonly normalize?: "uppercase" | "lowercase";
  readonly visibility?: RequestFormVisibility;
  readonly lookup?: Readonly<{
    code: string;
    options: readonly Readonly<{ value: string; label: string }>[];
  }>;
}

export interface RequestFormDescriptor {
  readonly schema: "athyper.business-partner-request-form/1";
  readonly version: string;
  readonly title: string;
  readonly description: string;
  readonly sections: readonly Readonly<{
    key: string;
    title: string;
    description?: string;
    fields: readonly RequestFormField[];
    components?: readonly RequestFormRepeatableComponent[];
  }>[];
  readonly submitLabel: string;
}

export interface RequestFormRepeatableComponent {
  readonly key: string;
  readonly kind: "addresses" | "contacts";
  readonly title: string;
  readonly addLabel: string;
  readonly minItems: number;
  readonly maxItems: number;
  readonly requirePrimary: boolean;
  readonly lookups: Readonly<{
    countries?: readonly Readonly<{ value: string; label: string }>[];
    purposes: readonly Readonly<{ value: string; label: string }>[];
    channels?: readonly Readonly<{ value: string; label: string }>[];
  }>;
}

export interface PublishedRequestForm {
  readonly definition: RequestFormDefinition;
  readonly descriptor: RequestFormDescriptor;
}

export function parsePublishedRequestForm(value: unknown): PublishedRequestForm {
  const root = record(value), requestForm = record(root.requestForm), definition = record(requestForm.definition), descriptor = record(requestForm.descriptor);
  const sections = array(descriptor.sections, "form sections");
  if (descriptor.schema !== "athyper.business-partner-request-form/1" || sections.length < 1 || sections.length > 20) throw new TypeError("Published Supplier request form is incompatible");
  const parsedSections = sections.map((candidate, sectionIndex) => {
    const section = record(candidate), fields = array(section.fields, `section ${sectionIndex + 1} fields`), components=section.components===undefined?[]:array(section.components,`section ${sectionIndex + 1} components`);
    if (fields.length > 100) throw new TypeError("Published Supplier request form has too many fields");
    if(components.length>10)throw new TypeError("Published Supplier request form has too many repeatable components");
    return Object.freeze({
      key: code(section.key, "section key"),
      title: text(section.title, "section title", 256),
      ...(section.description === undefined ? {} : { description: text(section.description, "section description", 2_000) }),
      fields: Object.freeze(fields.map(parseField)),
      ...(components.length?{components:Object.freeze(components.map(parseComponent))}:{}),
    });
  });
  const fieldKeys = parsedSections.flatMap(section => section.fields.map(field => field.key));
  if (new Set(fieldKeys).size !== fieldKeys.length || fieldKeys.length < 1 || fieldKeys.length > 200) throw new TypeError("Published Supplier request form field keys are invalid");
  const hash = text(definition.hash, "definition hash", 64), releaseId = text(definition.releaseId, "definition release", 64), version = definition.version;
  if (!/^[a-f0-9]{64}$/.test(hash) || !uuidPattern.test(releaseId) || !Number.isSafeInteger(version) || Number(version) < 1) throw new TypeError("Published Supplier request form release is invalid");
  return Object.freeze({
    definition: Object.freeze({ code: code(definition.code, "definition code"), version: Number(version), hash, releaseId }),
    descriptor: Object.freeze({
      schema: descriptor.schema,
      version: text(descriptor.version, "descriptor version", 32),
      title: text(descriptor.title, "form title", 160),
      description: text(descriptor.description, "form description", 500),
      sections: Object.freeze(parsedSections),
      submitLabel: text(descriptor.submitLabel, "submit label", 80),
    }),
  });
}

export function isRequestFieldVisible(field: RequestFormField, values: Readonly<Record<string, unknown>>): boolean {
  const rule = field.visibility;
  if (!rule) return true;
  const current = values[rule.field];
  if (rule.operator === "equals") return current === rule.value;
  if (rule.operator === "not_equals") return current !== rule.value;
  return Boolean(rule.values?.includes(current as string | boolean | number));
}

export function requestFormDefaults(descriptor: RequestFormDescriptor): Readonly<Record<string, string | boolean | number>> {
  return Object.freeze(Object.fromEntries(descriptor.sections.flatMap(section => section.fields.filter(field => field.defaultValue !== undefined).map(field => [field.key, field.defaultValue!]))));
}

export function serializeRequestForm(descriptor: RequestFormDescriptor, data: FormData, options: { includeEmpty?: boolean } = {}): Readonly<{
  operatingOrganizationId: string;
  proposedPayload: Readonly<Record<string, unknown>>;
}> {
  const current = Object.fromEntries(data.entries()), proposed: Record<string, unknown> = { partnerCategory: "organization" }, tenantFields: Record<string, unknown> = {};
  let operatingOrganizationId = "";
  for (const field of descriptor.sections.flatMap(section => section.fields)) {
    if (!isRequestFieldVisible(field, current)) continue;
    const raw = field.widget === "checkbox" ? data.has(field.key) : data.get(field.key);
    if (raw === null || raw === "") {
      if (options.includeEmpty && field.target === "canonical") proposed[field.path] = null;
      continue;
    }
    let value: unknown = field.widget === "checkbox" ? data.has(field.key) : String(raw);
    if (field.widget === "integer") value = Number.parseInt(String(raw), 10);
    if (field.widget === "decimal") value = Number(String(raw));
    if (field.normalize === "uppercase") value = String(value).toUpperCase();
    if (field.normalize === "lowercase") value = String(value).toLowerCase();
    if (field.target === "context") {
      if (field.path === "operatingOrganizationId") operatingOrganizationId = String(value);
      continue;
    }
    if (field.target === "request_only") tenantFields[field.path] = value;
    else proposed[field.path] = value;
  }
  if (Object.keys(tenantFields).length || options.includeEmpty) proposed.tenantFields = tenantFields;
  return Object.freeze({ operatingOrganizationId, proposedPayload: Object.freeze(proposed) });
}

function parseField(value: unknown): RequestFormField {
  const field = record(value), widget = enumeration(field.widget, ["text", "textarea", "url", "date", "password", "integer", "decimal", "checkbox", "lookup", "operating_organization"] as const, "field widget"), target = enumeration(field.target, ["context", "canonical", "request_only"] as const, "field target");
  const lookup = field.lookup === undefined ? undefined : parseLookup(field.lookup);
  if (widget === "lookup" && !lookup) throw new TypeError("Lookup fields require published options");
  const required = field.required;
  if (typeof required !== "boolean") throw new TypeError("Form field required must be boolean");
  return Object.freeze({
    key: code(field.key, "field key"), path: path(field.path), target, label: text(field.label, "field label", 160), widget, required,
    ...(field.helpText === undefined ? {} : { helpText: text(field.helpText, "field help", 2_000) }),
    ...(field.placeholder === undefined ? {} : { placeholder: text(field.placeholder, "field placeholder", 256) }),
    ...(typeof field.defaultValue === "string" || typeof field.defaultValue === "boolean" || typeof field.defaultValue === "number" ? { defaultValue: field.defaultValue } : {}),
    ...optionalPositive(field.maxLength, "maxLength"), ...optionalPositive(field.columnSpan, "columnSpan"),
    ...(field.autoComplete === undefined ? {} : { autoComplete: text(field.autoComplete, "autocomplete", 80) }),
    ...(field.normalize === "uppercase" || field.normalize === "lowercase" ? { normalize: field.normalize } : {}),
    ...(field.visibility === undefined ? {} : { visibility: parseVisibility(field.visibility) }), ...(lookup ? { lookup } : {}),
  });
}

function parseLookup(value: unknown) { const lookup=record(value),options=array(lookup.options,"lookup options");if(options.length>500)throw new TypeError("Lookup has too many options");return Object.freeze({code:code(lookup.code,"lookup code"),options:Object.freeze(options.map(candidate=>{const option=record(candidate);return Object.freeze({value:text(option.value,"lookup value",200),label:text(option.label,"lookup label",200)});} ))}); }
function parseComponent(value:unknown):RequestFormRepeatableComponent{const item=record(value),kind=enumeration(item.kind,["addresses","contacts"]as const,"component kind"),lookups=record(item.lookups),purposes=parseOptions(lookups.purposes,"component purposes"),countries=lookups.countries===undefined?undefined:parseOptions(lookups.countries,"component countries"),channels=lookups.channels===undefined?undefined:parseOptions(lookups.channels,"component channels"),minItems=positive(item.minItems,"component minItems",0),maxItems=positive(item.maxItems,"component maxItems",1);if(maxItems>20||minItems>maxItems||kind==="addresses"&&!countries||kind==="contacts"&&!channels)throw new TypeError("Repeatable component bounds or lookups are invalid");if(typeof item.requirePrimary!=="boolean")throw new TypeError("Repeatable component requirePrimary must be boolean");return Object.freeze({key:code(item.key,"component key"),kind,title:text(item.title,"component title",160),addLabel:text(item.addLabel,"component add label",80),minItems,maxItems,requirePrimary:item.requirePrimary,lookups:Object.freeze({...(countries?{countries}:{}),purposes,...(channels?{channels}:{})})});}
function parseOptions(value:unknown,name:string){const items=array(value,name);if(items.length<1||items.length>500)throw new TypeError(`${name} is invalid`);return Object.freeze(items.map(candidate=>{const item=record(candidate);return Object.freeze({value:text(item.value,`${name} value`,200),label:text(item.label,`${name} label`,200)});}));}
function parseVisibility(value:unknown):RequestFormVisibility{const rule=record(value),operator=enumeration(rule.operator,["equals","not_equals","in"]as const,"visibility operator");return Object.freeze({field:code(rule.field,"visibility field"),operator,...(rule.value===undefined?{}:{value:scalar(rule.value)}),...(rule.values===undefined?{}:{values:Object.freeze(array(rule.values,"visibility values").map(scalar))})});}
function scalar(value:unknown):string|boolean|number{if(typeof value!=="string"&&typeof value!=="boolean"&&typeof value!=="number")throw new TypeError("Visibility value must be scalar");return value;}
function optionalPositive(value:unknown,name:string){if(value===undefined)return{};if(!Number.isSafeInteger(value)||Number(value)<1)throw new TypeError(`${name} must be positive`);return{[name]:Number(value)};}
function positive(value:unknown,name:string,minimum:number):number{if(!Number.isSafeInteger(value)||Number(value)<minimum)throw new TypeError(`${name} is invalid`);return Number(value);}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw new TypeError("Published request form must be an object");return value as Record<string,unknown>;}
function array(value:unknown,name:string):readonly unknown[]{if(!Array.isArray(value))throw new TypeError(`${name} must be an array`);return value;}
function text(value:unknown,name:string,max:number):string{if(typeof value!=="string"||!value.trim()||value.length>max)throw new TypeError(`${name} is invalid`);return value;}
function code(value:unknown,name:string):string{const result=text(value,name,127);if(!/^[a-z][a-zA-Z0-9_.-]{0,126}$/.test(result))throw new TypeError(`${name} is invalid`);return result;}
function path(value:unknown):string{const result=code(value,"field path");if(result.includes("__proto__")||result.includes("constructor")||result.includes("prototype"))throw new TypeError("field path is unsafe");return result;}
function enumeration<T extends string>(value:unknown,allowed:readonly T[],name:string):T{if(typeof value!=="string"||!allowed.includes(value as T))throw new TypeError(`${name} is invalid`);return value as T;}
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
