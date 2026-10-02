import { parseEntityFormSections, type EntityFormSectionV1 } from './form-sections';
export interface EntityFormPresentationV1 {
  readonly meaningfulFields?: readonly string[];
  readonly schemaVersion: 1;
  readonly create: EntityFormModePresentationV1;
  readonly edit: EntityFormModePresentationV1;
}
export interface EntityFormModePresentationV1 {
  readonly sections: readonly EntityFormSectionV1[];
  readonly submitLabel: string;
  readonly help: Readonly<Record<string, string>>;
}
/** Explicit input layouts are exhaustive. Missing fields cannot silently appear
 * after a schema upgrade; server authorization still prunes every projection. */
export function parseEntityFormPresentation(value: unknown, fieldKeys: readonly string[]): EntityFormPresentationV1 {
  const root = object(value);
  if (root.schemaVersion !== 1 || Object.keys(root).some(key => !['schemaVersion','create','edit','meaningfulFields'].includes(key))) throw TypeError('Invalid form presentation');
  const mode = (value: unknown): EntityFormModePresentationV1 => {
    const item = object(value);
    if (Object.keys(item).some(key => !['sections','submitLabel','help'].includes(key))) throw TypeError('Invalid form mode presentation');
    const sections = parseEntityFormSections(item.sections, fieldKeys);
    if (!sections?.length) throw TypeError('Form presentation requires sections');
    const admitted = new Set(sections.flatMap(section => section.fields));
    const help = Object.fromEntries(Object.entries(item.help === undefined ? {} : object(item.help)).map(([key,value]) => {
      if (!admitted.has(key)) throw TypeError('Invalid form help field');
      return [key, text(value, 500)];
    }));
    return Object.freeze({ sections, submitLabel: text(item.submitLabel,80), help: Object.freeze(help) });
  };
  const create = mode(root.create), edit = mode(root.edit);
  const meaningfulFields = root.meaningfulFields;
  if (meaningfulFields !== undefined && (!Array.isArray(meaningfulFields) || !meaningfulFields.length || new Set(meaningfulFields).size !== meaningfulFields.length || meaningfulFields.some(field => typeof field !== 'string' || !create.sections.some(section => section.fields.includes(field))))) throw TypeError('Invalid meaningful create fields');
  return Object.freeze({schemaVersion:1,create,edit,...(meaningfulFields ? { meaningfulFields: Object.freeze([...meaningfulFields]) as readonly string[] } : {})});
}
function object(value: unknown): Record<string,unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw TypeError('Invalid form presentation object'); return value as Record<string,unknown>; }
function text(value: unknown, max: number): string { if(typeof value !== 'string' || !value.trim() || value.length > max) throw TypeError('Invalid form presentation text'); return value; }

/** False and zero are meaningful overrides; whitespace, null and omitted values are not. */
export function meaningfulFormInput(values: Readonly<Record<string, unknown>>, fields: readonly string[]): boolean {
  return fields.some(field => { const value = values[field]; return value !== null && value !== undefined && (typeof value !== 'string' || value.trim().length > 0); });
}
